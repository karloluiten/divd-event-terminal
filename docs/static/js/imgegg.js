/* imgegg.js — fullscreen image easter eggs (/cat shows a cat photo, /hackerman
 * shows the hackerman meme). Covers the whole screen with one image; ANY key
 * (or tap) dismisses it, exactly like the fake update screens.
 *
 * Loaded BEFORE guard.js so the dismiss key is swallowed first — no breakout
 * flash, no stray typing into the terminal.
 */
(function () {
  "use strict";

  var el = document.createElement("div");
  el.id = "imgegg";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML =
    '<img class="imgegg-pic" alt="">' +
    '<div class="imgegg-cap"></div>' +
    '<div class="imgegg-hint">(press any key // DIVD)</div>';
  document.body.appendChild(el);

  var img = el.querySelector(".imgegg-pic");
  var cap = el.querySelector(".imgegg-cap");
  var active = false;

  function show(src, caption) {
    img.src = src;
    cap.textContent = caption || "";
    cap.style.display = caption ? "" : "none";
    el.classList.add("show");
    active = true;
  }
  function hide() {
    if (!active) return;
    active = false;
    el.classList.remove("show");
  }

  // Any key / tap dismisses (capture phase + stopImmediatePropagation).
  function dismiss(e) {
    if (!active) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    hide();
  }
  document.addEventListener("keydown", dismiss, true);
  document.addEventListener("pointerdown", dismiss, true);

  window.DIVD_showImage = show;
})();
