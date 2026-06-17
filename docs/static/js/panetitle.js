/* panetitle.js — make the tmux pane "headers" react to what each window is
 * doing. When the htop pane drops into memtest/defrag, or the logo pane runs a
 * metasploit session / loses signal, the title decodes (scramble animation) to
 * a context name like 1:memtest, and a phosphor highlight sweeps across it while
 * the activity runs. Restores the original title when it's done.
 *   window.DIVD_setTitle(which, name, desc, kind)   which: term|htop|logo
 *   window.DIVD_resetTitle(which)                    kind: warn|evil|dead
 */
(function () {
  "use strict";
  var MAP = {
    term: document.querySelector("#pane-term .pane-title"),
    htop: document.querySelector("#pane-htop .pane-title"),
    logo: document.querySelector("#pane-logo .pane-title")
  };
  var SBWIN = document.querySelectorAll("#statusbar .sb-win");
  var SBIDX = { term: 0, htop: 1, logo: 2 };

  var def = {}, prefix = {}, sbdef = [];
  Object.keys(MAP).forEach(function (k) {
    var el = MAP[k]; if (!el) return;
    def[k] = el.textContent;
    var m = def[k].match(/^\s*([^:]*:)/);   // capture the "1:" window-number prefix
    prefix[k] = m ? m[1].trim() : "";
  });
  for (var s = 0; s < SBWIN.length; s++) sbdef[s] = SBWIN[s].textContent;

  var CHARS = "!<>-_\\/[]{}=+*^?#@%&$0123456789";
  function scramble(el, target) {
    if (!el) return;
    clearInterval(el._sc);
    var frame = 0, total = 18;
    el._sc = setInterval(function () {
      var out = "";
      for (var i = 0; i < target.length; i++) {
        var ch = target.charAt(i);
        var revealAt = Math.floor((i / target.length) * total * 0.6) + 4;
        out += (ch === " " || frame >= revealAt)
          ? ch : CHARS.charAt((Math.random() * CHARS.length) | 0);
      }
      el.textContent = out;
      if (++frame > total) { clearInterval(el._sc); el.textContent = target; }
    }, 28);
  }

  window.DIVD_setTitle = function (which, name, desc, kind) {
    var el = MAP[which]; if (!el) return;
    var pfx = prefix[which] || "";
    el.classList.remove("pt-warn", "pt-evil", "pt-dead");
    el.classList.add("pt-busy");
    if (kind) el.classList.add("pt-" + kind);
    scramble(el, pfx + name + ' — "' + desc + '"');
    var si = SBIDX[which];
    if (SBWIN[si]) scramble(SBWIN[si], pfx + name);
  };

  window.DIVD_resetTitle = function (which) {
    var el = MAP[which]; if (!el) return;
    el.classList.remove("pt-busy", "pt-warn", "pt-evil", "pt-dead");
    if (def[which] != null) scramble(el, def[which]);
    var si = SBIDX[which];
    if (SBWIN[si] && sbdef[si] != null) scramble(SBWIN[si], sbdef[si]);
  };
})();
