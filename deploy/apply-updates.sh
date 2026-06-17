#!/usr/bin/env bash
# Apply the latest DIVD kiosk updates and restart the kiosk.
# Run as root:  sudo bash /opt/divdprint/deploy/apply-updates.sh
set -euo pipefail
REPO=/opt/divdprint; DEPLOY=$REPO/deploy; VENV=/opt/venv
if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi

echo "==> collectstatic (frontend: LED OSD, DIVD-yellow tmux, gimmick LED events, mode preview)"
sudo -u divd "$VENV/bin/python" "$REPO/manage.py" collectstatic --noinput >/dev/null

echo "==> install kiosk unit (cage -s + boot-to-shell condition) + VT hardening"
install -m 0644 "$DEPLOY/divd-kiosk-cage.service" /etc/systemd/system/divd-kiosk.service
mkdir -p /etc/systemd/logind.conf.d
install -m 0644 "$DEPLOY/logind-10-divd-kiosk.conf" /etc/systemd/logind.conf.d/10-divd-kiosk.conf

echo "==> peripherals: LED daemon, volume-key control, cursor hide, boot-to-shell"
bash "$DEPLOY/install-peripherals.sh"

echo "==> install boot hello-world receipt unit"
install -m 0644 "$DEPLOY/divd-boot-hello.service" /etc/systemd/system/divd-boot-hello.service
systemctl daemon-reload
systemctl enable divd-boot-hello.service

echo "==> restart backend (receipt changes: no date/thanks, counter, 4th-idea art)"
systemctl restart divd-print.service
for i in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:8000/ && break; sleep 1; done

echo "==> restart kiosk (loads new frontend + XKB srvrkeys:none)"
systemctl restart divd-kiosk.service

echo "==> printing two TEST receipts (a normal one + a 4th-idea bonus one)"
sudo -u divd -g lp "$VENV/bin/python" - <<'PY'
import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "divdprint.settings")
os.chdir("/opt/divdprint"); django.setup()
from printer import printing
ok1, e1 = printing.print_idea("TEST: normal receipt - new footer + counter", "", 7)
ok2, e2 = printing.print_idea("TEST: every 4th idea bonus art", "", 8)
print("   normal print:", ok1, e1 or "")
print("   bonus  print:", ok2, e2 or "")
PY

echo
echo "==> DONE."
echo "    kiosk:   $(systemctl is-active divd-kiosk.service)"
echo "    Two receipts should have printed. Check: counter shows 'IDEA No. 0007/0008',"
echo "    no date, no 'thank you', and #0008 has a cat/hackerman."
echo "    NOTE: the logind NAutoVTs=0 change fully applies after the next reboot;"
echo "    the Ctrl+Alt+Fn block (srvrkeys:none) is active now — try it!"
