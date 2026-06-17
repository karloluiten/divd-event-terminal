/* ledosd.js — flash the LED scanner settings in the status bar when they change.
 *
 * Polls /ledstate (the daemon's persisted speed + brightness). On load it takes
 * a silent baseline; whenever speed or brightness then changes — e.g. from the
 * keyboard's volume keys — it shows the current values in the bottom bar for
 * 5 seconds. Touches no hardware; fail-soft on any fetch error.
 */
(function () {
  "use strict";
  var osd = document.getElementById("sb-osd");
  if (!osd) return;

  // Mirror the daemon's speed range (leds.py) so speed reads as a friendly %.
  var MIN_SPEED = 0.3, MAX_SPEED = 2.2;
  var HOLD_MS = 5000;
  var last = null, hideTimer = null;

  function pct(v, lo, hi) {
    return Math.round(Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * 100);
  }

  function show(speed, brightness) {
    osd.innerHTML =
      '<span class="sb-osd-item">SPEED ' + pct(speed, MIN_SPEED, MAX_SPEED) + '%</span>' +
      '<span class="sb-osd-item">BRIGHT ' + Math.round(brightness * 100) + '%</span>';
    osd.classList.add("show");
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { osd.classList.remove("show"); }, HOLD_MS);
  }

  function poll() {
    fetch("/ledstate").then(function (r) { return r.json(); }).then(function (d) {
      if (typeof d.speed !== "number" || typeof d.brightness !== "number") return;
      if (last === null) { last = { s: d.speed, b: d.brightness }; return; }  // baseline
      if (d.speed !== last.s || d.brightness !== last.b) {
        show(d.speed, d.brightness);
        last = { s: d.speed, b: d.brightness };
      }
    }).catch(function () {});
  }

  poll();
  setInterval(poll, 500);
})();
