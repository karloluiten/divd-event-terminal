/* konami.js — the Konami code (↑↑↓↓←→←→ B A) triggers a matrix-rain "cheat
 * activated" sequence and tells the logo/htop to go wild for a bit.
 */
(function () {
  "use strict";
  var SEQ = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
             "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  var pos = 0;

  // matrix-rain canvas + the cheat banner (created up front, hidden)
  var canvas = document.createElement("canvas");
  canvas.id = "matrix-canvas";
  document.body.appendChild(canvas);
  var ctx = canvas.getContext("2d");

  var banner = document.createElement("div");
  banner.className = "cheat-banner";
  banner.innerHTML = '<div class="big">&uarr;&uarr;&darr;&darr;&larr;&rarr;&larr;&rarr; B A</div>' +
    '<div class="small">CHEAT ACTIVATED &mdash; &infin; ideas &middot; 30 lives &middot; root@theplanet</div>';
  document.body.appendChild(banner);

  var GLYPHS = "01<>/\\#$%&*+=?ABCDEF0123456789|[]{}";
  var cols, drops, running = false, raf = null;

  function size() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    cols = Math.floor(canvas.width / 16);
    drops = [];
    for (var i = 0; i < cols; i++) drops[i] = Math.random() * canvas.height / 16;
  }

  function draw() {
    if (!running) return;
    ctx.fillStyle = "rgba(0,0,0,0.09)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "16px monospace";
    for (var i = 0; i < cols; i++) {
      var ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      ctx.fillStyle = Math.random() < 0.03 ? "#bff7df" : "#23d18b";
      ctx.fillText(ch, i * 16, drops[i] * 16);
      if (drops[i] * 16 > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
    raf = requestAnimationFrame(draw);
  }

  var hideTimer = null;
  function stopMatrix() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    canvas.classList.remove("show");
    banner.classList.remove("show");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function trigger() {
    window.dispatchEvent(new CustomEvent("divd:konami"));
    if (window.DIVD_clearInput) window.DIVD_clearInput();  // wipe the stray "ba"
    size();
    canvas.classList.add("show");
    banner.classList.add("show");
    running = true; draw();
    hideTimer = setTimeout(stopMatrix, 12000);
  }
  window.DIVD_matrix = trigger;

  // Escape stops the matrix rain and returns to normal.
  (window.DIVD_escHandlers = window.DIVD_escHandlers || []).push(function () {
    if (running) { stopMatrix(); return true; }
    return false;
  });

  document.addEventListener("keydown", function (e) {
    var k = (e.key && e.key.length === 1) ? e.key.toLowerCase() : e.key;
    if (k === SEQ[pos]) {
      pos++;
      if (pos === SEQ.length) { pos = 0; trigger(); }
    } else {
      pos = (k === SEQ[0]) ? 1 : 0;
    }
  }, false);

  window.addEventListener("resize", function () { if (running) size(); });
})();
