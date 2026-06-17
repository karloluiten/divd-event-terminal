#!/bin/sh
# Chromium kiosk client for the DIVD kiosk, launched as the only app under the
# 'cage' Wayland compositor (cage runs this, and exits when chromium exits).

# Wait for the Django backend to answer before opening the browser.
i=0
while [ $i -lt 60 ]; do
    if curl -sf -o /dev/null http://127.0.0.1:8000/ ; then break; fi
    i=$((i + 1))
    sleep 1
done

PROFILE=/home/divd/.config/divd-kiosk
mkdir -p "$PROFILE"
rm -f "$PROFILE/Singleton"* 2>/dev/null
# Clear the HTTP + code caches every start so static (JS/CSS) changes from a
# deploy always load fresh. Chromium otherwise serves a stale cached
# terminal.js/kiosk.css (WhiteNoise sends max-age=60 + unhashed filenames), so a
# collectstatic + restart wouldn't actually show new frontend code.
rm -rf "$PROFILE/Default/Cache" "$PROFILE/Default/Code Cache" "$PROFILE/GPUCache" 2>/dev/null
# Clear any "didn't shut down cleanly" flag so no restore bubble appears.
sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/;s/"exited_cleanly":false/"exited_cleanly":true/' \
    "$PROFILE/Default/Preferences" 2>/dev/null

# Log chromium output so failures are visible (cage doesn't forward it to the
# journal). The kiosk is a locked single-app device on loopback, so running
# without the sandbox is acceptable and avoids namespace-sandbox failures in
# this minimal session.
exec chromium \
    --kiosk \
    --app=http://127.0.0.1:8000/ \
    --ozone-platform=wayland \
    --enable-features=UseOzonePlatform \
    --no-sandbox \
    --user-data-dir="$PROFILE" \
    --password-store=basic \
    --no-first-run \
    --no-default-browser-check \
    --disable-sync \
    --disable-translate \
    --disable-features=Translate,InfoBars,AutofillServerCommunication,MediaRouter \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-pinch \
    --overscroll-history-navigation=0 \
    --disable-component-update \
    --noerrdialogs \
    --hide-scrollbars \
    --autoplay-policy=no-user-gesture-required \
    --check-for-update-interval=31536000 \
    --start-maximized \
    >>/home/divd/kiosk-chromium.log 2>&1
