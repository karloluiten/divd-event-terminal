#!/usr/bin/env bash
# Switch the DIVD kiosk from X11 to a Wayland 'cage' kiosk (Pi 5 native path).
# Run as root:  sudo bash /opt/divdprint/deploy/install-cage.sh
# Requires internet (to apt-install cage). Idempotent.
set -euo pipefail
DEPLOY=/opt/divdprint/deploy
if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi

echo "==> Installing cage (Wayland kiosk compositor)"
if ! command -v cage >/dev/null; then
    apt-get update -y
    apt-get install -y cage
fi
command -v cage >/dev/null || { echo "ERROR: cage not installed (no internet?)"; exit 1; }

chmod +x "$DEPLOY/chromium-wayland.sh"

# Swap the kiosk unit to the cage variant (same unit name keeps enable links).
systemctl stop divd-kiosk.service 2>/dev/null || true
install -m 0644 "$DEPLOY/divd-kiosk-cage.service" /etc/systemd/system/divd-kiosk.service
systemctl daemon-reload

# Make sure the backend is up, then start the kiosk.
systemctl restart divd-print.service
for i in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:8000/ && break; sleep 1; done
systemctl restart divd-kiosk.service
sleep 5

# LED daemon, volume-key control, cursor hide, boot-to-shell.
bash "$DEPLOY/install-peripherals.sh"

echo "==> kiosk active? : $(systemctl is-active divd-kiosk.service)"
echo "==> If it crash-loops, see:  journalctl -u divd-kiosk -b --no-pager -n 60"
echo "==> The kiosk should now be on the HDMI monitor (cage + chromium)."
