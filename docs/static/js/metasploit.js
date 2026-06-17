/* metasploit.js — every so often the DIVD logo pane (bottom-right) is taken
 * over by a scrolling fake msfconsole "exploitation" session, then fades back
 * to the logo. Pure theatre: it pops a fake box and then admits DIVD doesn't
 * actually pop your boxes. Also available on demand via /msf.
 */
(function () {
  "use strict";
  var stage = document.getElementById("logo-stage");
  if (!stage) return;

  var overlay = document.createElement("div");
  overlay.className = "msf-overlay";
  overlay.setAttribute("aria-hidden", "true");
  stage.appendChild(overlay);

  function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  // Build a fresh session script with slightly randomised numbers each run.
  function script() {
    var tgt = "10.13.37." + rint(20, 240);
    var lh = "10.13.37." + rint(2, 9);
    var sess = rint(1, 4);
    var port = rint(51000, 59999);
    return [
      "",
      "       =[ metasploit v6.4.27-dev                      ]",
      "+ -- --=[ 2417 exploits - 1245 auxiliary - 430 post   ]",
      "+ -- --=[ 1471 payloads - 47 encoders - 11 nops       ]",
      "+ -- --=[ 9 evasion                                   ]",
      "",
      "msf6 > use exploit/multi/handler",
      "[*] Using configured payload generic/shell_reverse_tcp",
      "msf6 exploit(multi/handler) > set LHOST " + lh,
      "LHOST => " + lh,
      "msf6 exploit(multi/handler) > set LPORT 4444",
      "LPORT => 4444",
      "msf6 exploit(multi/handler) > exploit",
      "[*] Started reverse TCP handler on " + lh + ":4444",
      "[*] Sending stage (201798 bytes) to " + tgt,
      "[*] Meterpreter session " + sess + " opened (" + lh + ":4444 -> " + tgt + ":" + port + ")",
      "",
      "meterpreter > getuid",
      "Server username : NT AUTHORITY\\SYSTEM",
      "meterpreter > sysinfo",
      "Computer        : CONF-KIOSK",
      "OS              : Windows 10 (10.0 Build 19045)",
      "Architecture    : x64",
      "meterpreter > hashdump",
      "[-] nope — just kidding. DIVD does not pop your boxes ;)",
      "meterpreter > exit",
      "[*] Found a real bug? Disclose it responsibly -> DIVD"
    ];
  }

  function cls(line) {
    if (/^\[\*\]/.test(line)) return "info";
    if (/^\[\+\]/.test(line)) return "good";
    if (/^\[[-!]\]/.test(line)) return "bad";
    if (/^(msf6|meterpreter)/.test(line)) return "prompt";
    if (/^(\s*=\[|\+ -- --=\[)/.test(line)) return "banner";
    if (/^[\w.]+\s*(:|=>)/.test(line)) return "val";
    return "";
  }

  var active = false, timer = null, poppedCalc = false;

  function trim(keep) {
    // stream upward: drop lines that scrolled past the top of the pane
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

  // Hold the finished session on screen for `secs` with a visible draining bar,
  // so people actually get to read the "we don't pop your boxes" punchline.
  function countdown(secs, done) {
    var box = document.createElement("div");
    box.className = "l info msf-count";
    box.innerHTML = '[*] holding session for review — auto-closing in ' +
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
    if (active || window._divdLogoBusy) return;   // don't fight lacewing for the pane
    var logo = document.getElementById("glitch-logo");
    if (logo && logo.classList.contains("bouncing")) return;  // logo is roaming
    active = true;
    window._divdLogoBusy = true;
    poppedCalc = false;
    overlay.innerHTML = "";
    overlay.classList.add("show");
    if (window.DIVD_setTitle) window.DIVD_setTitle("logo", "msf6", "session active", "evil");
    var lines = script(), i = 0;
    (function next() {
      if (!active) return;
      if (i >= lines.length) { countdown(5, stop); return; }
      var line = lines[i++];
      addLine(line);
      // When the session "lands", pop calc over the whole right column (htop +
      // this pane) for the classic exploit gag — mid-session, not at the end.
      if (!poppedCalc && line.indexOf("Meterpreter session") >= 0) {
        poppedCalc = true;
        if (window.DIVD_calc) window.DIVD_calc();
      }
      // pause a touch longer after blank lines and command prompts
      var d = line === "" ? 130 : /^(msf6|meterpreter)/.test(line) ? 360 : 80 + Math.random() * 190;
      timer = setTimeout(next, d);
    })();
  }

  window.DIVD_msf = run;

  // Random trigger: roughly every 20–45s, ~50% chance to fire.
  (function loop() {
    setTimeout(function () {
      if (Math.random() < 0.5) run();
      loop();
    }, 20000 + Math.random() * 25000);
  })();
})();
