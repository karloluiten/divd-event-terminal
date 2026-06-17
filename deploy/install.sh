#!/usr/bin/env bash
# DIVD kiosk installer — run as root:  sudo bash /opt/divdprint/deploy/install.sh
# Idempotent: safe to re-run. Does NOT purge the desktop (see remove-desktop.sh).
set -euo pipefail

REPO=/opt/divdprint
DEPLOY=$REPO/deploy
VENV=/opt/venv
KUSER=divd

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi
echo "==> DIVD kiosk install starting"

# 1. Printer access for the unprivileged service user.
if id -nG "$KUSER" | grep -qw lp; then
    echo "==> $KUSER already in 'lp' group"
else
    usermod -aG lp "$KUSER"; echo "==> added $KUSER to 'lp' group"
fi

# 2. Make the X client script executable.
chmod +x "$DEPLOY/xinitrc-kiosk"

# 3. X server hardening + the Xorg.wrap permission to start X from a service.
install -m 0644 "$DEPLOY/Xwrapper.config" /etc/X11/Xwrapper.config
mkdir -p /etc/X11/xorg.conf.d
install -m 0644 "$DEPLOY/xorg-10-divd-kiosk.conf" /etc/X11/xorg.conf.d/10-divd-kiosk.conf
echo "==> installed X configs (DontVTSwitch, DontZap, no-blank; allowed_users=anybody)"

# 4. Django: migrate + collect static (as the service user, in the venv).
sudo -u "$KUSER" "$VENV/bin/python" "$REPO/manage.py" migrate --noinput
sudo -u "$KUSER" "$VENV/bin/python" "$REPO/manage.py" collectstatic --noinput
echo "==> Django migrate + collectstatic done"

# 5. Free port 8000 from any leftover manual test gunicorns.
pkill -f "gunicorn divdprint" 2>/dev/null || true

# 6. systemd units.
install -m 0644 "$DEPLOY/divd-print.service" /etc/systemd/system/divd-print.service
install -m 0644 "$DEPLOY/divd-kiosk.service" /etc/systemd/system/divd-kiosk.service
systemctl daemon-reload
echo "==> installed systemd units"

# 6b. sudoers fragment letting the unprivileged backend call nmcli for /admin
# wifi. visudo-checked before install — refuse to ship a broken file that
# would lock sudo for everyone.
TMP_SUDOERS=$(mktemp)
install -m 0440 "$DEPLOY/divd-admin.sudoers" "$TMP_SUDOERS"
if visudo -cf "$TMP_SUDOERS" >/dev/null; then
    install -m 0440 "$DEPLOY/divd-admin.sudoers" /etc/sudoers.d/divd-admin
    echo "==> installed /etc/sudoers.d/divd-admin"
else
    echo "!! divd-admin.sudoers failed visudo check; skipped" >&2
fi
rm -f "$TMP_SUDOERS"

# 6c. /admin "open shell" uses a real Linux VT, not a web terminal: enable a
# getty on tty3 so Ctrl+Alt+F3 lands on a divd login prompt. Logind has to
# allow VT3 to exist; the kiosk service drops srvrkeys:none so the compositor
# actually translates Ctrl+Alt+F3 into a VT switch.
install -m 0644 "$DEPLOY/logind-10-divd-kiosk.conf" /etc/systemd/logind.conf.d/10-divd-kiosk.conf
systemctl reload-or-restart systemd-logind.service || true
systemctl enable --now getty@tty3.service
echo "==> getty@tty3 enabled (Ctrl+Alt+F3 -> bash login)"

# 7. Boot to console (no display manager) and let our services own the screen.
systemctl set-default multi-user.target
systemctl disable lightdm.service 2>/dev/null || true
systemctl stop    lightdm.service 2>/dev/null || true
# tty1 getty is replaced by the kiosk service.
systemctl disable getty@tty1.service 2>/dev/null || true

# 8. Enable + (re)start the kiosk.
systemctl enable divd-print.service divd-kiosk.service
systemctl restart divd-print.service
# Give gunicorn a moment to bind before X/chromium polls it.
for i in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:8000/ && break; sleep 1; done
systemctl restart divd-kiosk.service

echo
echo "==> DONE. The kiosk should now be on the HDMI monitor."
echo "    backend:  systemctl status divd-print.service"
echo "    kiosk:    systemctl status divd-kiosk.service"
echo "    logs:     journalctl -u divd-kiosk -b --no-pager"
echo
echo "    When you've confirmed it looks right, purge the desktop with:"
echo "      sudo bash $DEPLOY/remove-desktop.sh"
