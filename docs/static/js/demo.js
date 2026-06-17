/* demo.js — hidden /demo command. Runs an unattended ~1.5min guided tour that
 * types sample "ideas" into the terminal (as if a real visitor were using the
 * kiosk) and cycles through every easter egg in turn. Press ESC to stop early.
 * The typed prints are pure theatre — /demo never hits the real printer.
 */
(function () {
  "use strict";
  var running = false;
  var timers = [];
  var DEMO_SECS = 109;          // matches the timeline below

  // ---- countdown bar in the bottom tmux status bar ----------------------- //
  var sbar = document.getElementById("statusbar");
  var badge = null, barFill = null, barSecs = null, barIv = null, barStart = 0;
  function updateBar() {
    var el = (Date.now() - barStart) / 1000;
    var left = Math.max(0, DEMO_SECS - el);
    barFill.style.width = (Math.max(0, 1 - el / DEMO_SECS) * 100) + "%";
    barSecs.textContent = Math.ceil(left) + "s";
  }
  function showBar() {
    if (!sbar || badge) return;
    badge = document.createElement("span");
    badge.className = "sb-demo";
    badge.innerHTML = 'DEMO <span class="sb-demo-track"><i></i></span>' +
      '<b class="sb-demo-secs"></b> · Esc stops';
    var right = sbar.querySelector(".sb-right");
    sbar.insertBefore(badge, right || null);
    barFill = badge.querySelector("i");
    barSecs = badge.querySelector(".sb-demo-secs");
    barStart = Date.now();
    updateBar();
    barIv = setInterval(updateBar, 250);
  }
  function hideBar() {
    if (barIv) { clearInterval(barIv); barIv = null; }
    if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
    badge = null;
  }

  function say(t, c) { if (window.DIVD_say) window.DIVD_say(t, c); }
  function type(t, m, cb) {
    if (window.DIVD_demoType) window.DIVD_demoType(t, m, cb); else if (cb) cb();
  }
  function call(fn, a) { if (typeof window[fn] === "function") window[fn](a); }
  // Light the strip to match the on-screen egg (see LED_FX in terminal.js /
  // EVENT_COLORS in leds.py). Fire-and-forget; lights are decorative.
  function led(fx) { if (window.DIVD_led) window.DIVD_led(fx); }
  // Press a key to dismiss a full-screen egg (its capture listener swallows it
  // before guard.js, so no breakout flash).
  function key() {
    document.dispatchEvent(new KeyboardEvent("keydown",
      { key: "Enter", bubbles: true, cancelable: true }));
  }
  function at(sec, fn) { timers.push(setTimeout(fn, sec * 1000)); }

  var IDEAS = [
    ["free stroopwafels at the DIVD booth", ""],
    ["patch your printers before someone else does", "leet"],
    ["responsible disclosure > full disclosure", ""],
    ["rename all the servers after cheeses", "comicsans"],
    ["automate the boring security stuff", ""],
    ["backups are a love letter to future you", ""],
    ["rotate your secrets like your tyres", "glitch"],
    ["hack the planet, not the people <3", ""],
    ["a kiosk that prints ideas? genius.", "big"],
    ["AI defense for the commons, not just Big Tech", "lacewing"],
    ["the internet belongs to everyone, so does its defense", ""],
    ["open weights + responsible disclosure = Project Lacewing", ""],
    ["give every volunteer a cape", ""],
    ["see you at the next OrangeCon!", ""]
  ];

  function stop(msg) {
    if (!running) return;
    running = false;
    timers.forEach(clearTimeout);
    timers = [];
    hideBar();
    say(msg || "· demo stopped — your turn! type an idea + ENTER.", "info");
  }

  function run() {
    if (running) return;
    running = true;
    timers = [];
    showBar();
    say("· DEMO MODE — auto-touring every easter egg (~100s). press ESC to stop.", "banner");

    var i = 0;
    // Each typed idea pulses the strip green, mirroring a real print.
    function idea(m) { var d = IDEAS[i++ % IDEAS.length]; type(d[0], m === undefined ? d[1] : m); led("print"); }

    at(2,  function () { idea(); });
    at(5,  function () { call("DIVD_screenGlitch"); led("glitch"); });
    at(6,  function () { call("DIVD_calc"); });
    at(9,  function () { idea(); });
    at(12, function () { call("DIVD_msf"); led("msf"); });    // logo pane takeover
    at(15, function () { idea(); });
    at(17, function () { call("DIVD_dvdBounce", 8000); led("bounce"); }); // DVD bounce
    at(26, function () { idea(); });
    at(27, function () { call("DIVD_memtest"); });            // htop -> memtest
    at(27, function () { call("DIVD_lacewing"); led("lacewing"); }); // logo -> Project Lacewing
    at(33, function () { idea(); });
    at(39, function () { call("DIVD_crt"); led("crt"); });    // logo CRT off/on
    at(43, function () { idea(); });
    at(45, function () { call("DIVD_defrag"); led("defrag"); }); // htop -> defrag
    at(50, function () { idea(); });
    at(54, function () { call("DIVD_calc"); });
    at(56, function () { idea(); });
    at(60, function () { call("DIVD_bsod"); led("bsod"); });  // fullscreen BSOD (auto)
    at(69, function () { idea(); });
    // fullscreen eggs, serialised with auto-dismiss
    at(72, function () { call("DIVD_showImage", "/static/img/cat.jpg"); led("image"); });
    at(75, function () { key(); });
    at(76, function () { call("DIVD_showImage", "/static/img/hackerman.jpg"); led("image"); });
    at(79, function () { key(); });
    at(80, function () { idea(); });
    at(83, function () { call("DIVD_fakeupdate", "win"); led("update"); });
    at(86, function () { key(); });
    at(87, function () { call("DIVD_fakeupdate", "ubuntu"); led("update"); });
    at(90, function () { key(); });
    at(92, function () { call("DIVD_wannacry"); led("wannacry"); });
    at(94, function () { key(); });                           // stage0 -> reveal
    at(96, function () { key(); });                           // reveal -> kiosk
    at(98, function () { idea(); });
    at(102, function () { call("DIVD_matrix"); led("matrix"); }); // matrix-rain finale
    at(108, function () {
      document.dispatchEvent(new KeyboardEvent("keydown",
        { key: "Escape", bubbles: true, cancelable: true })); // stop the rain
    });
    at(109, function () {
      running = false; timers = [];
      hideBar();
      say("· demo complete — that's the whole tour! now type your own idea.", "info");
    });
  }

  window.DIVD_demo = run;

  // ESC stops the demo (when no full-screen egg is grabbing the key first).
  (window.DIVD_escHandlers = window.DIVD_escHandlers || []).push(function () {
    if (running) { stop(); return true; }
    return false;
  });
})();
