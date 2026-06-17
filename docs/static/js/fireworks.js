/* fireworks.js — celebratory ASCII fireworks across the whole screen whenever a
 * receipt prints. Rockets shoot up from the bottom, arc to their apex, then burst
 * into spreading, falling sparks (* + . chars) that fade out. Each particle is a
 * pooled, absolutely-positioned <span>, so a couple hundred move smoothly without
 * repainting a full character grid. Trigger: window.DIVD_fireworks(durationMs).
 */
(function () {
  "use strict";
  var PAL = ["#ff3344", "#ffd736", "#23d18b", "#36d6ff", "#ff7bff", "#ffffff"];
  var G = 280;                       // spark gravity (px/s^2)

  var wrap = document.createElement("div");
  wrap.id = "fireworks";
  wrap.setAttribute("aria-hidden", "true");
  document.body.appendChild(wrap);

  var pool = [], live = [], raf = null, lastT = 0, spawnUntil = 0, nextRocket = 0;

  function span() {
    var s = pool.pop();
    if (!s) { s = document.createElement("span"); wrap.appendChild(s); }
    s.style.display = "";
    return s;
  }
  function kill(p) { p.el.style.display = "none"; pool.push(p.el); }

  function rocket() {
    var p = {
      el: span(), rocket: true,
      x: 60 + Math.random() * (window.innerWidth - 120),
      y: window.innerHeight - 6,
      vx: (Math.random() * 2 - 1) * 30,
      vy: -(380 + Math.random() * 190),
      ty: window.innerHeight * (0.14 + Math.random() * 0.32),
      color: PAL[(Math.random() * PAL.length) | 0]
    };
    p.el.style.color = p.color;
    p.el.textContent = "|";
    live.push(p);
  }

  function explode(x, y, color) {
    var n = 26 + (Math.random() * 22 | 0);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 240;
      var p = {
        el: span(), rocket: false, x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        color: color, life: 0.7 + Math.random() * 0.8
      };
      p.maxlife = p.life;
      p.el.style.color = color;
      p.el.textContent = "*";
      live.push(p);
    }
  }

  function frame(t) {
    if (!lastT) lastT = t;
    var dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
    if (t < spawnUntil && t >= nextRocket) {
      rocket(); nextRocket = t + 170 + Math.random() * 240;
    }
    for (var i = live.length - 1; i >= 0; i--) {
      var p = live[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.rocket) {
        p.vy += G * 0.2 * dt;                       // gently slow the climb
        if (p.vy >= -40 || p.y <= p.ty) {           // reached apex -> burst
          explode(p.x, p.y, p.color); kill(p); live.splice(i, 1); continue;
        }
        p.el.style.opacity = "1";
      } else {
        p.vy += G * dt; p.life -= dt;
        if (p.life <= 0) { kill(p); live.splice(i, 1); continue; }
        var f = p.life / p.maxlife;
        p.el.textContent = f > 0.6 ? "*" : f > 0.3 ? "+" : ".";
        p.el.style.opacity = f.toFixed(2);
      }
      p.el.style.transform = "translate(" + p.x + "px," + p.y + "px)";
    }
    if (live.length || t < spawnUntil) raf = requestAnimationFrame(frame);
    else stop();
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null; lastT = 0;
    for (var i = 0; i < live.length; i++) kill(live[i]);
    live = [];
    wrap.classList.remove("on");
  }

  window.DIVD_fireworks = function (ms) {
    wrap.classList.add("on");
    spawnUntil = performance.now() + (ms || 1700);
    nextRocket = 0;
    if (!raf) { lastT = 0; raf = requestAnimationFrame(frame); }
  };
})();
