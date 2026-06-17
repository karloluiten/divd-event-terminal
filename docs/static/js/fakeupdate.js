/* fakeupdate.js — fakeupdate.net-style fullscreen "OS is updating" screens.
 * Hidden slash commands (/winupdate, /macupdate, /ubuntu, /update) cover the
 * whole screen with a convincing fake system-update screen whose percentage
 * crawls, stalls and occasionally drops back (the classic "stuck update" troll).
 *
 * Like fakeupdate.net, ANY key press dismisses it (not just Esc). To make that
 * reliable we register a capture-phase key handler and load this BEFORE guard.js
 * so it swallows the key first — no red breakout flash, no stray typing.
 */
(function () {
  "use strict";

  // ---- overlay element --------------------------------------------------- //
  var el = document.createElement("div");
  el.id = "fakeupdate";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = '<div class="fu-inner"></div>';
  document.body.appendChild(el);
  var inner = el.querySelector(".fu-inner");

  var HINT = '<div class="fu-hint">(relax — it\'s a joke. press any key. // DIVD)</div>';

  // Eight trailing dots orbiting a point — reads as a Windows-style spinner.
  function spinner() {
    var s = '<div class="fu-spinner">';
    for (var i = 0; i < 8; i++) {
      s += '<i style="transform:rotate(' + (i * 45) +
        'deg);opacity:' + (0.18 + i * 0.11).toFixed(2) + '"></i>';
    }
    return s + "</div>";
  }

  // Skins: each builds the inner markup for one fake OS. Percentage/progress
  // bits carry ids the shared driver updates.
  var SKINS = {
    win: function () {
      return spinner() +
        '<div class="fu-msg">Working on updates</div>' +
        '<div class="fu-pct"><span class="fu-num">0</span>% complete</div>' +
        '<div class="fu-sub">Don\'t turn off your PC. This will take a while.</div>' +
        HINT;
    },
    mac: function () {
      return '<svg class="fu-apple" viewBox="0 0 814 1000" aria-hidden="true">' +
        '<path d="M788 340c-6 4-114 65-114 199 0 155 136 210 140 211-1 3-21 75-71 148-44 64-90 128-160 128s-88-41-169-41c-79 0-107 42-171 42s-109-59-160-131C13 787 0 689 0 595c0-189 123-289 244-289 64 0 117 42 157 42 38 0 97-45 170-45 28 0 136 3 207 105zM573 121c30-36 51-86 51-136 0-7-1-14-2-19-49 2-107 33-142 73-28 31-54 81-54 132 0 8 1 15 2 18 3 1 8 1 13 1 44 0 99-29 132-69z"/>' +
        "</svg>" +
        '<div class="fu-bar"><div class="fu-bar-fill"></div></div>' +
        '<div class="fu-min">Installing macOS update… <span class="fu-num">0</span>%</div>' +
        HINT;
    },
    ubuntu: function () {
      return '<div class="fu-ubuntu">ubuntu</div>' +
        spinner() +
        '<div class="fu-msg">Installing updates</div>' +
        '<div class="fu-pct"><span class="fu-num">0</span>%</div>' +
        '<div class="fu-sub">System will restart when complete</div>' +
        HINT;
    }
  };

  var active = false, driver = null;

  function setPct(p) {
    var nums = el.querySelectorAll(".fu-num");
    for (var i = 0; i < nums.length; i++) nums[i].textContent = p;
    var bar = el.querySelector(".fu-bar-fill");
    if (bar) bar.style.width = p + "%";
  }

  // Crawl the percentage: small random steps, frequent stalls, and the classic
  // "frozen near the end, then drops way back" gag so it never actually finishes.
  function startDriver() {
    var pct = 0;
    setPct(0);
    driver = setInterval(function () {
      var r = Math.random();
      if (pct >= 97 && r < 0.45) {            // the troll: snap back down
        pct = 12 + Math.floor(Math.random() * 25);
      } else if (r < 0.4) {                   // stall on this number for a beat
        return;
      } else {
        pct = Math.min(99, pct + Math.floor(Math.random() * 7) + 1);
      }
      setPct(pct);
    }, 600);
  }

  function show(skin) {
    var build = SKINS[skin] || SKINS.win;
    inner.innerHTML = build();
    el.className = "show " + skin;
    active = true;
    startDriver();
  }

  function hide() {
    if (!active) return;
    active = false;
    el.className = "";
    if (driver) { clearInterval(driver); driver = null; }
  }

  // Any key dismisses (capture phase + stopImmediatePropagation so guard.js
  // doesn't flash and terminal.js doesn't type the key). loaded before guard.js.
  document.addEventListener("keydown", function (e) {
    if (!active) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    hide();
  }, true);
  // A tap/click works too (no mouse on the kiosk, but harmless and complete).
  document.addEventListener("pointerdown", function (e) {
    if (!active) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    hide();
  }, true);

  // public API for terminal.js hidden commands
  window.DIVD_fakeupdate = function (skin) {
    show(skin || "win");
  };
})();
