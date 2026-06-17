/* crt.js — old-CRT power-off / power-on theatre on the bottom-right DIVD logo
 * pane. The logo "screen" collapses to a bright horizontal line, then a glowing
 * dot, then goes dark — just like switching off an old tube TV — stays off for
 * ~5 seconds, then flickers back to life. Fires on demand via /tv and at random
 * roughly every 5 minutes.
 */
(function () {
  "use strict";
  var pane = document.getElementById("pane-logo");
  var tube = document.getElementById("logo-stage");
  if (!pane || !tube) return;

  // Beam overlay (the bright line -> dot phosphor flourish), drawn over the
  // logo screen. Sized to the logo-stage box each run so it lines up exactly.
  var ov = document.createElement("div");
  ov.className = "crt-ov";
  ov.setAttribute("aria-hidden", "true");
  ov.innerHTML = '<div class="crt-beam"></div>';
  pane.appendChild(ov);
  var beam = ov.querySelector(".crt-beam");

  var running = false;

  function place() {
    var pr = pane.getBoundingClientRect(), sr = tube.getBoundingClientRect();
    ov.style.left = (sr.left - pr.left) + "px";
    ov.style.top = (sr.top - pr.top) + "px";
    ov.style.width = sr.width + "px";
    ov.style.height = sr.height + "px";
  }

  function run() {
    if (running) return;
    running = true;
    place();
    ov.classList.add("show");

    // --- power off: collapse the logo screen + run the beam line->dot ---
    tube.classList.remove("crt-on");
    beam.classList.remove("on");
    void tube.offsetWidth;                  // restart any prior animation
    tube.classList.add("crt-off");
    beam.classList.add("off");
    setTimeout(function () { beam.classList.remove("off"); }, 950); // dot faded -> dark
    if (window.DIVD_setTitle) window.DIVD_setTitle("logo", "---", "NO SIGNAL", "dead");

    // --- stay dark ~5s, then power back on (dot -> line -> picture) ---
    setTimeout(function () {
      tube.classList.remove("crt-off");      // swap animations in one frame
      tube.classList.add("crt-on");          // (no reflow between -> no flash)
      beam.classList.add("on");
      if (window.DIVD_resetTitle) window.DIVD_resetTitle("logo");
      setTimeout(function () {
        tube.classList.remove("crt-on");
        beam.classList.remove("on");
        ov.classList.remove("show");
        running = false;
      }, 780);
    }, 5500);
  }

  window.DIVD_crt = run;

  // Random trigger: roughly every 5 minutes (4–6 min jitter).
  (function loop() {
    setTimeout(function () {
      if (!running) run();
      loop();
    }, 240000 + Math.random() * 120000);
  })();
})();
