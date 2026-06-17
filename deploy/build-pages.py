#!/usr/bin/env python3
"""Build the static GitHub Pages demo into docs/.

GitHub Pages can only serve static files, so this renders the kiosk page with
Django, rewrites the absolute /static/ asset paths to repo-relative ones, copies
the static assets into docs/static/, and injects a tiny shim that fakes the
backend endpoints (/submit, /stats, /netinfo, ...) so the UI stays alive without
a server. The physical features (printing, LEDs, wifi) obviously do nothing.

Run from the repo root:  python deploy/build-pages.py
"""
import os
import re
import shutil
import sys
from pathlib import Path

import django

BASE_DIR = Path(__file__).resolve().parent.parent
DOCS = BASE_DIR / "docs"

# Make the divdprint package importable regardless of the cwd we're run from.
sys.path.insert(0, str(BASE_DIR))

# Demo shim: override fetch() for the backend endpoints with canned responses.
DEMO_SHIM = """<script>
// --- GitHub Pages demo shim -------------------------------------------------
// There is no Django backend here, so fake the JSON endpoints the kiosk polls
// and posts to. Everything else (the easter eggs, glitch logo, htop, games)
// is pure client-side JS and runs for real.
(function () {
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  var ideaId = 1300 + Math.floor(40 * (1 - Math.cos(1)));  // deterministic-ish seed
  function json(obj) {
    return Promise.resolve(new Response(JSON.stringify(obj), {
      status: 200, headers: { "Content-Type": "application/json" }
    }));
  }
  window.fetch = function (url, opts) {
    var u = ("" + url).split("?")[0];
    if (u === "/stats")    return json({ count: ideaId });
    if (u === "/netinfo")  return json({ ips: null });            // "air-gapped"
    if (u === "/ledstate") return json({ speed: 1.0, brightness: 0.4 });
    if (u === "/led")      return json({ ok: true });
    if (u === "/submit")   return json({ ok: true, id: ++ideaId });
    if (u === "/printimg") return json({ ok: true });
    if (u === "/shutdown" || u === "/reboot")
      return json({ ok: false, error: "disabled in the web demo" });
    if (u.indexOf("/admin") === 0)
      return json({ ok: false, error: "admin console is disabled in the web demo" });
    return realFetch ? realFetch(url, opts) : json({});
  };
})();
</script>
"""

# A small unobtrusive badge linking back to the repo.
DEMO_BADGE = """<a id="demo-badge" href="https://github.com/karloluiten/divd-event-terminal"
   style="position:fixed;left:6px;bottom:24px;z-index:9999;font:11px/1.4 monospace;
          color:#0f0;background:rgba(0,0,0,.6);border:1px solid #0f0;padding:2px 6px;
          text-decoration:none;border-radius:3px;opacity:.55">
  STATIC DEMO &middot; no printer/backend &middot; source &#8599;
</a>
"""


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "divdprint.settings")
    django.setup()
    from django.test import Client

    html = Client().get("/").content.decode()

    # Absolute /static/ -> repo-relative static/ (project Pages live under a subpath).
    html = html.replace('href="/static/', 'href="static/')
    html = html.replace('src="/static/', 'src="static/')

    # Inject the shim before the first app script so it overrides fetch in time.
    html = re.sub(r'(<script src="static/js/)', DEMO_SHIM + r"\1", html, count=1)
    # Drop the badge in just before </body>.
    html = html.replace("</body>", DEMO_BADGE + "</body>")

    DOCS.mkdir(exist_ok=True)
    # Fresh copy of the static assets.
    dst = DOCS / "static"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(BASE_DIR / "static", dst)

    (DOCS / "index.html").write_text(html)
    (DOCS / ".nojekyll").write_text("")  # serve files verbatim, no Jekyll pass

    print(f"Built {DOCS/'index.html'} ({len(html)} bytes) + {dst}")


if __name__ == "__main__":
    main()
