"""Send a one-shot control command to the LED daemon (manage.py leds).

For tweaking the strip over SSH without touching the volume keys, e.g.:

    /opt/venv/bin/python manage.py ledctl --brightness 0.6
    /opt/venv/bin/python manage.py ledctl --speed 1.4
    /opt/venv/bin/python manage.py ledctl --brighter
    /opt/venv/bin/python manage.py ledctl --pause

Fire-and-forget UDP, same channel as the web workers and the volume-key reader.
The daemon clamps + persists speed/brightness, so a value set here survives a
reboot. Does nothing (silently) if the daemon isn't running.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from printer import leds as led_signal


class Command(BaseCommand):
    help = "Send a control command (brightness/speed/pause) to the LED daemon."

    def add_arguments(self, parser):
        parser.add_argument("--brightness", type=float, help="absolute brightness 0.05–1.0")
        parser.add_argument("--speed", type=float, help="absolute sweep speed 0.3–2.2")
        parser.add_argument("--brighter", action="store_true", help="one step brighter")
        parser.add_argument("--dimmer", action="store_true", help="one step dimmer")
        parser.add_argument("--faster", action="store_true", help="one step faster")
        parser.add_argument("--slower", action="store_true", help="one step slower")
        parser.add_argument("--pause", action="store_true", help="toggle pause/resume")

    def handle(self, *args, **opts):
        msgs = []
        if opts["brightness"] is not None:
            msgs.append(f"ctl:brightness:{opts['brightness']}")
        if opts["speed"] is not None:
            msgs.append(f"ctl:speed:{opts['speed']}")
        if opts["brighter"]:
            msgs.append("ctl:brighter")
        if opts["dimmer"]:
            msgs.append("ctl:dimmer")
        if opts["faster"]:
            msgs.append("ctl:faster")
        if opts["slower"]:
            msgs.append("ctl:slower")
        if opts["pause"]:
            msgs.append("ctl:pause")

        if not msgs:
            raise CommandError(
                "nothing to do — pass e.g. --brightness 0.6, --speed 1.4, "
                "--brighter/--dimmer/--faster/--slower, or --pause"
            )

        for msg in msgs:
            led_signal.signal(msg)
        self.stdout.write(self.style.SUCCESS("sent: " + ", ".join(msgs)))
