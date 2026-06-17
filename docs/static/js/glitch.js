/* glitch.js — drives the RGB-split / slice glitch on the DIVD logo.
 * The three SVG layers (base/red/cyan) are nudged apart in random bursts so
 * the logo mostly sits still, then briefly "datamoshes".
 */
(function () {
  "use strict";
  var logo = document.getElementById("glitch-logo");
  var tag = document.getElementById("logo-tag");
  if (!logo) return;

  var red = logo.querySelector(".layer.red");
  var cyan = logo.querySelector(".layer.cyan");

  var TAGS = [
    "DUTCH INSTITUTE FOR VULNERABILITY DISCLOSURE",
    "// CVD done right",
    "we hack to protect",
    "0xDIVD // securing the digital world",
    "report it. fix it. disclose it.",
    "volunteers > vulnerabilities"
  ];

  function burst() {
    var dx = (Math.random() * 14 - 7).toFixed(1);
    var dy = (Math.random() * 6 - 3).toFixed(1);
    if (red) red.style.transform = "translate(" + dx + "px," + dy + "px)";
    if (cyan) cyan.style.transform = "translate(" + (-dx) + "px," + (-dy) + "px)";
    logo.classList.add("glitching");

    setTimeout(function () {
      // settle back to aligned
      if (red) red.style.transform = "translate(0,0)";
      if (cyan) cyan.style.transform = "translate(0,0)";
      logo.classList.remove("glitching");
    }, 180 + Math.random() * 260);

    if (tag && Math.random() < 0.35) {
      tag.textContent = TAGS[Math.floor(Math.random() * TAGS.length)];
    }
  }

  function loop() {
    // Mostly just a calm green semi-static screen; only occasionally buzz.
    if (Math.random() < 0.3) burst();
    setTimeout(loop, 4000 + Math.random() * 7000);
  }
  setTimeout(loop, 1500);

  // Glitch harder for a moment whenever a breakout is attempted.
  window.addEventListener("divd:breakout", function () {
    var n = 0;
    var t = setInterval(function () { burst(); if (++n > 8) clearInterval(t); }, 90);
  });

  // ---- DVD-screensaver bounce -------------------------------------------- //
  var stage = document.getElementById("logo-stage");
  var bouncing = false;
  function startBounce(ms) {
    if (bouncing || !stage) return;
    bouncing = true;
    logo.classList.add("bouncing");
    var r0 = stage.getBoundingClientRect();
    var x = r0.left + 12, y = r0.top + 12, hue = 0;
    // ~30% quicker than before.
    var vx = (Math.random() < 0.5 ? -1 : 1) * (2.4 + Math.random()) * 1.3;
    var vy = (Math.random() < 0.5 ? -1 : 1) * (1.8 + Math.random()) * 1.3;
    var end = Date.now() + (ms || 60000);
    var escaped = false, escDone = false, escStart = 0;
    var baseSpeed = Math.hypot(vx, vy) || 3;
    // once per run: fly OUT of the pane, bounce around a bit, then steer home.
    var jumpAt = Date.now() + 3500 + Math.random() * 3000;
    var ESC_MS = Math.min(10000, Math.max(3000, (ms || 60000) - 4000));
    function bounds() {
      if (escaped) return { l: 0, t: 0, r: window.innerWidth, b: window.innerHeight };
      var rc = stage.getBoundingClientRect();
      return { l: rc.left, t: rc.top, r: rc.right, b: rc.bottom };
    }
    function escTrigger(lw, lh) {
      escDone = true; escaped = true; escStart = Date.now();
      logo.classList.add("escaped");
      if (tag) tag.textContent = "!! ESCAPED THE BOX !!";
      var rc = stage.getBoundingClientRect();
      var cx = rc.left + rc.width / 2 - lw / 2, cy = rc.top + rc.height / 2 - lh / 2;
      var dx = x - cx, dy = y - cy, m = Math.hypot(dx, dy) || 1;
      var burst = Math.max(baseSpeed * 2.4, 7);     // fling outward, out of the box
      vx = dx / m * burst; vy = dy / m * burst;
    }
    function step() {
      if (!bouncing) return;
      var lw = logo.offsetWidth, lh = logo.offsetHeight;
      if (!escDone && Date.now() >= jumpAt) escTrigger(lw, lh);
      if (escaped) {
        var ef = (Date.now() - escStart) / ESC_MS;
        if (ef >= 1) {                              // home: resume calm in-pane bounce
          escaped = false; logo.classList.remove("escaped");
          if (tag) tag.textContent = "DUTCH INSTITUTE FOR VULNERABILITY DISCLOSURE";
          var sp = Math.hypot(vx, vy) || baseSpeed, k2 = baseSpeed / sp;
          vx *= k2; vy *= k2;
        } else if (ef > 0.42) {                     // steer back toward the box, harder over time
          var rc = stage.getBoundingClientRect();
          var hx = rc.left + rc.width / 2 - lw / 2, hy = rc.top + rc.height / 2 - lh / 2;
          var dirx = hx - x, diry = hy - y, dm = Math.hypot(dirx, diry) || 1;
          var want = Math.max(baseSpeed * 1.7, 4);
          var k = 0.04 + (ef - 0.42) / 0.58 * 0.11;
          vx += ((dirx / dm) * want - vx) * k;
          vy += ((diry / dm) * want - vy) * k;
        }
      }
      var b = bounds();
      x += vx; y += vy;
      var hit = false;
      if (x <= b.l) { x = b.l; vx = Math.abs(vx); hit = true; }
      else if (x >= b.r - lw) { x = b.r - lw; vx = -Math.abs(vx); hit = true; }
      if (y <= b.t) { y = b.t; vy = Math.abs(vy); hit = true; }
      else if (y >= b.b - lh) { y = b.b - lh; vy = -Math.abs(vy); hit = true; }
      if (hit) {
        hue = (hue + 53) % 360;
        logo.style.filter = "hue-rotate(" + hue + "deg) drop-shadow(0 0 14px rgba(255,215,54,.5))";
      }
      logo.style.left = x + "px"; logo.style.top = y + "px";
      if (Date.now() < end) requestAnimationFrame(step); else stopBounce();
    }
    // Park it at the start spot and let the shrink transition play out first.
    logo.style.left = x + "px"; logo.style.top = y + "px";
    setTimeout(function () { if (bouncing) requestAnimationFrame(step); }, 380);
  }
  function stopBounce() {
    bouncing = false;
    logo.classList.remove("bouncing"); logo.classList.remove("escaped");
    logo.style.left = ""; logo.style.top = ""; logo.style.filter = "";
    if (tag) tag.textContent = "DUTCH INSTITUTE FOR VULNERABILITY DISCLOSURE";
  }

  // ---- fake BSOD easter egg (/bsod) -------------------------------------- //
  var bsod = document.createElement("div");
  bsod.id = "bsod";
  bsod.innerHTML =
    '<div class="sad">:(</div>' +
    'Your kiosk ran into a problem and needs to collect more ideas.<br><br>' +
    "We're just gathering some error info, then we'll continue having fun.<br><br>" +
    '<span id="bsod-pct">0</span>% complete<br><br>' +
    'Stop code: HACK_THE_PLANET_FAULT<br>' +
    '<div class="hint">(relax — this is a joke. back in a sec, or press Esc…)</div>';
  document.body.appendChild(bsod);
  var bsodTimer = null, bsodInt = null;
  function showBsod() {
    var pe = document.getElementById("bsod-pct"), pct = 0;
    bsod.classList.add("show");
    clearInterval(bsodInt); clearTimeout(bsodTimer);
    bsodInt = setInterval(function () {
      pct = Math.min(100, pct + Math.floor(Math.random() * 15 + 5));
      if (pe) pe.textContent = pct;
      if (pct >= 100) clearInterval(bsodInt);
    }, 350);
    bsodTimer = setTimeout(hideBsod, 6500);
  }
  function hideBsod() {
    bsod.classList.remove("show");
    clearInterval(bsodInt); clearTimeout(bsodTimer);
  }
  window.DIVD_bsod = showBsod;
  (window.DIVD_escHandlers = window.DIVD_escHandlers || []).push(function () {
    if (bsod.classList.contains("show")) { hideBsod(); return true; }
    return false;
  });
  // ~20% chance every ~40s to bounce for a minute.
  setInterval(function () {
    if (!bouncing && Math.random() < 0.20) startBounce(60000);
  }, 40000);
  window.DIVD_dvdBounce = function (ms) { startBounce(ms); };

  // ---- occasional whole-screen glitch blip ------------------------------- //
  function screenGlitch() {
    document.body.classList.add("screenglitch");
    setTimeout(function () { document.body.classList.remove("screenglitch"); }, 300);
  }
  window.DIVD_screenGlitch = screenGlitch;
  (function gloop() {
    if (Math.random() < 0.65) screenGlitch();
    setTimeout(gloop, 9000 + Math.random() * 13000);
  })();

  // Konami code: go wild — bounce + a flurry of glitches.
  window.addEventListener("divd:konami", function () {
    for (var i = 0; i < 6; i++) setTimeout(screenGlitch, i * 180);
    startBounce(60000);
  });
})();
