#!/usr/bin/env bash
# Install the DIVD kiosk peripherals + input wiring (idempotent):
#   * LED strip animation daemon          -> divd-leds.service
#   * volume-key LED control reader        -> divd-volkeys.service
#   * cursor hide (ignore phantom Mouse)   -> udev LIBINPUT_IGNORE_DEVICE rule
#   * boot-once-into-a-terminal            -> divd-shell + flag-gated getty@tty1
# Called by install-cage.sh (fresh) and apply-updates.sh (incremental); also
# safe to run standalone:  sudo bash /opt/divdprint/deploy/install-peripherals.sh
set -euo pipefail
REPO=/opt/divdprint; DEPLOY=$REPO/deploy; VENV=/opt/venv; KUSER=divd
[[ $EUID -eq 0 ]] || { echo "Run as root (sudo)." >&2; exit 1; }

# Python deps for the volume-key reader (evdev). neopixel/lgpio are assumed from
# the base install; best-effort so this still works offline.
"$VENV/bin/pip" install --quiet --disable-pip-version-check evdev >/dev/null 2>&1 || \
  echo "!! could not pip-install evdev (offline?) — divd-volkeys needs it" >&2

# Persistent LED speed/brightness state dir (LED_STATE_FILE).
install -d -o "$KUSER" -g "$KUSER" "/home/$KUSER/.local/state/divdprint"

# systemd units: LED daemon + volume-key reader.
install -m0644 "$DEPLOY/divd-leds.service"    /etc/systemd/system/divd-leds.service
install -m0644 "$DEPLOY/divd-volkeys.service" /etc/systemd/system/divd-volkeys.service

# Cursor: tell libinput to ignore the keyboard's phantom Mouse HID (no pointer
# => cage draws no cursor). Re-apply to already-enumerated devices.
install -m0644 "$DEPLOY/99-divd-hide-cursor.rules" /etc/udev/rules.d/99-divd-hide-cursor.rules
udevadm control --reload && udevadm trigger --subsystem-match=input || true

# Boot-once-into-a-terminal: trigger helper + a flag-gated autologin on tty1.
install -m0755 "$DEPLOY/divd-shell" /usr/local/bin/divd-shell
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat >/etc/systemd/system/getty@tty1.service.d/autologin.conf <<'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin divd --noclear %I $TERM
EOF
cat >/etc/systemd/system/getty@tty1.service.d/bootshell.conf <<'EOF'
[Unit]
# Only run getty@tty1 (autologin) when booting to a terminal; otherwise the
# kiosk owns tty1. divd-kiosk-cage.service has the inverse condition.
ConditionPathExists=/home/divd/.boot-to-shell
EOF
# Clear the one-shot flag on login so the next reboot returns to the kiosk.
grep -q boot-to-shell "/home/$KUSER/.profile" 2>/dev/null || \
  printf '\n# boot-to-shell is one-shot: clear on login (set by divd-shell)\n[ -f "$HOME/.boot-to-shell" ] && rm -f "$HOME/.boot-to-shell"\n' >> "/home/$KUSER/.profile"

systemctl daemon-reload
systemctl enable getty@tty1.service                       # flag-gated; won't run on a normal boot
systemctl enable divd-leds.service divd-volkeys.service
systemctl restart divd-leds.service divd-volkeys.service  # restart => picks up new daemon code on updates
echo "==> peripherals installed: divd-leds, divd-volkeys, cursor rule, divd-shell"
