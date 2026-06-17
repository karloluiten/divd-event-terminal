"""LED strip animation daemon for the DIVD kiosk.

Owns the WS2812B strip on SPI0 (DIN on pin 19 / GPIO 10) exclusively and runs
a continuous KITT-style scanner (Knight Rider): a yellow blob sweeping
left->right->left on a black background. Meant to run as a systemd service
(deploy/divd-leds.service). Fail-soft: if the strip/SPI library isn't present
the daemon keeps retrying init rather than crash-looping.

Two inputs drive it, both via UDP datagrams on LED_EVENT_HOST:LED_EVENT_PORT:
  * Control commands ("ctl:..."), from the volume-key reader (manage.py
    volkeys) and the SSH helper (manage.py ledctl): adjust sweep speed,
    brightness, or pause. Speed + brightness persist to LED_STATE_FILE so they
    survive a restart/reboot. (This replaces the old VL53L0X proximity input.)
  * On-screen events (bare effect names from the web workers, see
    printer/leds.py): each recolours the scanner for a couple of seconds, then
    it eases back to DIVD yellow.

Run manually for a demo:  /opt/venv/bin/python manage.py leds
"""

from __future__ import annotations

import json
import os
import signal
import socket
import time

from django.conf import settings
from django.core.management.base import BaseCommand

# DIVD brand yellow (warm amber). Tweak here if the hue looks off.
YELLOW = (255, 176, 0)

# Sweep speed (phase units/sec; 1.0 = one end-to-end traverse). Adjusted live
# by the volume keys (manage.py volkeys) within [MIN_SPEED, MAX_SPEED] and
# persisted; DEFAULT_SPEED is used the first time, before any state is saved.
MIN_SPEED = 0.3       # ~3.3s per traverse (slowest)
MAX_SPEED = 2.2       # ~0.45s per traverse (fastest)
DEFAULT_SPEED = 0.9   # ~1.1s per traverse
SPEED_STEP = 0.2      # how much one Vol+/Vol- press changes the target
SPEED_EASE = 3.0      # how fast actual speed chases the target (per second)

# Brightness: live-adjustable (Shift+Vol+/- or `ledctl --brightness`) within
# [MIN_BRIGHTNESS, MAX_BRIGHTNESS]; first run defaults to settings.LED_BRIGHTNESS.
MIN_BRIGHTNESS = 0.05
MAX_BRIGHTNESS = 1.0
BRIGHTNESS_STEP = 0.1

BLOB_WIDTH = 4.5    # half-width of the glow, in LEDs (bigger = wider blob)
OVERSHOOT = 4.5     # how far (LEDs) the centre travels past each end, so the
                    # blob runs off the strip a touch before sweeping back
COLOR_HOLD = 2.5    # seconds an event colour holds before easing back to yellow
RAINBOW_HOLD = 3.5
COLOR_EASE = 6.0    # how fast the blob colour chases its target (per second);
                    # guarantees a smooth settle back to YELLOW after any effect

FPS = 60
FRAME = 1.0 / FPS

# Effect name -> scanner colour. An (r,g,b) tuple, or "rainbow" to cycle hue.
# "print"/"image" come from the web views; the rest from frontend easter-eggs
# hitting /led. Unknown names fall back to white.
EVENT_COLORS = {
    "print": (60, 255, 90),     # idea printed -> hacker green
    "image": "rainbow",         # easter-egg image -> rainbow cycle
    "flash": (255, 255, 255),
    "konami": (255, 0, 200),
    "fireworks": "rainbow",
    "wannacry": (255, 30, 30),  # ransomware prank -> red
    "matrix": (0, 255, 60),     # matrix rain -> green
    "glitch": (0, 200, 255),    # datamosh -> cyan
    # full-screen gimmicks (fired from the kiosk frontend, see terminal.js)
    "bsod": (40, 90, 255),      # blue screen of death -> blue
    "update": (170, 60, 255),   # fake OS update -> purple
    "msf": (255, 30, 30),       # metasploit -> red
    "breakout": (255, 60, 60),  # breakout-defense red flash -> red
    "crt": (255, 255, 255),     # CRT power-off blip -> white
    "bounce": (255, 255, 255),  # DVD bounce -> white
    "defrag": (0, 200, 255),    # defrag/memtest -> cyan
    "lacewing": (255, 176, 0),  # Project Lacewing -> DIVD yellow
    "hack": (60, 255, 90),      # "hack the planet" -> green
}
DEFAULT_COLOR = (255, 255, 255)


