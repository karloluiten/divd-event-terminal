"""Fire-and-forget LED effect events from the web workers to the LED daemon.

The WS2812B strip is owned by a single dedicated process (`manage.py leds`)
because gunicorn runs multiple workers and SPI is a single hardware resource.
Web workers never touch the strip directly — they just send a small UDP
datagram naming an effect. UDP is connectionless, so this never blocks a
request and silently does nothing when the daemon isn't running (fail-soft:
the lights are decorative and must never break a print).
"""

from __future__ import annotations

import socket

from django.conf import settings

_sock: socket.socket | None = None


def signal(effect: str) -> None:
    """Best-effort: ask the LED daemon to play `effect`. Never raises.

    `effect` is a short name the daemon knows (e.g. "print", "image") — an
    unknown name just triggers the daemon's generic flash.
    """
    global _sock
    try:
        if _sock is None:
            _sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            _sock.setblocking(False)
        _sock.sendto(
            effect.encode("ascii", "ignore")[:32],
            (settings.LED_EVENT_HOST, settings.LED_EVENT_PORT),
        )
    except OSError:
        # daemon down / socket buffer full / no network stack — ignore, the
        # lights are decorative and must never break a print.
        pass
