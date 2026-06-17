"""Drive the LED daemon from the keyboard's volume keys.

The kiosk keyboard's media keys are the kiosk's only physical control surface
(this replaces the removed VL53L0X proximity input). Mapping:

    Vol+            scanner faster
    Vol-            scanner slower
    Shift + Vol+    brighter
    Shift + Vol-    dimmer
    Mute            pause / resume the scanner

Each press is sent as a fire-and-forget UDP control message to `manage.py leds`
(same channel as printer/leds.py). Runs as systemd service divd-volkeys.

Wrinkles handled:
  * Shift and the volume keys land on DIFFERENT evdev devices on this keyboard
    (the main keyboard vs. its "Consumer Control" HID), so we read every
    keyboard device and track Shift globally across them.
  * A single volume press can surface on two devices at once; a short per-key
    debounce (DEDUP_S) collapses those into one action, while genuine key
    autorepeat (~33ms apart) still passes through so holding a key ramps.
  * vc4-hdmi audio controls also advertise the volume keycodes — we skip them
    by name and only bind the keyboard (DEVICE_NAME_PREFIX).
"""

from __future__ import annotations

import select
import time

from django.core.management.base import BaseCommand

from printer import leds as led_signal

DEVICE_NAME_PREFIX = "HATOR"   # the kiosk keyboard; skips vc4-hdmi audio controls
DEDUP_S = 0.025                # collapse the same key arriving on two devices
RETRY_S = 5                    # wait before rescanning when no keyboard is found


class Command(BaseCommand):
    help = "Read the keyboard volume keys and drive the LED daemon."

    def handle(self, *args, **opts):
        import evdev  # noqa: PLC0415 — only needed on the Pi
        from evdev import ecodes as e  # noqa: PLC0415

        VOL_UP, VOL_DN, MUTE = e.KEY_VOLUMEUP, e.KEY_VOLUMEDOWN, e.KEY_MUTE
        SHIFTS = {e.KEY_LEFTSHIFT, e.KEY_RIGHTSHIFT}
        ACTIONS = {VOL_UP, VOL_DN, MUTE}

        def open_devices():
            devs = []
            for path in evdev.list_devices():
                try:
                    d = evdev.InputDevice(path)
                except OSError:
                    continue
                if not d.name.startswith(DEVICE_NAME_PREFIX):
                    continue
                caps = set(d.capabilities().get(e.EV_KEY, []))
                if caps & (ACTIONS | SHIFTS):
                    devs.append(d)
            return devs

        shift_held = set()   # currently-held shift keycodes (across all devices)
        last_fire = {}       # keycode -> monotonic of last fired action

        while True:
            devs = open_devices()
            if not devs:
                self.stderr.write(
                    f"no '{DEVICE_NAME_PREFIX}*' keyboard with volume keys; "
                    f"retry in {RETRY_S}s"
                )
                time.sleep(RETRY_S)
                continue

            self.stdout.write(self.style.SUCCESS(
                "volkeys up; reading: " + ", ".join(d.name for d in devs)
            ))
            fds = {d.fd: d for d in devs}
            try:
                while True:
                    ready, _, _ = select.select(fds, [], [])
                    for fd in ready:
                        for ev in fds[fd].read():
                            if ev.type != e.EV_KEY:
                                continue
                            code, val = ev.code, ev.value

                            if code in SHIFTS:
                                if val:           # press/repeat -> held
                                    shift_held.add(code)
                                else:             # release
                                    shift_held.discard(code)
                                continue

                            if code not in ACTIONS or val == 0:
                                continue          # ignore key-up
                            if code == MUTE and val != 1:
                                continue          # mute: one toggle per press

                            now = time.monotonic()
                            if now - last_fire.get(code, 0.0) < DEDUP_S:
                                continue          # cross-device duplicate
                            last_fire[code] = now

                            shifted = bool(shift_held)
                            if code == VOL_UP:
                                msg = "ctl:brighter" if shifted else "ctl:faster"
                            elif code == VOL_DN:
                                msg = "ctl:dimmer" if shifted else "ctl:slower"
                            else:
                                msg = "ctl:pause"
                            led_signal.signal(msg)
            except OSError as exc:
                # a device was unplugged / the keyboard re-enumerated — rescan
                self.stderr.write(f"input device error ({exc}); reopening")
                time.sleep(1)
