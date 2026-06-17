#!/usr/bin/env bash
# DIVD kiosk — purge the Raspberry Pi desktop. DESTRUCTIVE.
# Run as root AFTER you've confirmed the kiosk works:
#   sudo bash /opt/divdprint/deploy/remove-desktop.sh
#
# Removes the desktop/session/display-manager packages but KEEPS everything the
# kiosk needs: xserver-xorg*, xinit, x11-xserver-utils (xset), chromium,
# unclutter, and python/django.
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi

echo "==> Purging Raspberry Pi desktop packages (kiosk X stack is preserved)"

# Desktop shells / session managers / display manager / Wayland compositors.
PURGE=(
  raspberrypi-ui-mods
  lxde-common lxde-core lxde-icon-theme
  lxsession lxsession-logout lxsession-data
  lxpanel lxtask lxterminal lxpolkit lxmenu-data lxinput lxrandr lxappearance
  lxde lxhotkey openbox obconf
  pcmanfm libfm-modules
  lightdm lightdm-gtk-greeter
  labwc wayfire wf-panel-pi pi-greeter pi-greeter-labwc
  gnome-keyring
)

EXISTING=()
for p in "${PURGE[@]}"; do
  if dpkg -l "$p" 2>/dev/null | grep -q '^ii'; then EXISTING+=("$p"); fi
done

if [[ ${#EXISTING[@]} -eq 0 ]]; then
  echo "==> Nothing to purge (already removed)."
else
  echo "    will purge: ${EXISTING[*]}"
  apt-get purge -y "${EXISTING[@]}"
  apt-get autoremove --purge -y
fi

# Sanity: make sure we did NOT lose the kiosk essentials (Wayland/cage path).
echo "==> Verifying kiosk essentials survived:"
for bin in cage chromium unclutter curl; do
  if command -v "$bin" >/dev/null; then echo "    OK   $bin"; else echo "    MISSING $bin  <-- problem!"; fi
done
echo "==> And the kiosk services are still enabled:"
systemctl is-enabled divd-print.service divd-kiosk.service || true

systemctl set-default multi-user.target
echo "==> Done. Reboot to confirm a clean boot straight into the kiosk:  sudo reboot"