def _scale(color, f):
    return (int(color[0] * f), int(color[1] * f), int(color[2] * f))


def _wheel(pos):
    """0..1 -> rainbow (r, g, b)."""
    pos = (pos % 1.0) * 255
    if pos < 85:
        return (int(pos * 3), int(255 - pos * 3), 0)
    if pos < 170:
        pos -= 85
        return (int(255 - pos * 3), 0, int(pos * 3))
    pos -= 170
    return (0, int(pos * 3), int(255 - pos * 3))


def _lerp(a, b, t):
    return a + (b - a) * t


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _parse_float(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def _state_path():
    return getattr(
        settings, "LED_STATE_FILE",
        "/home/divd/.local/state/divdprint/led-state.json",
    )


def load_state():
    """Restore the last speed + brightness, or fall back to the defaults.
    Never raises — a missing/garbage file just yields the defaults."""
    speed, brightness = DEFAULT_SPEED, settings.LED_BRIGHTNESS
    try:
        with open(_state_path()) as f:
            data = json.load(f)
        speed = _clamp(float(data["speed"]), MIN_SPEED, MAX_SPEED)
        brightness = _clamp(float(data["brightness"]), MIN_BRIGHTNESS, MAX_BRIGHTNESS)
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return speed, brightness


def save_state(speed, brightness):
    """Atomically persist speed + brightness. Never raises (fail-soft)."""
    path = _state_path()
    tmp = path + ".tmp"
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(tmp, "w") as f:
            json.dump({"speed": round(speed, 3), "brightness": round(brightness, 3)}, f)
        os.replace(tmp, path)
    except OSError:
        pass


def position(phase, n):
    """Triangle-wave bounce -> blob centre, overshooting each end by OVERSHOOT
    so the blob runs off the strip a little at the turnarounds."""
    tri = phase % 2.0
    tri = tri if tri <= 1.0 else 2.0 - tri
    return tri * (n - 1 + 2 * OVERSHOOT) - OVERSHOOT


def render_kitt(frame, n, pos, color):
    """A single glowing blob centred at float index `pos` on a black field."""
    for i in range(n):
        b = 1.0 - abs(i - pos) / BLOB_WIDTH
        if b > 0:
            frame[i] = _scale(color, b * b)  # squared falloff = crisper head


class Command(BaseCommand):
    help = "Run the LED strip animation daemon (KITT scanner + controls + events)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--once", type=str, default=None,
            help="Hold one event colour (e.g. print/image/konami) for a few "
                 "seconds on the scanner, then exit — for testing.",
        )

    def handle(self, *args, **opts):
        n = settings.LED_COUNT
        pixels = self._init_strip(n)

        # systemd stops us with SIGTERM (shutdown / `systemctl stop`), not
        # SIGINT — route it through the same KeyboardInterrupt cleanup so the
        # strip is turned off instead of frozen on its last frame.
        def _term(*_):
            raise KeyboardInterrupt
        signal.signal(signal.SIGTERM, _term)

        if opts["once"]:
            self._demo_once(pixels, n, opts["once"])
            return

        sock = self._listener()
        target_speed, brightness = load_state()
        pixels.brightness = brightness
        paused = False

        phase = 0.0
        speed = 0.0          # eased toward target_speed (or 0 while paused)
        override = None      # (colour_value, until_monotonic) or None == yellow
        cur_color = list(YELLOW)  # eased toward the target colour each frame
        last = time.monotonic()
        self.stdout.write(self.style.SUCCESS(
            f"LED daemon up: {n} LEDs, KITT scanner; speed={target_speed:.1f} "
            f"brightness={brightness:.2f}; control on "
            f"{settings.LED_EVENT_HOST}:{settings.LED_EVENT_PORT}"
        ))
        try:
            while True:
                now = time.monotonic()
                dt = now - last
                last = now

                effect = None
                dirty = False
                for msg in self._drain(sock):
                    if msg.startswith("ctl:"):
                        cmd = msg[4:]
                        if cmd == "faster":
                            target_speed = _clamp(target_speed + SPEED_STEP, MIN_SPEED, MAX_SPEED)
                            dirty = True
                        elif cmd == "slower":
                            target_speed = _clamp(target_speed - SPEED_STEP, MIN_SPEED, MAX_SPEED)
                            dirty = True
                        elif cmd == "pause":
                            paused = not paused
                        elif cmd == "brighter":
                            brightness = _clamp(brightness + BRIGHTNESS_STEP, MIN_BRIGHTNESS, MAX_BRIGHTNESS)
                            pixels.brightness = brightness
                            dirty = True
                        elif cmd == "dimmer":
                            brightness = _clamp(brightness - BRIGHTNESS_STEP, MIN_BRIGHTNESS, MAX_BRIGHTNESS)
                            pixels.brightness = brightness
                            dirty = True
                        elif cmd.startswith("speed:"):
                            v = _parse_float(cmd[len("speed:"):])
                            if v is not None:
                                target_speed = _clamp(v, MIN_SPEED, MAX_SPEED)
                                dirty = True
                        elif cmd.startswith("brightness:"):
                            v = _parse_float(cmd[len("brightness:"):])
                            if v is not None:
                                brightness = _clamp(v, MIN_BRIGHTNESS, MAX_BRIGHTNESS)
                                pixels.brightness = brightness
                                dirty = True
                        # unknown ctl: ignored
                    else:
                        effect = msg  # last bare name wins as the event colour

                if effect:
                    val = EVENT_COLORS.get(effect, DEFAULT_COLOR)
                    hold = RAINBOW_HOLD if val == "rainbow" else COLOR_HOLD
                    override = (val, now + hold)
                if override and now >= override[1]:
                    override = None

                if dirty:
                    save_state(target_speed, brightness)

                # ease the sweep toward the target (0 while paused -> blob halts)
                goal = 0.0 if paused else target_speed
                speed += (goal - speed) * min(1.0, dt * SPEED_EASE)

                phase += speed * dt
                pos = position(phase, n)

                # Ease the blob colour toward its target (the event colour while
                # an override holds, else DIVD yellow) so it always settles back
                # to the yellow left-right-left KITT sweep after every effect.
                target = self._color(override, now)
                k = min(1.0, dt * COLOR_EASE)
                cur_color = [cur_color[i] + (target[i] - cur_color[i]) * k for i in range(3)]
                color = tuple(int(c) for c in cur_color)

                frame = [(0, 0, 0)] * n
                render_kitt(frame, n, pos, color)
                for i in range(n):
                    pixels[i] = frame[i]
                pixels.show()
                time.sleep(FRAME)
        except KeyboardInterrupt:
            self._clear(pixels, n)
            self.stdout.write("\nLED daemon stopped; strip cleared")

    # -- helpers ----------------------------------------------------------- #
    def _color(self, override, now):
        if not override:
            return YELLOW
        val = override[0]
        return _wheel(now * 0.5) if val == "rainbow" else val

    def _init_strip(self, n):
        """Open the strip, retrying forever so a boot-order race self-heals."""
        delay = 5
        while True:
            try:
                import board  # noqa: PLC0415 — optional hw dep, Pi-only
                import neopixel_spi as neopixel  # noqa: PLC0415

                return neopixel.NeoPixel_SPI(
                    board.SPI(), n, brightness=settings.LED_BRIGHTNESS,
                    auto_write=False, pixel_order=neopixel.GRB,
                )
            except Exception as exc:  # noqa: BLE001 — log and retry, never crash
                self.stderr.write(f"strip init failed ({exc}); retry in {delay}s")
                time.sleep(delay)

    def _listener(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((settings.LED_EVENT_HOST, settings.LED_EVENT_PORT))
        sock.setblocking(False)
        return sock

    def _drain(self, sock):
        """Read all pending datagrams; return them in arrival order (so every
        control command is applied, not just the last)."""
        msgs = []
        while True:
            try:
                data, _ = sock.recvfrom(64)
            except (BlockingIOError, OSError):
                break
            name = data.decode("ascii", "ignore").strip()
            if name:
                msgs.append(name)
        return msgs

    def _demo_once(self, pixels, n, event):
        """Hold one event colour on a slow scanner for a few seconds."""
        val = EVENT_COLORS.get(event, DEFAULT_COLOR)
        dur = RAINBOW_HOLD if val == "rainbow" else COLOR_HOLD
        phase = 0.0
        last = time.monotonic()
        end = last + dur
        while (now := time.monotonic()) < end:
            dt = now - last
            last = now
            phase += DEFAULT_SPEED * dt
            color = _wheel(now * 0.5) if val == "rainbow" else val
            frame = [(0, 0, 0)] * n
            render_kitt(frame, n, position(phase, n), color)
            for i in range(n):
                pixels[i] = frame[i]
            pixels.show()
            time.sleep(FRAME)
        self._clear(pixels, n)

    def _clear(self, pixels, n):
        for i in range(n):
            pixels[i] = (0, 0, 0)
        pixels.show()
