/* breakout.js — a fast, self-playing ASCII breakout/arkanoid demo that randomly
 * takes over the top-right (htop) pane. No interaction: the paddle is driven by
 * a (near-perfect) AI that tracks the ball. Lots of juice — colour-cycling ball
 * with a trail, brick-shatter particles, screen shake, combo popups, the odd
 * multiball — then it bows out and htop returns. Also on demand via /breakout.
 */
(function () {
  "use strict";
  var pane = document.getElementById("pane-htop");
  if (!pane) return;

  var ov = document.createElement("div");
  ov.className = "bo-overlay";
  ov.setAttribute("aria-hidden", "true");
  var pre = document.createElement("pre");
  pre.className = "bo-screen";
  ov.appendChild(pre);
  pane.appendChild(ov);

  var COLORS = ["#ff3344", "#ff9f1c", "#ffd736", "#23d18b", "#36d6ff", "#b388ff"];
  var BW = 5, PW = 8;            // brick cell width (4 block + 1 gap), paddle width
  var running = false, raf = null, lastT = 0, endAt = 0, overT = 0;
  var cols, rows, brickRows, bricks, brickCount, balls, paddle, parts;
  var score, combo, lives, shake, msg, msgUntil, paddleColor;

  window.DIVD_breakoutActive = function () { return running; };

  function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function metricsW() {
    var p = document.createElement("span");
    p.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font:13px/1.25 var(--font-mono,monospace)";
    p.textContent = "MMMMMMMMMMMMMMMMMMMM";
    pane.appendChild(p);
    var w = p.getBoundingClientRect().width / 20;
    pane.removeChild(p);
    return w || 7.5;
  }

  function newBall(x, vx) {
    var ang = (50 + Math.random() * 60) * Math.PI / 180, S = 46;
    return { x: x, y: rows - 3, vx: vx != null ? vx : S * Math.cos(ang) * (Math.random() < 0.5 ? -1 : 1),
             vy: -S * Math.sin(ang), col: 0 };
  }
  function buildBricks() {
    brickRows = Math.max(3, Math.min(6, Math.floor(rows * 0.32)));
    var bcols = Math.floor(cols / BW);
    bricks = []; brickCount = 0;
    for (var r = 0; r < brickRows; r++) {
      bricks[r] = [];
      for (var c = 0; c < bcols; c++) {
        var alive = Math.random() < 0.92;
        bricks[r][c] = alive ? COLORS[r % COLORS.length] : null;
        if (alive) brickCount++;
      }
    }
  }
  function init() {
    var cw = metricsW(), lh = 13 * 1.25;
    cols = Math.max(30, Math.floor((pane.clientWidth - 8) / cw));
    rows = Math.max(16, Math.floor((pane.clientHeight - 6) / lh));
    score = 0; combo = 0; lives = 3; shake = 0; msg = ""; msgUntil = 0;
    parts = []; paddleColor = "#36d6ff";
    buildBricks();
    paddle = { x: (cols - PW) / 2 };
    balls = [newBall(cols / 2)];
  }

  function flash(t, ms) { msg = t; msgUntil = performance.now() + (ms || 900); }
  var BOOM = "@#%&*+x=:.'`";
  function shatter(cx, cy, color, big) {
    var n = big ? rint(14, 22) : rint(7, 12);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = (big ? 14 : 8) + Math.random() * (big ? 34 : 22);
      parts.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6,
                   life: 0.5 + Math.random() * 0.7, ml: 1.2,
                   col: Math.random() < 0.4 ? "#fff7c0" : color,
                   ch: BOOM.charAt(i % BOOM.length) });
    }
  }

  function aim() {
    // AI: steer the paddle toward the lowest descending ball's predicted x.
    var target = null, low = -1;
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (b.vy > 0 && b.y > low) { low = b.y; target = b; }
    }
    if (!target) target = balls[0];
    if (!target) return;
    var want = target.x - PW / 2 + (target.vx > 0 ? 1 : -1);
    var diff = want - paddle.x, ms = 0.9;             // near-instant but smoothed
    paddle.x += Math.max(-ms * 4, Math.min(ms * 4, diff));
    if (paddle.x < 0) paddle.x = 0;
    if (paddle.x > cols - PW) paddle.x = cols - PW;
  }

  function killBrick(br, bc, big) {
    if (br < 0 || br >= brickRows || !bricks[br] || !bricks[br][bc]) return;
    var color = bricks[br][bc];
    bricks[br][bc] = null; brickCount--;
    score += 10 * Math.max(1, combo);
    shatter(bc * BW + 2, br + 2, color, big);
    return color;
  }
  function explode(br, bc) {
    // chain reaction: take out the 8 neighbours too — kaboom!
    flash("BOOM!", 500);
    shake = Math.min(8, shake + 6);
    shatter(bc * BW + 2, br + 2, "#ff9f1c", true);
    for (var dr = -1; dr <= 1; dr++)
      for (var dc = -1; dc <= 1; dc++)
        if (dr || dc) { killBrick(br + dr, bc + dc, true); score += 25; }
  }

  function hitBrick(b) {
    var cx = Math.floor(b.x), cy = Math.floor(b.y), br = cy - 2;
    if (br < 0 || br >= brickRows) return false;
    var bc = Math.floor(cx / BW);
    if (cx - bc * BW >= 4) return false;              // in the gap between bricks
    if (!bricks[br] || !bricks[br][bc]) return false;
    var color = bricks[br][bc];
    bricks[br][bc] = null; brickCount--;
    b.vy = -b.vy;
    combo++; score += 10 * Math.max(1, combo);
    shatter(b.x, b.y, color, false);
    shake = Math.min(8, shake + 1.4);
    // ~18% of bricks detonate, blowing up their neighbours in a chain
    if (Math.random() < 0.18) explode(br, bc);
    if (combo > 0 && combo % 6 === 0) flash("COMBO x" + combo + "!", 700);
    if (combo % 8 === 0 && balls.length < 5) { balls.push(newBall(b.x, -b.vx)); flash("MULTIBALL!", 800); }
    return true;
  }

  function physics(dt) {
    aim();
    for (var i = balls.length - 1; i >= 0; i--) {
      var b = balls[i];
      b.col = (b.col + dt * 6) % COLORS.length;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x <= 0) { b.x = 0; b.vx = Math.abs(b.vx); }
      else if (b.x >= cols - 1) { b.x = cols - 1; b.vx = -Math.abs(b.vx); }
      if (b.y <= 1) { b.y = 1; b.vy = Math.abs(b.vy); }       // top (below score row)
      hitBrick(b);
      // paddle
      if (b.vy > 0 && b.y >= rows - 2 && b.y < rows - 1) {
        if (b.x >= paddle.x - 0.5 && b.x <= paddle.x + PW) {
          b.vy = -Math.abs(b.vy);
          var rel = (b.x - (paddle.x + PW / 2)) / (PW / 2);  // english off the paddle
          b.vx += rel * 14; b.y = rows - 2;
          var sp = Math.hypot(b.vx, b.vy), mx = 68;
          if (sp > mx) { b.vx *= mx / sp; b.vy *= mx / sp; }
          combo = 0; score += 1; paddleColor = COLORS[rint(0, COLORS.length - 1)];
        }
      }
      if (b.y > rows) {                                        // missed
        balls.splice(i, 1);
        if (!balls.length) {
          lives--; shake = 8;
          if (lives <= 0) { flash("GAME OVER", 1400); overT = performance.now() + 1300; }
          else { flash("MISS!", 700); balls.push(newBall(cols / 2)); }
        }
      }
    }
    // particles
    for (var p = parts.length - 1; p >= 0; p--) {
      var q = parts[p];
      q.vy += 26 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt;
      if (q.life <= 0 || q.y > rows) parts.splice(p, 1);
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 14);
    // stage clear -> rebuild while time remains
    if (brickCount <= 0) { flash("STAGE CLEAR!", 1100); buildBricks(); }
  }

  function render() {
    var n = rows * cols;
    var ch = new Array(n), co = new Array(n);
    for (var k = 0; k < n; k++) { ch[k] = " "; co[k] = ""; }
    function put(x, y, c, color) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || x >= cols || y < 0 || y >= rows) return;
      ch[y * cols + x] = c; co[y * cols + x] = color || "";
    }
    // bricks
    for (var r = 0; r < brickRows; r++) {
      for (var c = 0; c < bricks[r].length; c++) {
        if (!bricks[r][c]) continue;
        for (var d = 0; d < 4; d++) put(c * BW + d, r + 2, "█", bricks[r][c]);
      }
    }
    // particles
    for (var pi = 0; pi < parts.length; pi++) put(parts[pi].x, parts[pi].y, parts[pi].ch, parts[pi].col);
    // paddle
    for (var pp = 0; pp < PW; pp++) put(paddle.x + pp, rows - 1, "▀", paddleColor);
    // balls (+ short trail)
    for (var bi = 0; bi < balls.length; bi++) {
      var b = balls[bi], bc = COLORS[Math.floor(b.col) % COLORS.length];
      put(b.x - b.vx * 0.09, b.y - b.vy * 0.09, "·", "#33414d");
      put(b.x - b.vx * 0.06, b.y - b.vy * 0.06, "•", "#5a6b7a");
      put(b.x - b.vx * 0.03, b.y - b.vy * 0.03, "○", "#9fb0bf");
      put(b.x, b.y, "●", bc);
    }
    // score header (row 0)
    var pct = Math.round((1 - brickCount / Math.max(1, brickRows * Math.floor(cols / BW))) * 100);
    var hdr = " BREAKOUT  ai-demo  SCORE " + score + "  x" + Math.max(1, combo) +
      "  LIVES " + Math.max(0, lives) + "  " + pct + "%";
    for (var hc = 0; hc < cols && hc < hdr.length; hc++) put(hc, 0, hdr.charAt(hc), "#ffd736");

    // build HTML, grouping same-colour runs per row
    var esc = function (s) { return s === "<" ? "&lt;" : s === "&" ? "&amp;" : s; };
    var out = [];
    for (var y = 0; y < rows; y++) {
      var line = "", run = "", cur = null;
      for (var x = 0; x < cols; x++) {
        var idx = y * cols + x, col = co[idx], glyph = esc(ch[idx]);
        if (col !== cur) {
          if (run) line += cur ? '<span style="color:' + cur + '">' + run + "</span>" : run;
          run = ""; cur = col;
        }
        run += glyph;
      }
      if (run) line += cur ? '<span style="color:' + cur + '">' + run + "</span>" : run;
      out.push(line);
    }
    // centred message popup
    if (msg && performance.now() < msgUntil) {
      var row = Math.floor(rows / 2);
      var pad = Math.max(0, Math.floor((cols - msg.length) / 2));
      out[row] = '<span style="color:#fff;text-shadow:0 0 10px #fff">' +
        new Array(pad + 1).join(" ") + msg + "</span>";
    }
    pre.innerHTML = out.join("\n");
    pre.style.transform = shake > 0.2
      ? "translate(" + (Math.random() * 2 - 1) * shake + "px," + (Math.random() * 2 - 1) * shake + "px)"
      : "none";
  }

  function frame(t) {
    if (!running) return;
    if (!lastT) lastT = t;
    var dt = Math.min(0.045, (t - lastT) / 1000); lastT = t;
    physics(dt); render();
    var done = (overT && t >= overT) || (t >= endAt && (!msg || t >= msgUntil));
    if (done) { stop(); return; }
    raf = requestAnimationFrame(frame);
  }

  function start(ms) {
    if (running) return;
    if (window.DIVD_htopBusy && window.DIVD_htopBusy()) return;  // defrag/memtest has the pane
    running = true; overT = 0; lastT = 0;
    init();
    ov.classList.add("show");
    if (window.DIVD_setTitle) window.DIVD_setTitle("htop", "breakout", "ai demo", "warn");
    endAt = performance.now() + (ms || rint(16000, 23000));
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    ov.classList.remove("show");
    pre.style.transform = "none";
    if (window.DIVD_resetTitle) window.DIVD_resetTitle("htop");
  }

  window.DIVD_breakout = start;

  // Random trigger: roughly every 45–95s, ~32% chance to play a round.
  (function loop() {
    setTimeout(function () {
      if (Math.random() < 0.32) start();
      loop();
    }, 45000 + Math.random() * 50000);
  })();
})();
