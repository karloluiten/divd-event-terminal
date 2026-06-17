# DIVD Event Terminal

A Raspberry Pi 5 **kiosk that prints your ideas on a thermal receipt printer**,
built for DIVD (Dutch Institute for Vulnerability Disclosure) event booths. Type
an idea at the terminal, hit enter, and it prints on an Epson TM-T20III — with a
deliberately over-the-top "hacker terminal" aesthetic (tmux panes, a fake
`htop`, a glitching DIVD logo) and a pile of easter eggs.

> **Live demo:** a static, backend-less preview of the kiosk UI is published via
> GitHub Pages → **https://karloluiten.github.io/divd-event-terminal/**
> The client-side eggs work; printing, stats, LEDs and wifi do not (there's no
> server or printer behind it). See [the demo notes](#web-demo) below.

## What it does

- **Idea collector** — every submission is stored (`Idea` model) and printed as a
  receipt: DIVD logo header, the idea body, an `IDEA No. NNNN` counter, footer.
- **Easter-egg print modes** — `/comicsans`, `/big`, `/tiny`, `/leet`, `/qr`,
  `/barcode`, `/wanted`, `/glitch`, `/lacewing`, … picked from a slash menu.
- **Every 4th receipt** prints bonus ASCII art or a dithered cat photo.
- **Kiosk UI** — full-screen tmux look: terminal pane, fake `htop` (red "attacker"
  processes + green Lacewing "defender" processes), glitchy logo, status bar with
  a live idea counter and clock. Escape attempts (Alt-Tab/F11/VT-switch) are
  blocked and flash a cheeky warning.
- **Peripherals** — a WS2812B LED strip reacts to events; the volume keys adjust
  LED speed/brightness with an on-screen OSD.
- **Hidden admin** — password-gated `/shutdown`, `/reboot`, and an `/admin` wifi
  console (nmcli) + login-terminal escape hatch.

## Hardware

- Raspberry Pi 5 (runs the display via **cage**/Wayland + chromium kiosk)
- Epson TM-T20III thermal printer (USB, appears as `/dev/usb/lp0`)
- WS2812B / NeoPixel LED strip (15 LEDs, SPI0 MOSI / pin 19)

## Tech

Django 6 + gunicorn, SQLite, WhiteNoise for static, Pillow/qrcode for receipt
rendering, Adafruit Blinka + `rpi_ws281x` for the LEDs. Python 3.13.

## Repository layout

| Path | What |
|------|------|
| `divdprint/` | Django project (settings, urls, wsgi) |
| `printer/` | the app: `Idea` model, views, print pipeline (`printing.py`), LEDs (`leds.py`), management commands |
| `templates/`, `static/`, `assets/` | kiosk page, JS/CSS/fonts, server-side fonts + cat photos |
| `deploy/` | systemd units, installer scripts, sudoers, Wayland/X configs |
| `docs/` | generated static GitHub Pages demo (built by `deploy/build-pages.py`) |
| `STATUS.md` | detailed running build log / on-device notes |

## Setup

See **[INSTALL.md](INSTALL.md)** for the full on-device install. In short: clone
to `/opt/divdprint`, create the `/opt/venv` virtualenv, copy `.env.example` to
`.env` and fill in the secrets, then run `sudo bash deploy/install.sh`.

## Configuration & secrets

Secrets are **not** committed. `divdprint/settings.py` loads them from a
gitignored `.env` at the repo root (see `.env.example`):

| Key | Purpose |
|-----|---------|
| `SECRET_KEY` | Django secret key |
| `KIOSK_SHUTDOWN_PASSWORD` | unlocks the hidden `/shutdown` and `/reboot` commands |
| `KIOSK_ADMIN_PASSWORD` | unlocks the `/admin` wifi + shell console |

## Web demo

`deploy/build-pages.py` renders the kiosk page, rewrites asset paths to be
repo-relative, and injects a small shim that fakes the JSON endpoints so the page
runs with no server. Rebuild it with:

```bash
python deploy/build-pages.py   # regenerates docs/
```

GitHub Pages serves the result from the `docs/` folder on `main`. The demo is a
visual preview only — nothing prints, and the admin/shutdown commands are
disabled.
