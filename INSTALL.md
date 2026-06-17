# Installing the DIVD Event Terminal

These steps target a **Raspberry Pi 5 running Raspberry Pi OS (Bookworm, 64-bit)**.
The kiosk is designed to live at `/opt/divdprint` with its virtualenv at
`/opt/venv`, and to run as the unprivileged `divd` user.

> The installer is **idempotent** — safe to re-run. It does *not* purge the
> desktop on its own (see `deploy/remove-desktop.sh` for that).

## 1. Prerequisites

- Raspberry Pi 5 + Epson TM-T20III over USB (shows up as `/dev/usb/lp0`)
- Optional: WS2812B LED strip on SPI0 MOSI (pin 19)
- Packages: `git`, `python3`, `python3-venv`, and for the display
  `cage`, `chromium-browser` (the kiosk runs chromium under the cage Wayland
  compositor — see `deploy/install-cage.sh`)

## 2. Get the code

```bash
sudo mkdir -p /opt && sudo chown "$USER" /opt
git clone git@github.com:karloluiten/divd-event-terminal.git /opt/divdprint
cd /opt/divdprint
```

## 3. Create the virtualenv and install dependencies

```bash
python3 -m venv /opt/venv
/opt/venv/bin/pip install --upgrade pip
/opt/venv/bin/pip install -r requirements.txt
```

The LED dependencies (`Adafruit-Blinka`, `rpi_ws281x`, …) are Pi-specific and
will only fully work on real hardware; the web app itself runs fine without them.

## 4. Configure secrets

Secrets are read from a gitignored `.env` at the repo root.

```bash
cp .env.example .env
# generate a fresh Django secret key:
/opt/venv/bin/python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

Edit `.env` and set:

```ini
SECRET_KEY=<the generated key>
KIOSK_SHUTDOWN_PASSWORD=<password for /shutdown and /reboot>
KIOSK_ADMIN_PASSWORD=<password for the /admin wifi + shell console>
```

`settings.py` raises `ImproperlyConfigured` at startup if any of these are
missing, so the app won't silently run without them.

## 5. Run the installer

```bash
sudo bash deploy/install.sh
```

This (see the script for the authoritative list):

1. Adds `divd` to the `lp` group for printer access.
2. Runs `manage.py migrate` and `collectstatic` in the venv.
3. Installs and enables the systemd units:
   - **`divd-print.service`** — gunicorn on `0.0.0.0:8000` (the Django app).
   - **`divd-kiosk.service`** — cage + chromium full-screen onto the display.
4. Installs the sudoers fragments (`/admin` nmcli verbs; `/shutdown` poweroff/reboot).
5. Enables a `getty@tty3` escape hatch and switches the boot target to
   `multi-user.target` (no display manager).

Peripherals (LED strip daemon, volume-key handler, boot-hello receipt) are set up
separately by `deploy/install-peripherals.sh`.

## 6. Verify

```bash
systemctl status divd-print.service        # gunicorn up
curl -s localhost:8000/stats               # -> {"count": N}
```

Then browse to `http://<pi-ip>:8000/` from another machine on the LAN. The kiosk
screen should already be showing the terminal UI after the install restarts
`divd-kiosk.service`.

## Updating a running unit

After pulling code changes:

```bash
cd /opt/divdprint && git pull
/opt/venv/bin/python manage.py collectstatic --noinput
sudo systemctl restart divd-print.service     # + divd-kiosk.service if templates/JS changed
```

> Note: `deploy/apply-updates.sh` does a fuller refresh but also **prints two
> physical test receipts** each run — use the `collectstatic` + restart above for
> code-only changes.

## Common settings (`divdprint/settings.py`)

| Setting | Default | Notes |
|---------|---------|-------|
| `PRINTER_DEVICE` | `/dev/usb/lp0` | the thermal printer device node |
| `LED_COUNT` | `15` | WS2812B LED count |
| `BOOT_TO_SHELL_FLAG` | `/home/divd/.boot-to-shell` | when present at boot, drops to a login shell instead of the kiosk |
| `ALLOWED_HOSTS` | `['*']` | gunicorn binds `0.0.0.0`; the app is reachable by anyone on the LAN |
