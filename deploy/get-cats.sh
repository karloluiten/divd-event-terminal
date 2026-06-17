#!/usr/bin/env bash
# Download grayscale cat photos from placecats.com for the every-4th-receipt
# treat. Needs internet. Run once (production can be offline afterwards):
#   bash /opt/divdprint/deploy/get-cats.sh
set -euo pipefail
DEST=/opt/divdprint/assets/cats
mkdir -p "$DEST"

# placecats.com grayscale endpoint is /g/<width>/<height>. Different sizes tend
# to return different source cats, giving us variety.
SIZES="400/300 420/320 380/300 440/340 400/280 360/320 420/300 400/340"
i=1
for s in $SIZES; do
    out="$DEST/cat$i.jpg"
    # Try grayscale endpoint first, fall back to color (we dither either way).
    if curl -fsSL --max-time 20 -o "$out" "https://placecats.com/g/$s" \
       || curl -fsSL --max-time 20 -o "$out" "https://placecats.com/$s"; then
        # keep only if it's actually a JPEG of non-trivial size
        if file "$out" | grep -qi "JPEG\|JFIF" && [ "$(stat -c%s "$out")" -gt 2000 ]; then
            echo "  ok  cat$i.jpg ($s)"
        else
            echo "  bad cat$i.jpg -> removing"; rm -f "$out"
        fi
    else
        echo "  fail $s (no internet?)"
    fi
    i=$((i + 1))
done

n=$(ls "$DEST"/*.jpg 2>/dev/null | wc -l)
echo "==> $n cat photo(s) in $DEST"
[ "$n" -gt 0 ] && echo "==> Now restart the backend: sudo systemctl restart divd-print.service" \
              || echo "==> No cats downloaded. Check internet; the printer will use ASCII art meanwhile."
