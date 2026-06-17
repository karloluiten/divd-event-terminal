# DIVD kiosk — build status

_Kiosk is live and working on the Pi 5 (cage + chromium Wayland)._

## Working / done
- Django backend `/opt/divdprint`, venv `/opt/venv`. App `printer`, model `Idea`.
- Printing pipeline verified: receipts print + cut on TM-T20III (`/dev/usb/lp0`).
  Service runs as `divd` with supplementary group `lp`.
- Receipt layout: DIVD header, idea body, footer = `IDEA No. NNNN` counter +
  `divd.nl`. NO date/time (offline), NO "thank you" line.
- Every 4th idea (id % 4 == 0) prints random ASCII bonus art (cat/hackerman/skull).
- 18 easter-egg modes (`/comicsans`, `/big`, `/glitch`, `/qr`, `/wanted`,
  `/lacewing`, …). Slash menu is a capped scrollable box; mode resets per print.
- Frontend (tmux look): left terminal, top-right fake htop (red "hacked" procs,
  labelled cage/chromium-wayland), bottom-right glitchy DIVD logo, status bar
  with live `ideas:N` counter + clock.
- Escape defenses: JS guard flashes red on Alt-Tab/Alt-F4/F11/etc.
  Ctrl+Alt+Fn VT-switch blocked via `XKB_DEFAULT_OPTIONS=srvrkeys:none`
  (+ logind `NAutoVTs=0`, fully applies after a reboot).
- Display: **cage (Wayland)** — `divd-kiosk.service` runs
  `cage -- deploy/chromium-wayland.sh` (chromium needs `--no-sandbox` +
  `--password-store=basic`). X11 path abandoned (Xorg glamor crash on Pi 5).
- systemd: `divd-print.service` (gunicorn :8000) + `divd-kiosk.service`,
  both enabled. default target multi-user; lightdm + getty@tty1 disabled.
- Boot receipt: `divd-boot-hello.service` (oneshot, multi-user.target) runs
  `manage.py print_hello` once per boot — prints a DIVD-header + `hello, world!`
  + C snippet + `system online @ <hostname>` receipt. Retries the printer for
  ~20s in case `/dev/usb/lp0` isn't ready yet.

## Shipped & verified on-device
- Desktop purged; clean cold boot into kiosk; all interaction + escape defenses tested.
- Receipt: PIL-drawn DIVD logo header, idea body, IDEA No. NNNN counter, divd.nl.
  No date / no "thank you" / no dotted rules; compact spacing.
- Every 4th receipt: random grayscale cat photo (assets/cats/, dithered) ~75%,
  else ASCII hackerman/skull. Refresh cats: `bash deploy/get-cats.sh` (needs net).
- External access ENABLED: gunicorn binds 0.0.0.0:8000, ALLOWED_HOSTS=['*'],
  /submit is csrf-exempt. Reach at http://<pi-ip>:8000 (and /admin, superuser made).
  htop panel shows the real IP (via /netinfo) or "air-gapped".

## Project Lacewing theming (2026-05-29, deployed + served-verified)
DIVD's pitch — an open, European, community answer to Anthropic's Glasswing —
is woven through the kiosk. Tagline: "Het internet is van iedereen. De
verdediging ook." Tone: English flavor + Dutch tagline anchor, discoverable.
- htop.js: 5 green "lacewing" defender procs (local open-weights AI, 0 EUR/Mtok,
  disclose-first) among the red attacker procs + a live "Lacewing: hunting N
  repos · 0-days · disclosed" status line. New `.htop .good` (mint) CSS class.
- static/js/lacewing.js (NEW): logo-pane takeover modeled on metasploit.js — a
  local AI finds a decades-old bug in critical OSS, patches it, discloses to the
  maintainer first, punchline = the tagline. Shares the pane with the msf egg
  via `window._divdLogoBusy`. Random trigger + `/lacewing` + in /demo @27s.
  Added to kiosk.html script list; CSS `.lw-overlay` reuses `.msf-overlay`.
- terminal.js: `/lacewing` manifesto (aliases /glasswing /gaasvlieg), boot-banner
  line, 4 PRINT_QUIPS + 2 INVITES + a /help row. demo.js: 2 Lacewing sample ideas.
- printing.py: `/lacewing` print mode (manifesto header + Dutch tagline footer),
  a "PROJECT LACEWING" gaasvlieg ASCII bonus-art piece, 3 extra cat captions.
- Deployed via `collectstatic` + restart of divd-print & divd-kiosk only — NOT
  the full apply-updates.sh (which also burns two physical TEST receipts/run).

## lacewing.nl site copy folded in (2026-05-30, deployed + served-verified)
Reviewed the live https://www.lacewing.nl and wove its real material into the
kiosk (earlier theming predated the site).
- NEW gimmick: the Project Lacewing insect logo (assets/site SVG, saved to
  static/img/lacewing-logo.svg) painted very faintly (opacity .06) behind the
  left terminal pane. `.pane-left{isolation:isolate}` + `::after` bg, content
  lifted to z-index 1/2 so text stays sharp.
- English lead slogan added everywhere alongside the Dutch anchor: "The internet
  belongs to everyone. So does its defense."
- terminal.js: boot banner slogan line; +3 PRINT_QUIPS (English slogan, "Glasswing
  is a step forward — but for whom?", DIVD-by-numbers, lacewing@divd.nl); INVITES
  now use the site roles (technical · fundraising · champion) + real email; the
  /lacewing manifesto now opens with the Apr 7 2026 Glasswing launch + big-tech
  roster + $25-125/Mtok, "barrier is structurally dropping", track-record numbers
  (189 vol · 193 cases · 1.4M IPs), both slogans, and get-involved → email.
- lacewing.js pane takeover: banner lists the 4 pillars (AI capacity · automated
  research · open collaboration · responsible disclosure), Glasswing-launch line,
  track record, both slogans, lacewing@divd.nl + CC BY 4.0 footer.
- htop.js: added a "DIVD: 189 volunteers · 193 cases · 1.4M IPs notified ·
  lacewing@divd.nl" info line under the live Lacewing tally.
- printing.py: /lacewing receipt now prints English + Dutch slogan, track-record
  numbers, and lacewing@divd.nl as a real CTA takeaway; +3 cat captions.
- demo.js: +1 sample idea ("the internet belongs to everyone, so does its defense").
- Deployed via `collectstatic` + restart of divd-print & divd-kiosk (NOT
  apply-updates.sh). Verified over HTTP: page 200, CSS bg → SVG 200.

## Remaining (optional only)
- Tidy moot X11 leftover files (see memory divdprint-optional-followups).

## Deploy / ops cheatsheet
- Apply code changes:   `sudo bash deploy/apply-updates.sh`
- Logs:                 `journalctl -u divd-kiosk -b` / `-u divd-print -b`
- All ideas saved in sqlite; browse at `/admin` (create a superuser if needed).
