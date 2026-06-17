/* guard.js — kiosk breakout defenses.
 * Intercepts common escape attempts (Alt+Tab, Alt+F4, F11, F5, devtools,
 * zoom, print, context menu) and flashes the screen red with a cheeky message.
 * Regular typing is untouched — only modifier/function-key combos are caught.
 */
(function () {
  "use strict";

  var MESSAGES = [
    "ALT+TAB? there is nowhere to go. it's just us now.",
    "F11 won't help — we're already fullscreen, champ.",
    "ALT+F4 detected. the only thing closing today is a vulnerability.",
    "trying to open devtools at a hacker con? bold. denied.",
    "this kiosk has no exit. only ideas. type one instead!",
    "nice keyboard-fu. still not getting out though.",
    "the printer is the only output device you control here.",
    "responsible disclosure please: tell DIVD if you find a real bug ;)",
    "Ctrl+W? we don't do tabs here. we do receipts.",
    "refreshing won't summon a shell. promise.",
    "0 days found. 1 breakout attempt logged. keep typing ideas!",
    "you shall not pass (but you may print)."
  ];

  var flashEl = document.getElementById("guard-flash");
  var subEl = document.getElementById("guard-sub");
  var hideTimer = null;

  function flash(reason) {
    if (!flashEl) return;
    if (subEl) {
      subEl.textContent = reason ||
        MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    }
    flashEl.classList.add("show");
    // restart the pulse animation
    flashEl.style.animation = "none";
    // force reflow
    void flashEl.offsetWidth;
    flashEl.style.animation = "";
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      flashEl.classList.remove("show");
    }, 2600);
    window.dispatchEvent(new CustomEvent("divd:breakout", { detail: reason }));
  }
  window.DIVD_flash = flash;

  function block(e, reason) {
    e.preventDefault();
    e.stopPropagation();
    flash(reason);
    return false;
  }

  document.addEventListener("keydown", function (e) {
    var k = e.key;

    // Function keys F1–F12 (F11 fullscreen, F12 devtools, F5 refresh, …)
    if (/^F\d{1,2}$/.test(k)) return block(e,
      k === "F11" ? "F11 won't help — we're already fullscreen, champ."
      : k === "F12" ? "trying to open devtools at a hacker con? bold. denied."
      : k === "F5"  ? "refreshing won't summon a shell. promise."
      : null);

    // The Meta / "Windows" / "Super" key
    if (k === "Meta" || k === "OS" || e.metaKey) return block(e,
      "the super key opens nothing. you're stuck with us.");

    if (e.altKey) {
      // Alt+Tab, Alt+F4, Alt+Left/Right (history), Alt+anything
      if (k === "Tab")    return block(e, MESSAGES[0]);
      if (k === "F4")     return block(e, MESSAGES[2]);
      if (k === "ArrowLeft" || k === "ArrowRight" || k === "Home")
        return block(e, "no going back. only forward, with ideas.");
      return block(e, null);
    }

    if (e.ctrlKey && !e.altKey && !e.metaKey) {
      var z = k.toLowerCase();
      // Ctrl +/- (and aliases Ctrl =/_) zoom the terminal font; Ctrl-0 resets;
      // Ctrl-L clears. These are allowed (handled), not breakout attempts.
      if (z === "=" || z === "+") {
        e.preventDefault(); e.stopPropagation();
        if (window.DIVD_termZoom) window.DIVD_termZoom(1); return false;
      }
      if (z === "-" || z === "_") {
        e.preventDefault(); e.stopPropagation();
        if (window.DIVD_termZoom) window.DIVD_termZoom(-1); return false;
      }
      if (z === "0") {
        e.preventDefault(); e.stopPropagation();
        if (window.DIVD_termZoom) window.DIVD_termZoom(0); return false;
      }
      if (z === "l") {
        e.preventDefault(); e.stopPropagation();
        if (window.DIVD_clearTerminal) window.DIVD_clearTerminal(); return false;
      }
    }

    if (e.ctrlKey) {
      var c = k.toLowerCase();
      // refresh / close / new / tab / print / find / save / devtools
      if ("rwntpfsj".indexOf(c) !== -1 ||
          (e.shiftKey && "ijckr".indexOf(c) !== -1) || k === "Tab") {
        return block(e,
          c === "w" ? MESSAGES[8]
          : c === "r" ? MESSAGES[9]
          : (e.shiftKey && (c === "i" || c === "j" || c === "c")) ? MESSAGES[3]
          : null);
      }
    }

    // Bare Escape — let registered handlers (matrix rain, slash menu, password
    // prompt) consume it first; only flash if nothing wanted it.
    if (k === "Escape") {
      var hs = window.DIVD_escHandlers || [], consumed = false;
      for (var i = 0; i < hs.length; i++) {
        try { if (hs[i]()) { consumed = true; break; } } catch (_) {}
      }
      if (consumed) { e.preventDefault(); e.stopPropagation(); return false; }
      return block(e, "escape is an illusion. type an idea.");
    }
  }, true);

  // Mouse / selection hardening
  document.addEventListener("contextmenu", function (e) {
    return block(e, "right-click menu disabled. there's nothing in there for you.");
  }, true);
  ["dragstart", "selectstart"].forEach(function (ev) {
    document.addEventListener(ev, function (e) { e.preventDefault(); }, true);
  });

  // If the window somehow loses focus / is hidden, someone escaped — yell.
  window.addEventListener("blur", function () { flash("hey! come back here!"); });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) flash("where do you think you're going?");
  });

  // Block pinch / ctrl-wheel zoom
  window.addEventListener("wheel", function (e) {
    if (e.ctrlKey) { e.preventDefault(); flash("no zooming. 1337 only at 100%."); }
  }, { passive: false });
})();
