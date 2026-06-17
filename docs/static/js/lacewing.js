/* lacewing.js — Project Lacewing pane takeover.
 *
 * Like metasploit.js, but instead of popping a box it dramatizes DIVD's pitch:
 * a LOCAL, open-weights AI model (air-gapped, 0 EUR/Mtok — no closed "Mythos"
 * preview, no $25-125/Mtok, no gatekeepers) hunts a decades-old bug in critical
 * open source, patches it, and discloses to the maintainer FIRST. The lacewing
 * (gaasvlieg, Chrysopidae) is a natural predator of pests: AI surfaces a plague
 * of vulnerabilities, and Lacewing is the one that hunts the plague.
 *
 *   "Het internet is van iedereen. De verdediging ook."
 *
 * Fires occasionally on its own, on demand via /lacewing, and during /demo.
 * Shares the bottom-right logo pane with metasploit.js via window._divdLogoBusy.
 */
(function () {
  "use strict";
  var stage = document.getElementById("logo-stage");
  if (!stage) return;

  var overlay = document.createElement("div");
  overlay.className = "msf-overlay lw-overlay";   // reuse msf layout + show rules
  overlay.setAttribute("aria-hidden", "true");
  stage.appendChild(overlay);

  function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  // Real critical-OSS targets + a plausible bug class + a file to "find" it in.
  var REPOS = [
    ["openssl",  "ssl/t1_lib.c",                "use-after-free"],
    ["zlib",     "inflate.c",                   "out-of-bounds read"],
    ["glibc",    "iconv/skeleton.c",            "integer overflow"],
    ["xz-utils", "src/liblzma/lzma_decoder.c",  "double free"],
    ["curl",     "lib/http2.c",                 "stack buffer overflow"],
    ["sudo",     "plugins/sudoers/sudoers.c",   "heap overflow"],
    ["openssh",  "auth2-pubkey.c",              "out-of-bounds write"],
    ["libpng",   "pngrutil.c",                  "NULL deref"]
  ];
  // (year introduced, years it sat unnoticed). Fixed for 2026 so we need no clock.
  var AGES = [["2002", 24], ["1998", 28], ["2006", 20], ["2011", 15],
              ["1996", 30], ["2008", 18], ["2004", 22]];

  function script() {
    var r = pick(REPOS), age = pick(AGES);
    var cve = "CVE-2026-" + rint(10000, 49999);
    return [
      "",
      "       =[ Project Lacewing -- Chrysopidae v0.9          ]",
      "+ -- --=[ European * open-source * non-profit * by DIVD ]",
      "+ -- --=[ pillars: AI capacity * automated research     ]",
      "+ -- --=[          open collaboration * responsible disclosure ]",
      "",
      "[*] Apr 7 2026: Anthropic launched Glasswing -- $25-125/Mtok, big-tech backed",
      "[*] loading model qwen2.5-coder-32b (local GGUF, 4-bit)...",
      "[+] local * open-weights * air-gapped * 0 EUR/Mtok * no gatekeepers",
      "[+] model resident in VRAM -- 0 bytes leave this building",
      "",
      "lacewing> scan --target " + r[0] + " --depth deep",
      "[*] cloning " + r[0] + " ... 100%",
      "[*] reasoning over " + rint(40, 900) + "k LOC ...",
      "[+] FINDING: " + r[2] + " in " + r[1],
      "[+] present since " + age[0] + " -- " + age[1] + " years in critical code",
      "[+] assigned " + cve + "  (severity: high)",
      "",
      "lacewing> patch --verify --maintainer-first",
      "[*] drafting fix ... rebuilding ... running test suite ...",
      "[+] patch verified -- regression suite green",
      "[*] disclosing to the maintainer FIRST (responsible disclosure)",
      "[+] the world gets it after the fix lands. that's the deal.",
      "",
      "lacewing> exit",
      "[!] AI surfaces a plague of these. the lacewing hunts the plague.",
      "[+] DIVD track record: 189 volunteers * 193 cases * 1.4M IPs notified",
      "[*] The internet belongs to everyone. So does its defense.",
      "[*] Het internet is van iedereen. De verdediging ook.",
      "[*] get involved -> lacewing@divd.nl  (CC BY 4.0) <3"
    ];
  }

  function cls(line) {
    if (/^\[\*\]/.test(line)) return "info";
    if (/^\[\+\]/.test(line)) return "good";
    if (/^\[[-!]\]/.test(line)) return "bad";
    if (/^lacewing>/.test(line)) return "prompt";
    if (/^(\s*=\[|\+ -- --=\[)/.test(line)) return "banner";
    return "";
  }

  var active = false, timer = null;

  function trim(keep) {
    while (overlay.scrollHeight > overlay.clientHeight &&
           overlay.firstChild && overlay.firstChild !== keep) {
      overlay.removeChild(overlay.firstChild);
    }
  }

  function addLine(text) {
    var div = document.createElement("div");
    div.className = "l " + cls(text);
    div.textContent = text;
    overlay.appendChild(div);
    trim();
  }

  // Hold the finished session on screen with a draining bar so people can read
  // the "the defense belongs to everyone too" punchline (reuses .msf-* styles).
  function countdown(secs, done) {
    var box = document.createElement("div");
    box.className = "l good msf-count";
    box.innerHTML = '[+] holding for review -- auto-closing in ' +
      '<b class="msf-secs">' + secs + '</b>s <span class="msf-bar"><i></i></span>';
    overlay.appendChild(box);
    trim(box);
    var fill = box.querySelector("i"), secsEl = box.querySelector(".msf-secs");
    requestAnimationFrame(function () {
      fill.style.transition = "width " + secs + "s linear";
      fill.style.width = "0%";
    });
    var left = secs;
    var iv = setInterval(function () {
      left -= 1;
      if (secsEl) secsEl.textContent = Math.max(0, left);
      if (left <= 0) clearInterval(iv);
    }, 1000);
    timer = setTimeout(function () { clearInterval(iv); done(); }, secs * 1000);
  }

  function stop() {
    active = false;
    window._divdLogoBusy = false;
    if (timer) { clearTimeout(timer); timer = null; }
    overlay.classList.remove("show");
    overlay.innerHTML = "";
    if (window.DIVD_resetTitle) window.DIVD_resetTitle("logo");
  }

  function run() {
    if (active || window._divdLogoBusy) return;       // don't fight msf for the pane
    var logo = document.getElementById("glitch-logo");
    if (logo && logo.classList.contains("bouncing")) return;  // logo is roaming
    active = true;
    window._divdLogoBusy = true;
    overlay.innerHTML = "";
    overlay.classList.add("show");
    if (window.DIVD_setTitle) window.DIVD_setTitle("logo", "lacewing", "hunting bugs", "good");
    var lines = script(), i = 0;
    (function next() {
      if (!active) return;
      if (i >= lines.length) { countdown(6, stop); return; }
      var line = lines[i++];
      addLine(line);
      var d = line === "" ? 130 : /^lacewing>/.test(line) ? 360 : 80 + Math.random() * 190;
      timer = setTimeout(next, d);
    })();
  }

  window.DIVD_lacewing = run;
  window.DIVD_lacewingBusy = function () { return active; };

  // Random trigger: roughly every 25-55s, ~45% chance to fire (skips if the
  // logo pane is busy with the msfconsole egg or the bouncing logo).
  (function loop() {
    setTimeout(function () {
      if (Math.random() < 0.45) run();
      loop();
    }, 25000 + Math.random() * 30000);
  })();
})();
