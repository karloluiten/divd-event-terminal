/* calc.js — a Windows calculator "pops" over the whole right column (htop +
 * the DIVD/metasploit pane, overlapping both) mid-way through a Metasploit
 * session — the classic "popped calc" meme: exploit lands, calc appears. It
 * sits for 5 seconds then glitches away. Picks one of two bundled calc images
 * at random. Triggered by metasploit.js during a session, and on demand via
 * /calc and /pop.
 */
(function () {
  "use strict";
  var pane = document.querySelector(".col-right");
  if (!pane) return;

  var IMGS = ["/static/img/calc1.jpg", "/static/img/calc2.png"];

  var wrap = document.createElement("div");
  wrap.className = "calc-pop";
  wrap.innerHTML = '<img class="calc-img" alt="">';
  pane.appendChild(wrap);
  var img = wrap.querySelector(".calc-img");

  var showing = false, tShow = null, tGlitch = null;

  function hide() {
    showing = false;
    wrap.className = "calc-pop";
    if (tShow) { clearTimeout(tShow); tShow = null; }
    if (tGlitch) { clearTimeout(tGlitch); tGlitch = null; }
  }

  function pop() {
    if (showing) return;
    showing = true;
    img.src = IMGS[Math.floor(Math.random() * IMGS.length)];
    wrap.className = "calc-pop show";
    tShow = setTimeout(function () {        // after 5s, glitch out
      wrap.className = "calc-pop show glitchout";
      tGlitch = setTimeout(hide, 550);
    }, 5000);
  }

  window.DIVD_calc = pop;
})();
