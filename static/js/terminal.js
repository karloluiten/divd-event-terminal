/* terminal.js — the left-pane printer terminal.
 * Captures typing, manages the slash-command mode menu, submits ideas to the
 * backend to be printed, and shows the active easter-egg mode.
 */
(function () {
  "use strict";
  var MODES = window.DIVD_MODES || [];
  var MODE_BY_NAME = {};
  MODES.forEach(function (m) { MODE_BY_NAME[m.name] = m; });

  // Mono-font ASCII markers per mode (no emoji font on the kiosk). Escaped at
  // render time, so symbols like < > are safe.
  var ICONS = {
    comicsans: ":o)", big: "[A]", tiny: "[a]", shout: "!!!", leet: "13t",
    mirror: ">|<", upsidedown: "(v)", redacted: "###", wanted: "($)",
    spooky: "RIP", retro: "[8]", fancy: "~A~", wingdings: "@#%",
    ascii: "/\\", qr: "[Q]", barcode: "|||", glitch: "%#!"
  };
  function icon(name) { return ICONS[name] || ">_"; }

  // Fire-and-forget LED effect on the strip; the daemon maps the name to a
  // colour (see leds.py EVENT_COLORS). /led is csrf-exempt + always-ok.
  function ledFx(effect) {
    try {
      fetch("/led", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effect: effect })
      }).catch(function () {});
    } catch (e) { /* lights are decorative — never break the kiosk */ }
  }
  window.DIVD_led = ledFx;
  // Slash-command gimmick -> LED effect name. Full-screen takeovers light the
  // strip to match: bsod=blue, update=purple, wannacry/msf/breakout=red,
  // matrix/hack=green, glitch/defrag=cyan, lacewing=DIVD-yellow, image=rainbow.
  var LED_FX = {
    matrix: "matrix", bounce: "bounce", defrag: "defrag", bsod: "bsod",
    glitch_screen: "glitch", hack: "hack",
    lacewing: "lacewing", glasswing: "lacewing", gaasvlieg: "lacewing",
    cat: "image", hackerman: "image",
    wannacry: "wannacry", wnc: "wannacry",
    msf: "msf", metasploit: "msf",
    tv: "crt", crt: "crt", tvoff: "crt",
    breakout: "breakout", arkanoid: "breakout",
    winupdate: "update", macupdate: "update", ubuntu: "update", update: "update"
  };

  var out = document.getElementById("term-output");
  var promptLine = document.getElementById("term-prompt-line");
  var cmdEl = document.getElementById("cmd");
  var menuEl = document.getElementById("slashmenu");
  var modebarEl = document.getElementById("modebar");
  var countEl = document.getElementById("sb-count");

  var buffer = "";
  var activeMode = "";     // mode applied to the NEXT printed idea
  var sel = 0;             // highlighted row in slash menu
  var busy = false;        // true while a print is in flight
  var pwMode = false;      // true while reading a hidden power-command password
  var pwAction = "";       // "shutdown" | "reboot" | "admin" — what the password unlocks
  var rootMode = false;    // true after `sudo` "grants" root (prompt -> root@…)
  var rootTimer = null;    // reverts to the normal prompt after 30s
  // /admin state machine. After the password gate passes the terminal hijacks
  // input until the user exits (esc or finishing a sub-flow that closes itself).
  // States: "" | "menu" | "wifi-pick" | "wifi-psk"
  var adminState = "";
  var adminAuth = "";      // remembered password — re-sent on each /admin-* call
  var adminWifi = null;    // {networks: [...], picked: {ssid, security}}
  var MAXLEN = 256;        // hard cap on idea length (matches the backend)
  var WARN_AT = 224;       // start warning within 32 chars of the limit
  var promptEl = promptLine.querySelector(".prompt");
  var DEFAULT_PROMPT = promptEl ? promptEl.textContent : "divd@orangecon:~$";
  var lastActivity = Date.now();
  var idleSpacer = null;        // "scrolloff" spacer that floats the prompt up
  var collapsing = false;       // true while the spacer is animating back to 0
  function bumpActivity() {
    lastActivity = Date.now();
    if (idleSpacer && !collapsing &&
        (parseInt(idleSpacer.style.height, 10) || 0) > 0) {
      collapseSpacer();         // glide the prompt back down (no abrupt jump)
    }
  }
  // Smoothly shrink the scrolloff spacer to 0 so the prompt slides down to the
  // bottom over ~300ms instead of snapping when the visitor starts typing.
  function collapseSpacer() {
    if (!idleSpacer) return;
    var h0 = parseInt(idleSpacer.style.height, 10) || 0;
    if (h0 <= 0) { idleSpacer.style.height = "0px"; return; }
    collapsing = true;
    var t0 = performance.now(), dur = 300;
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur);
      idleSpacer.style.height = Math.round(h0 * (1 - k)) + "px";
      out.scrollTop = out.scrollHeight;
      if (k < 1) requestAnimationFrame(step); else collapsing = false;
    })(t0);
  }

  function esc(s) {
    return ("" + s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function addLine(text, cls) {
    var div = document.createElement("div");
    div.className = "ln " + (cls || "");
    div.innerHTML = text;
    // insert history above the live prompt line, which always stays last
    out.insertBefore(div, promptLine);
    while (out.childNodes.length > 241) out.removeChild(out.firstChild);
    // keep the newest content in view (out is the scroll container)
    out.scrollTop = out.scrollHeight;
  }

  // live char-limit warning element (appended under the terminal)
  var warnEl = document.createElement("div");
  warnEl.className = "charwarn";
  warnEl.hidden = true;
  var termEl = document.getElementById("term");
  termEl.appendChild(warnEl);

  // ---- terminal font zoom (Ctrl +/-, routed here from guard.js) ---------- //
  var BASE_FONT = 25, MIN_FONT = 14, MAX_FONT = 64, FONT_STEP = 3;
  var termFont = BASE_FONT;
  window.DIVD_termZoom = function (dir) {
    termFont = dir === 0 ? BASE_FONT
      : Math.max(MIN_FONT, Math.min(MAX_FONT, termFont + dir * FONT_STEP));
    termEl.style.fontSize = termFont + "px";
    out.scrollTop = out.scrollHeight;
  };

  // ---- clear the terminal (/clear and Ctrl-L) ---------------------------- //
  function clearTerminal() {
    var nodes = out.querySelectorAll(".ln");
    for (var i = 0; i < nodes.length; i++) out.removeChild(nodes[i]);
    out.scrollTop = 0;
  }
  window.DIVD_clearTerminal = clearTerminal;

  function updateWarn() {
    var n = buffer.length;
    if (pwMode || n < WARN_AT) { warnEl.hidden = true; return; }
    if (n >= MAXLEN) {
      warnEl.textContent = "⚠ MAX 256 CHARS — that's all that fits on a receipt!";
      warnEl.classList.add("at-limit");
    } else {
      warnEl.textContent = "⚠ " + (MAXLEN - n) + " characters left (256 max)";
      warnEl.classList.remove("at-limit");
    }
    warnEl.hidden = false;
  }

  function renderCmd() {
    // Mask the input while entering any password (shutdown / admin / wifi PSK).
    var mask = pwMode || adminState === "wifi-psk";
    cmdEl.textContent = mask ? "*".repeat(buffer.length) : buffer;
    updateWarn();
  }

  // Current prompt string: admin sub-prompts > password prompt > root > user.
  var ROOT_PROMPT = "root@orangecon:~#";
  function promptStr() {
    if (pwMode) return pwAction + " password:";
    if (adminState === "menu")      return "admin> select [1-2]:";
    if (adminState === "wifi-pick") return "admin/wifi> pick #:";
    if (adminState === "wifi-psk")  return "admin/wifi> password:";
    return rootMode ? ROOT_PROMPT : DEFAULT_PROMPT;
  }
  function refreshPrompt() {
    if (!promptEl) return;
    promptEl.textContent = promptStr();
    // root (after sudo) gets a glowing animated rainbow prompt.
    promptEl.classList.toggle("root-rainbow", rootMode && !pwMode);
  }

  function setPwMode(on, action) {
    pwMode = on;
    pwAction = on ? (action || "shutdown") : "";
    refreshPrompt();
    menuEl.hidden = true;
  }

  // Handle an ENTER while inside the /admin state machine. Returns true if the
  // input was consumed (so onEnter should stop after).
  function adminEnter(text) {
    if (adminState === "menu") {
      if (text === "1") {
        addLine('<span class="prompt">admin&gt;</span> <span class="echo">1</span>');
        adminState = ""; refreshPrompt();   // suspend the menu prompt during scan
        wifiScan(); return true;
      }
      if (text === "2") {
        addLine('<span class="prompt">admin&gt;</span> <span class="echo">2</span>');
        openShell(); return true;   // reboots; re-shows the menu only on failure
      }
      addLine("? pick 1 or 2 (esc to exit).", "err");
      return true;
    }
    if (adminState === "wifi-pick") {
      var n = parseInt(text, 10);
      if (!n || !adminWifi || n < 1 || n > adminWifi.networks.length) {
        addLine("? not a valid choice — enter a number from the list.", "err");
        return true;
      }
      var net = adminWifi.networks[n - 1];
      adminWifi.picked = net;
      addLine('<span class="prompt">admin/wifi&gt;</span> <span class="echo">' +
        esc(text) + "</span> — selected <b>" + esc(net.ssid) + "</b>");
      if (!net.security || net.security === "open" || net.security === "--") {
        // Open network: connect without prompting for a PSK.
        adminState = ""; refreshPrompt();
        wifiConnect(net.ssid, "");
      } else {
        adminState = "wifi-psk"; refreshPrompt();
        addLine("· enter password for " + esc(net.ssid) + " (esc to cancel).", "muted");
      }
      return true;
    }
    if (adminState === "wifi-psk") {
      var psk = text;   // already in buffer, raw
      var ssid = adminWifi && adminWifi.picked ? adminWifi.picked.ssid : "";
      addLine('<span class="prompt">admin/wifi&gt;</span> <span class="echo">' +
        "*".repeat(psk.length) + "</span>");
      adminState = ""; refreshPrompt();
      if (ssid) wifiConnect(ssid, psk); else adminMenu();
      return true;
    }
    return false;
  }

  // `sudo` jokingly "grants" root with no password (XKCD #149 energy): flips the
  // prompt to root@orangecon for 30s, then drops back to the mortal divd user.
  function grantRoot(ms) {
    rootMode = true;
    refreshPrompt();
    if (rootTimer) clearTimeout(rootTimer);
    rootTimer = setTimeout(function () {
      rootMode = false; refreshPrompt();
      addLine("· sudo session expired — you are mortal divd again.", "muted");
    }, ms || 30000);
  }

  function shellEcho(cmd) {
    addLine('<span class="prompt">' + esc(promptStr()) +
      '</span> <span class="echo">' + esc(cmd) + "</span>");
  }

  // Fake-shell intercepts (sudo, the sandwich meme). Returns true if handled.
  function handleShell(text) {
    var t = text.toLowerCase().replace(/\s+/g, " ").trim();
    if (t === "make me a sandwich") {
      shellEcho(text);
      addLine("What? Make it yourself.", "err");
      return true;
    }
    if (t === "sudo make me a sandwich") {
      shellEcho(text);
      addLine("Okay. I'll make you a sandwich.", "ok");
      grantRoot(30000);
      addLine("· root granted — no password needed (bold!). reverts in 30s.", "muted");
      return true;
    }
    if (t === "sudo" || t.indexOf("sudo ") === 0) {
      shellEcho(text);
      var rest = text.slice(4).trim();
      if (!rest) {
        addLine("usage: sudo &lt;command&gt;   (psst: try \"sudo make me a sandwich\")", "muted");
        return true;
      }
      addLine("We trust you have received the usual lecture from the local System", "muted");
      addLine("Administrator. It usually boils down to: respect others' privacy.", "muted");
      addLine("[sudo] password for divd: ******** — just kidding, you're root now.", "info");
      grantRoot(30000);
      return true;
    }
    return false;
  }

  function doPower(action, password) {
    busy = true;
    addLine("» authenticating…", "info");
    fetch("/" + action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password })
    }).then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
      .then(function (res) {
        if (res.d.ok) {
          var msg = action === "reboot"
            ? "root access granted. HACK THE PLANET! rebooting…"
            : "root access granted. HACK THE PLANET! powering down…";
          addLine(msg, "banner");
        } else {
          addLine("✗ " + esc(res.d.error || "ACCESS DENIED") + " — incident logged.", "err");
        }
      }).catch(function (e) {
        addLine("✗ " + esc(action) + " error: " + esc(e.message || e), "err");
      }).finally(function () { busy = false; });
  }

  // ---- /admin: password gate, wifi sub-flow, shell overlay --------------- //
  function adminMenu() {
    adminState = "menu"; refreshPrompt();
    addLine("· admin console — pick one:", "info");
    addLine('  <span class="prompt">1)</span> <span class="muted">scan &amp; connect to wifi</span>');
    addLine('  <span class="prompt">2)</span> <span class="muted">reboot into a login terminal</span>');
    addLine('  <span class="muted">esc to exit admin.</span>');
  }
  function adminExit(reason) {
    adminState = ""; adminAuth = ""; adminWifi = null;
    refreshPrompt();
    if (reason) addLine("· " + esc(reason), "muted");
  }
  function doAdminAuth(password) {
    busy = true;
    addLine("» authenticating…", "info");
    fetch("/admin-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password })
    }).then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
      .then(function (res) {
        if (res.d.ok) {
          adminAuth = password;
          addLine("✓ access granted. HACK THE PLANET!", "ok");
          adminMenu();
        } else {
          addLine("✗ " + esc(res.d.error || "ACCESS DENIED") + " — incident logged.", "err");
        }
      }).catch(function (e) {
        addLine("✗ admin error: " + esc(e.message || e), "err");
      }).finally(function () { busy = false; });
  }
  function wifiScan() {
    busy = true;
    addLine("» scanning for wifi networks…", "info");
    fetch("/admin-wifi-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminAuth })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) {
        addLine("✗ scan failed: " + esc(d.error || "unknown"), "err");
        adminMenu(); return;
      }
      adminWifi = { networks: d.networks || [], picked: null };
      if (!adminWifi.networks.length) {
        addLine("· no networks found.", "muted");
        adminMenu(); return;
      }
      adminWifi.networks.forEach(function (n, i) {
        var bars = "▂▄▆█".slice(0, Math.max(1, Math.min(4, Math.round(n.signal / 25))));
        var star = n.in_use ? "*" : " ";
        addLine('  <span class="prompt">' + esc(("" + (i + 1)).padStart(2, " ")) +
          ")</span> " + star + " " + esc(bars.padEnd(4, "_")) +
          '  <span class="ok">' + esc(n.ssid) + '</span>' +
          '  <span class="muted">' + esc(n.security || "open") +
          " · " + esc("" + n.signal) + "%</span>");
      });
      adminState = "wifi-pick"; refreshPrompt();
      addLine("· enter # to connect, esc to cancel.", "muted");
    }).catch(function (e) {
      addLine("✗ network error: " + esc(e.message || e), "err");
      adminMenu();
    }).finally(function () { busy = false; });
  }
  function wifiConnect(ssid, psk) {
    busy = true;
    addLine("» connecting to " + esc(ssid) + "…", "info");
    fetch("/admin-wifi-connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminAuth, ssid: ssid, psk: psk || "" })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.ok) {
        addLine("✓ connected: " + esc(d.msg || ssid), "ok");
      } else {
        addLine("✗ " + esc(d.error || "connect failed"), "err");
      }
    }).catch(function (e) {
      addLine("✗ network error: " + esc(e.message || e), "err");
    }).finally(function () {
      busy = false;
      adminMenu();
    });
  }
  // "Login terminal" reboots the Pi once into a plain getty login on the main
  // screen (no web terminal — ttyd is gone). It POSTs to /admin-shell, which
  // writes the one-shot boot-to-shell flag and reboots; divd's ~/.profile clears
  // the flag on login, so the reboot after that returns to the kiosk. On success
  // the box tears the connection down as it goes down — we treat that as the
  // happy path; only a real error response re-shows the menu.
  function openShell() {
    busy = true;
    addLine("» setting boot-to-shell flag and rebooting…", "info");
    fetch("/admin-shell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminAuth })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.ok) {
        addLine("✓ rebooting into a login terminal — log in as <b>divd</b>.", "ok");
        addLine("· one-shot: reboot from the shell to return to the kiosk.", "muted");
      } else {
        addLine("✗ " + esc(d.error || "could not reboot"), "err");
        adminMenu();
      }
    }).catch(function () {
      // A successful reboot drops the connection mid-request — expected here.
      addLine("· connection closed — rebooting into the login terminal…", "muted");
    }).finally(function () { busy = false; });
  }

  // ---- slash-command menu ------------------------------------------------ //
  // Non-mode commands surfaced in the autocomplete menu alongside print modes.
  var MENU_EXTRA = [{ name: "help", description: "list all the secret commands" }];
  function filtered() {
    var q = buffer.slice(1).toLowerCase();
    return MODES.concat(MENU_EXTRA).filter(function (m) { return m.name.indexOf(q) === 0; });
  }

  // ---- live mode preview in the htop pane -------------------------------- //
  // While the slash menu is open, render a sample of the highlighted print mode
  // in place of the htop pane. Reuses the same .mode-<name> CSS that styles the
  // real terminal when a mode is armed, so the preview matches the printout's
  // look. htop.js exposes DIVD_htopPreview(html|null) to take over / release.
  var PREVIEW_SAMPLE = "The internet belongs to everyone.";
  function modePreviewHTML(m) {
    return '<div class="modepreview mode-' + m.name + '">' +
      '<div class="mp-head">' + esc(icon(m.name)) + "  /" + esc(m.name) +
        ' <span class="mp-label">' + esc(m.label || "") + "</span></div>" +
      '<div class="mp-desc">' + esc(m.description || "") + "</div>" +
      '<div class="mp-sample"><div class="term"><div class="ln">' +
        '<span class="prompt">idea&gt;</span> <span class="echo">' +
        esc(PREVIEW_SAMPLE) + "</span></div></div></div>" +
      '<div class="mp-foot">live preview &middot; ENTER to arm for the next print</div>' +
      "</div>";
  }
  function clearPreview() {
    if (window.DIVD_htopPreview) window.DIVD_htopPreview(null);
  }
  function previewHighlighted(list) {
    // MODES have a `label`; the only non-mode menu row ("help") doesn't.
    var m = list && list[sel];
    if (m && m.label && window.DIVD_htopPreview) {
      window.DIVD_htopPreview(modePreviewHTML(m));
    } else {
      clearPreview();
    }
  }
  function updateMenu() {
    if (pwMode || buffer[0] !== "/") { menuEl.hidden = true; clearPreview(); return; }
    var list = filtered();
    if (sel >= list.length) sel = Math.max(0, list.length - 1);
    var html = '<div class="hint">easter-egg modes — type a name + ENTER (or ↑/↓ then ENTER). /off cancels.</div>';
    if (!list.length) {
      html += '<div class="row"><span class="ds">no mode matches "' +
        esc(buffer.slice(1)) + '"</span></div>';
    }
    list.forEach(function (m, i) {
      html += '<div class="row' + (i === sel ? " sel" : "") + '">' +
        '<span class="nm">' + esc(icon(m.name)) + " /" + esc(m.name) +
        '</span><span class="ds">' + esc(m.description) + '</span></div>';
    });
    menuEl.innerHTML = html;
    menuEl.hidden = false;
    // keep the highlighted row visible within the scroll box
    var selRow = menuEl.querySelector(".row.sel");
    if (selRow) selRow.scrollIntoView({ block: "nearest" });
    previewHighlighted(list);   // mirror the highlighted mode in the htop pane
  }

  // Restyle the screen to preview the armed mode (CSS keys off body.mode-<name>).
  var lastModeClass = "";
  function syncModeClass() {
    if (lastModeClass) document.body.classList.remove(lastModeClass);
    lastModeClass = activeMode ? ("mode-" + activeMode) : "";
    if (lastModeClass) document.body.classList.add(lastModeClass);
  }

  function showModebar() {
    syncModeClass();
    if (!activeMode) { modebarEl.hidden = true; return; }
    var m = MODE_BY_NAME[activeMode];
    modebarEl.innerHTML = esc(icon(m.name)) + " " +
      'MODE ENGAGED: <b>' + esc(m.name) + '</b> — ' + esc(m.description) +
      '<br>your next idea prints like this. (type /off to cancel)';
    modebarEl.hidden = false;
  }

  // ---- command / idea handling ------------------------------------------ //
  function applyMode(name) {
    if (name === "off" || name === "normal" || name === "cancel") {
      activeMode = ""; showModebar();
      addLine("· mode cancelled — back to normal.", "muted");
      return;
    }
    if (MODE_BY_NAME[name]) {
      activeMode = name; showModebar();
      addLine("· mode <b>" + esc(name) + "</b> armed.", "info");
    } else {
      addLine("? unknown mode: /" + esc(name) +
        " — type / to see the list.", "err");
    }
  }

  // ---- print rate limit: 1 receipt / 15s, with a fake "warming up" bar ---- //
  var lastPrintAt = 0, PRINT_COOLDOWN = 15000;
  var WARMUP_MSGS = [
    "heating up thermal printer", "collecting bits", "aligning the print head",
    "spooling receipt buffer", "charging the flux capacitor",
    "warming the thermal element", "negotiating with /dev/usb/lp0",
    "compressing your genius", "de-tangling the paper feed"
  ];
  function repeat(c, n) { return n > 0 ? new Array(n + 1).join(c) : ""; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  // Randomised flavour text so the terminal feels alive and never repeats.
  var PRINT_GO = [
    "rendering receipt… engaging thermal printer…",
    "dithering your idea down to glorious 1-bit…",
    "feeding paper, aligning the print head…",
    "transmitting idea to /dev/usb/lp0…",
    "rasterising brilliance at 512 dots wide…",
    "committing your genius to thermal paper…",
    "spinning up the receipt cannon…"
  ];
  var PRINT_OK = [
    "*chunk* paper cut — grab it!",
    "fresh off the thermal press, mind the curl.",
    "printed in glorious 1-bit. collect your receipt!",
    "another idea immortalised on 58mm paper.",
    "*brrrt* receipt dispensed. tip your printer.",
    "done — that one's going in the museum.",
    "ejected! handle with care, ideas are fragile.",
    "logged & printed. the revolution will be receipted."
  ];
  var PRINT_QUIPS = [
    "fun fact: responsible disclosure saved someone's weekend today.",
    "DIVD tip: rotate your passwords, not your tyres.",
    "this receipt is more secure than your IoT kettle.",
    "remember: hack the planet, not the people. <3",
    "psst… the bug bounty is real, the cake is a lie.",
    "your idea has been peer-reviewed by 0 volunteers. ship it!",
    "now 100% air-gapped and 0% in the cloud.",
    "Het internet is van iedereen. De verdediging ook. — Project Lacewing",
    "The internet belongs to everyone. So does its defense. — Project Lacewing",
    "Project Lacewing: Europe's open answer to closed-model bug hunting.",
    "the lacewing eats the bug — AI finds the plague, we hunt it.",
    "open weights, no gatekeepers, 0 EUR/Mtok. that's the dream. (try /lacewing)",
    "Glasswing is a step forward — but for whom? (try /lacewing)",
    "DIVD by the numbers: 189 volunteers · 193 cases · 1.4M IPs notified.",
    "want in on Project Lacewing? mail lacewing@divd.nl <3"
  ];

  // Resolve(true) once it's OK to print; if we're inside the cooldown, animate a
  // countdown loading bar for the remaining time first. Esc cancels the wait and
  // resolves(false) so the pending job is skipped (see the Esc handler below).
  var activeWarmup = null;   // {cancel: fn} while a loading bar is running
  function printGate() {
    return new Promise(function (resolve) {
      var wait = PRINT_COOLDOWN - (Date.now() - lastPrintAt);
      if (wait <= 0) { resolve(true); return; }
      // Make the rate limit explicit so people know it's intentional.
      addLine("· printing is rate-limited to 1 receipt / " +
        (PRINT_COOLDOWN / 1000) + "s — your idea is queued.", "muted");
      var div = document.createElement("div");
      div.className = "ln info";
      out.insertBefore(div, promptLine);
      var start = Date.now(), msg = WARMUP_MSGS[Math.floor(Math.random() * WARMUP_MSGS.length)];
      var iv = setInterval(function () {
        var el = Date.now() - start, frac = Math.min(1, el / wait);
        var W = 22, fill = Math.round(W * frac);
        if (Math.random() < 0.12) msg = WARMUP_MSGS[Math.floor(Math.random() * WARMUP_MSGS.length)];
        div.innerHTML = "» " + esc(msg) + "… [" + repeat("#", fill) + repeat("-", W - fill) +
          "] rate-limit " + Math.ceil(Math.max(0, wait - el) / 1000) +
          "s  <span class=\"muted\">(Esc cancels)</span>";
        out.scrollTop = out.scrollHeight;
        if (el >= wait) {
          clearInterval(iv); activeWarmup = null;
          div.innerHTML = "» printer ready. *chunk*";
          resolve(true);
        }
      }, 100);
      activeWarmup = function () {
        clearInterval(iv); activeWarmup = null;
        div.className = "ln muted";
        div.innerHTML = "✗ print cancelled — job skipped.";
        out.scrollTop = out.scrollHeight;
        resolve(false);
      };
    });
  }

  function submitIdea(text) {
    busy = true;
    var mode = activeMode;
    var modeNote = mode ? '  <span class="muted">[' + esc(mode) + "]</span>" : "";
    addLine('<span class="prompt">divd@orangecon:~$</span> <span class="echo">' +
      esc(text) + "</span>" + modeNote);
    activeMode = ""; showModebar();   // mode is consumed by this print

    printGate().then(function (proceed) {
      if (!proceed) return;   // cancelled during the warmup
      addLine("» " + pick(PRINT_GO), "info");
      lastPrintAt = Date.now();
      return fetch("/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": window.DIVD_CSRF },
        body: JSON.stringify({ text: text, mode: mode })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) {
          addLine("✓ printed receipt #" + d.id + " — " + pick(PRINT_OK), "ok");
          if (Math.random() < 0.4) addLine("  " + pick(PRINT_QUIPS), "muted");
          if (window.DIVD_fireworks) window.DIVD_fireworks(1900);
          if (countEl && typeof d.id === "number") countEl.textContent = d.id;
        } else {
          addLine("✗ printer error: " + esc(d.error || "unknown") +
            " (idea was still saved)", "err");
        }
      }).catch(function (e) {
        addLine("✗ network error: " + esc(e.message || e), "err");
      });
    }).finally(function () { busy = false; });
  }

  // Print one of the easter-egg images (cat/hackerman); same 15s rate limit.
  function printImage(which) {
    printGate().then(function (proceed) {
      if (!proceed) return;   // cancelled during the warmup
      addLine("» printing " + esc(which) + " on a receipt…", "info");
      lastPrintAt = Date.now();
      return fetch("/printimg", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": window.DIVD_CSRF },
        body: JSON.stringify({ which: which })
      }).then(function (r) { return r.json(); }).then(function (d) {
        addLine(d.ok ? "✓ " + esc(which) + " printed — " + pick(PRINT_OK)
          : "✗ couldn't print " + esc(which) + ": " + esc(d.error || "unknown"),
          d.ok ? "ok" : "err");
        if (d.ok && window.DIVD_fireworks) window.DIVD_fireworks(1900);
      }).catch(function (e) {
        addLine("✗ network error: " + esc(e.message || e), "err");
      });
    });
  }
  window.DIVD_printImage = printImage;

  // ---- /demo hooks: drive the terminal like a real visitor (no network) --- //
  window.DIVD_say = function (text, cls) { addLine(text, cls); };

  var demoReceipt = 1300 + Math.floor(Math.random() * 250);
  // Animate "typing" a sample idea, then fake a printed-receipt confirmation —
  // purely on-screen theatre (does NOT hit the printer or burn paper).
  window.DIVD_demoType = function (text, modeName, done) {
    if (busy) { if (done) done(); return; }
    bumpActivity();
    busy = true;
    buffer = ""; renderCmd();
    var i = 0;
    (function typeNext() {
      if (i < text.length) {
        buffer += text.charAt(i++); renderCmd();
        out.scrollTop = out.scrollHeight;
        setTimeout(typeNext, 38 + Math.random() * 55);
      } else { setTimeout(finish, 360); }
    })();
    function finish() {
      var note = modeName ? '  <span class="muted">[' + esc(modeName) + "]</span>" : "";
      addLine('<span class="prompt">' + esc(promptStr()) + '</span> <span class="echo">' +
        esc(text) + "</span>" + note);
      buffer = ""; renderCmd();
      addLine("» " + pick(PRINT_GO), "info");
      setTimeout(function () {
        addLine("✓ printed receipt #" + (++demoReceipt) + " — " + pick(PRINT_OK), "ok");
        if (countEl) countEl.textContent = demoReceipt;
        if (Math.random() < 0.4) addLine("  " + pick(PRINT_QUIPS), "muted");
        busy = false;
        if (done) done();
      }, 700 + Math.random() * 500);
    }
  };

  function onEnter() {
    if (busy) return;

    // Reading a hidden power-command password (/shutdown or /reboot or /admin).
    if (pwMode) {
      var pw = buffer, action = pwAction;
      buffer = ""; setPwMode(false); renderCmd();
      if (!pw) { addLine("· " + action + " cancelled.", "muted"); return; }
      if (action === "admin") doAdminAuth(pw);
      else doPower(action, pw);
      return;
    }

    // Inside the /admin state machine (post-auth): route to its handler.
    if (adminState) {
      // PSK keeps spaces verbatim; menu/pick numbers are trimmed.
      var raw = adminState === "wifi-psk" ? buffer : buffer.trim();
      buffer = ""; renderCmd(); updateMenu();
      adminEnter(raw);
      return;
    }

    var text = buffer.trim();
    // Empty ENTER: just advance the prompt (echo a blank prompt line), no print.
    if (!text) {
      addLine('<span class="prompt">' + esc(promptStr()) + "</span>");
      buffer = ""; renderCmd(); updateMenu();
      return;
    }

    // Hidden commands: /shutdown, /reboot, /admin -> prompt for a password.
    var lc = text.toLowerCase();
    if (lc === "/shutdown" || lc === "/reboot" || lc === "/admin") {
      var act = lc.slice(1);
      addLine('<span class="prompt">divd@orangecon:~$</span> <span class="echo">/' +
        act + "</span>");
      buffer = ""; sel = 0; setPwMode(true, act); renderCmd();
      return;
    }

    // Other hidden commands (visual easter eggs, not shown in the menu).
    if (text[0] === "/") {
      var hn = text.slice(1).toLowerCase();
      var hc = HIDDEN[hn];
      if (hc) {
        addLine('<span class="prompt">divd@orangecon:~$</span> <span class="echo">' +
          esc(text) + '</span>');
        if (LED_FX[hn]) ledFx(LED_FX[hn]);
        hc();
        buffer = ""; sel = 0; renderCmd(); updateMenu();
        return;
      }
    }

    if (text[0] === "/") {
      var list = filtered();
      // prefer the highlighted menu row, else the exact name typed
      var chosen = ((buffer[0] === "/" && list[sel]) ? list[sel].name : text.slice(1)).toLowerCase();
      // a hidden command picked from the menu (e.g. /help) runs as a command
      if (HIDDEN[chosen]) {
        addLine('<span class="prompt">divd@orangecon:~$</span> <span class="echo">/' +
          esc(chosen) + "</span>");
        if (LED_FX[chosen]) ledFx(LED_FX[chosen]);
        HIDDEN[chosen]();
      } else {
        applyMode(chosen);
      }
      buffer = ""; sel = 0; renderCmd(); updateMenu();
      return;
    }

    // Fake-shell easter eggs (sudo, "make me a sandwich") before printing.
    if (handleShell(text)) {
      buffer = ""; sel = 0; renderCmd(); updateMenu();
      return;
    }

    submitIdea(text);
    buffer = ""; sel = 0; renderCmd(); updateMenu();
  }

  // Escape: close the slash menu / cancel password entry instead of triggering
  // the breakout flash. Registered in the shared handler chain (guard.js).
  (window.DIVD_escHandlers = window.DIVD_escHandlers || []).push(function () {
    if (activeWarmup) { activeWarmup(); return true; }  // cancel a pending print
    if (pwMode) {
      var act = pwAction;
      buffer = ""; setPwMode(false); renderCmd();
      addLine("· " + act + " cancelled.", "muted");
      return true;
    }
    if (adminState) {
      buffer = ""; renderCmd();
      adminExit("admin session exited.");
      return true;
    }
    if (buffer && buffer[0] === "/") {
      buffer = ""; sel = 0; renderCmd(); updateMenu();
      return true;
    }
    if (!menuEl.hidden) { menuEl.hidden = true; clearPreview(); return true; }
    return false;  // nothing to close -> let guard.js do its red flash
  });

  // ---- hidden slash commands (not in the menu) --------------------------- //
  function hackSequence() {
    var steps = [
      ["initializing exploit framework…", "info"],
      ["scanning 10.13.37.0/24 ............ 1337 hosts up", "muted"],
      ["bruteforcing root@mainframe ......", "muted"],
      ["[####------] 41%", "muted"],
      ["[########--] 83%", "muted"],
      ["ACCESS GRANTED — welcome, operator", "ok"],
      ["downloading the entire internet ..", "muted"],
      ["just kidding :) now type a real idea.", "banner"]
    ];
    steps.forEach(function (s, i) {
      setTimeout(function () { addLine(s[0], s[1]); }, 350 * (i + 1));
    });
  }

  // /lacewing — DIVD's pitch in miniature: a local, open-weights AI finds and
  // fixes a decades-old bug in critical open source, discloses responsibly, and
  // makes the case for a European, community answer to Glasswing. Prints the
  // manifesto into the terminal AND fires the logo-pane takeover (lacewing.js).
  function lacewingManifesto() {
    var steps = [
      ["» Apr 7, 2026: Anthropic launched Project Glasswing.", "info"],
      ["  backed by Amazon, Apple, Microsoft, Google, NVIDIA, JPMorgan, Cisco…", "muted"],
      ["  model access: $25-125 per million tokens. Glasswing is a step", "muted"],
      ["  forward — but for whom?", "muted"],
      ["» Project Lacewing — booting LOCAL open-weights model…", "info"],
      ["  qwen2.5-coder-32b (local) · air-gapped · 0 EUR/Mtok · no gatekeepers", "muted"],
      ["» scanning critical open-source software for vulnerabilities…", "info"],
      ["  the barrier to finding vulnerabilities is structurally dropping.", "muted"],
      ["  AI now finds bugs that sat in critical code for 10, 20, 30 years.", "muted"],
      ["  the question isn't IF these capabilities arrive — it's WHO holds them.", "muted"],
      ["✓ found it. patched it. disclosed to the maintainer FIRST.", "ok"],
      ["  responsible disclosure: first the party involved, then the world.", "muted"],
      ["  proven track record: 189 volunteers · 193 cases · 1.4M IPs notified.", "muted"],
      ["The internet belongs to everyone. So does its defense.", "banner"],
      ["Het internet is van iedereen. De verdediging ook.", "banner"],
      ["  Project Lacewing — Europe's open, non-profit answer to Glasswing.", "info"],
      ["  get involved: technical · fundraising · champion → lacewing@divd.nl <3", "ok"]
    ];
    steps.forEach(function (s, i) {
      setTimeout(function () { addLine(s[0], s[1]); }, 420 * (i + 1));
    });
    if (window.DIVD_lacewing) window.DIVD_lacewing();   // logo-pane takeover too
  }

  // /help (aliases /? /rftm /rtfm) — reveal the hidden commands that aren't in
  // the slash-mode menu. The print modes are still discoverable by typing "/".
  function showHelp() {
    var rows = [
      ["/", "print-mode menu (comicsans, big, glitch…)"],
      ["/update", "fake OS update screens"],
      ["/wannacry", "fake WannaCry ransom screen (a prank!)"],
      ["/bsod", "fake blue screen of death"],
      ["/matrix", "Konami-style matrix rain"],
      ["/cat  /hackerman", "show + print a cat / hackerman"],
      ["/hack", "\"hack the planet\" sequence"],
      ["/lacewing", "Project Lacewing — DIVD's open answer to Glasswing"],
      ["/clear  (Ctrl-L)", "clear the terminal · Ctrl +/- zooms"],
      ["/demo", "auto-tour every easter egg (Esc stops)"],
      ["↑↑↓↓←→←→ B A", "the Konami code ;)"]
    ];
    addLine("· secret commands — type one + ENTER:", "info");
    rows.forEach(function (r) {
      addLine('<span class="prompt">' + esc(r[0]) +
        '</span>  <span class="muted">' + esc(r[1]) + "</span>");
    });
  }

  var HIDDEN = {
    shutdown: null,  // handled separately (password)
    matrix: function () { if (window.DIVD_matrix) window.DIVD_matrix(); },
    bounce: function () { if (window.DIVD_dvdBounce) window.DIVD_dvdBounce(60000); },
    defrag: function () { if (window.DIVD_defrag) window.DIVD_defrag(); },
    bsod: function () { if (window.DIVD_bsod) window.DIVD_bsod(); },
    glitch_screen: function () { if (window.DIVD_screenGlitch) window.DIVD_screenGlitch(); },
    hack: hackSequence,
    lacewing: lacewingManifesto,
    glasswing: lacewingManifesto,
    gaasvlieg: lacewingManifesto,
    cat: function () {
      if (window.DIVD_showImage) window.DIVD_showImage("/static/img/cat.jpg", "meow.");
      printImage("cat");   // also print it on a receipt (rate-limited)
    },
    hackerman: function () {
      if (window.DIVD_showImage) window.DIVD_showImage("/static/img/hackerman.jpg", "HACKERMAN");
      printImage("hackerman");
    },
    wannacry: function () { if (window.DIVD_wannacry) window.DIVD_wannacry(); },
    wnc: function () { if (window.DIVD_wannacry) window.DIVD_wannacry(); },
    msf: function () { if (window.DIVD_msf) window.DIVD_msf(); },
    metasploit: function () { if (window.DIVD_msf) window.DIVD_msf(); },
    calc: function () { if (window.DIVD_calc) window.DIVD_calc(); },
    pop: function () { if (window.DIVD_calc) window.DIVD_calc(); },
    tv: function () { if (window.DIVD_crt) window.DIVD_crt(); },
    crt: function () { if (window.DIVD_crt) window.DIVD_crt(); },
    tvoff: function () { if (window.DIVD_crt) window.DIVD_crt(); },
    demo: function () { if (window.DIVD_demo) window.DIVD_demo(); },
    breakout: function () { if (window.DIVD_breakout) window.DIVD_breakout(); },
    arkanoid: function () { if (window.DIVD_breakout) window.DIVD_breakout(); },
    clear: clearTerminal,
    cls: clearTerminal,
    // fakeupdate.net-style fullscreen fake OS update screens (any key exits)
    winupdate: function () { if (window.DIVD_fakeupdate) window.DIVD_fakeupdate("win"); },
    macupdate: function () { if (window.DIVD_fakeupdate) window.DIVD_fakeupdate("mac"); },
    ubuntu:    function () { if (window.DIVD_fakeupdate) window.DIVD_fakeupdate("ubuntu"); },
    update: function () {
      if (!window.DIVD_fakeupdate) return;
      var skins = ["win", "mac", "ubuntu"];
      window.DIVD_fakeupdate(skins[Math.floor(Math.random() * skins.length)]);
    },
    help: showHelp,
    "?": showHelp,
    rftm: showHelp,
    rtfm: showHelp
  };

  // Let easter eggs (e.g. the Konami code) wipe the input line.
  window.DIVD_clearInput = function () {
    buffer = ""; sel = 0; if (pwMode) setPwMode(false); renderCmd(); updateMenu();
  };

  // ---- key capture ------------------------------------------------------- //
  document.addEventListener("keydown", function (e) {
    // guard.js already swallowed dangerous combos at capture phase.
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    bumpActivity();
    var k = e.key;

    if (k === "Enter") { e.preventDefault(); onEnter(); return; }
    if (k === "Backspace") { e.preventDefault(); buffer = buffer.slice(0, -1);
      renderCmd(); updateMenu(); return; }
    if (k === "Tab") {            // autocomplete current mode
      e.preventDefault();
      if (buffer[0] === "/") { var l = filtered(); if (l[sel]) {
        buffer = "/" + l[sel].name; renderCmd(); updateMenu(); } }
      return;
    }
    if (k === "ArrowUp")   { e.preventDefault(); if (buffer[0] === "/") {
      sel = Math.max(0, sel - 1); updateMenu(); } return; }
    if (k === "ArrowDown") { e.preventDefault(); if (buffer[0] === "/") {
      sel = sel + 1; updateMenu(); } return; }

    if (k.length === 1 && buffer.length < MAXLEN) {
      e.preventDefault();
      buffer += k; sel = 0; renderCmd(); updateMenu();
    }
  }, false);

  // ---- idle "attract mode" ----------------------------------------------- //
  // While someone is typing the screen fills normally (prompt at the bottom).
  // After a short lull the content slowly scrolls up line-by-line — via a
  // growing "scrolloff" spacer below the prompt — until the prompt floats at
  // roughly the top 25% of the pane, leaving inviting empty space below. After
  // a full minute of silence we also drop the occasional "type an idea" nudge.
  var INVITES = [
    "got an idea to make the internet a bit safer? type it + ENTER…",
    "this thermal printer is hungry for ideas — go on, feed it.",
    "psst… type something and watch it print on real paper.",
    "share a wild idea. bad ideas welcome too!",
    "the cursor is blinking at you. type away ;)",
    "what would YOU fix in security today? start typing…",
    "tip: type / for secret modes, or just type an idea.",
    "yes, you. got a thought? the receipt printer is listening.",
    "Project Lacewing needs you — technical, fundraising, champion. mail lacewing@divd.nl",
    "curious what an open, European bug-hunting AI looks like? type /lacewing",
    "the internet belongs to everyone — so does its defense. got an idea? type it."
  ];
  idleSpacer = document.createElement("div");
  idleSpacer.style.height = "0px";
  idleSpacer.setAttribute("aria-hidden", "true");
  out.appendChild(idleSpacer);

  var SCROLL_AFTER = 12000;     // start the slow drift-up after 12s of silence
  var INVITE_AFTER = 60000;     // first nudge only after a full minute
  var INVITE_GAP = 50000;       // then space the nudges well apart
  var lastInvite = 0;
  function lineHeightPx() {
    var cs = getComputedStyle(out), lh = parseFloat(cs.lineHeight);
    if (!(lh > 0)) lh = (parseFloat(cs.fontSize) || 25) * 1.3;
    return lh;
  }
  setInterval(function () {
    // never interrupt typing, a print, a password prompt or the slash menu
    if (busy || pwMode || buffer.length || (menuEl && !menuEl.hidden)) return;
    var idle = Date.now() - lastActivity;
    if (idle < SCROLL_AFTER) return;
    // grow the spacer one line at a time -> content scrolls up gently until the
    // prompt sits ~25% down the pane, then holds there.
    var cap = Math.round(out.clientHeight * 0.72);
    var h = parseInt(idleSpacer.style.height, 10) || 0;
    if (h < cap) {
      idleSpacer.style.height = Math.min(cap, h + lineHeightPx()) + "px";
      out.scrollTop = out.scrollHeight;
    }
    if (idle >= INVITE_AFTER && Date.now() - lastInvite >= INVITE_GAP) {
      lastInvite = Date.now();
      addLine("» " + esc(pick(INVITES)), "muted");   // addLine keeps prompt in view
    }
  }, 2000);

  // ---- boot banner ------------------------------------------------------- //
  var BANNER = [
    ['<span class="banner"> ____  ___ __     __ ____  </span>', "banner"],
    ['<span class="banner">|  _ \\|_ _|\\ \\   / /|  _ \\ </span>', "banner"],
    ['<span class="banner">| | | || |  \\ \\ / / | | | |</span>', "banner"],
    ['<span class="banner">| |_| || |   \\ V /  | |_| |</span>', "banner"],
    ['<span class="banner">|____/|___|   \\_/   |____/ </span>', "banner"],
    ["", ""],
    ["DIVD idea_collector v1.337 — Dutch Institute for Vulnerability Disclosure", "info"],
    ["booting receipt subsystem… [ OK ]   thermal printer /dev/usb/lp0 [ ONLINE ]", "muted"],
    ["Project Lacewing // open · European · responsible — type <b>/lacewing</b>", "banner"],
    ['"The internet belongs to everyone. So does its defense." — DIVD', "info"],
    ["", ""],
    ["Type an idea and press ENTER — it prints on a receipt and is saved.", "ok"],
    ["Type <b>/</b> to reveal secret easter-egg modes (comicsans, big, glitch…).", "ok"],
    ["", ""]
  ];
  BANNER.forEach(function (b) { addLine(b[0], b[1]); });

  // live idea counter
  fetch("/stats").then(function (r) { return r.json(); }).then(function (d) {
    if (countEl) countEl.textContent = d.count;
  }).catch(function () {});

  // status-bar clock
  var clockEl = document.getElementById("sb-clock");
  function tick() {
    if (!clockEl) return;
    var d = new Date();
    clockEl.textContent = ("" + d.getHours()).padStart(2, "0") + ":" +
      ("" + d.getMinutes()).padStart(2, "0") + ":" +
      ("" + d.getSeconds()).padStart(2, "0");
  }
  tick(); setInterval(tick, 1000);

  renderCmd();
})();
