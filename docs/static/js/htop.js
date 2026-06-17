/* htop.js — fake htop refreshing every second.
 * Real-ish meters (8 cores) + joke "hacked" processes for the con vibe.
 */
(function () {
  "use strict";
  var el = document.getElementById("htop");
  if (!el) return;
  var NCORES = 8, TOTAL_MEM = 8001;

  // Real LAN IP (or null when air-gapped), refreshed from the backend.
  var netIP = null;
  function refreshIP() {
    fetch("/netinfo").then(function (r) { return r.json(); })
      .then(function (d) { netIP = d.ips; }).catch(function () {});
  }
  refreshIP(); setInterval(refreshIP, 10000);

  function esc(s) { return ("" + s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function padL(s, n) { s = "" + s; while (s.length < n) s = " " + s; return s; }
  function padR(s, n) { s = "" + s; while (s.length < n) s = s + " "; return s; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function bar(val, width) {
    var filled = Math.round(width * val / 100), out = "";
    for (var i = 0; i < width; i++) {
      if (i < filled) {
        var f = i / width, c = f < 0.5 ? "lo" : f < 0.8 ? "me" : "hi";
        out += '<span class="' + c + '">|</span>';
      } else { out += '<span class="bar"> </span>'; }
    }
    return out;
  }
  function hms(t) {
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
    return padL(h, 1) + "h" + ("" + m).padStart(2, "0") + ":" + ("" + s).padStart(2, "0");
  }

  // Each: {pid,user,pri,ni,virt,res,shr,st, cpu(base), mem(base), time(base), cmd, evil}
  var procs = [
    { pid: 666,  user: "root", pri: "rt", ni: -9, virt: "2.1G", res: "1.8G", shr: "9M",  st: "R", cpu: 97, mem: 22.4, time: 1337, evil: 1, cmd: "./file_encryptor --target /home --aes256 --ransom" },
    { pid: 1337, user: "divd", pri: 20,   ni: 0,   virt: "3.4G", res: "512M", shr: "88M", st: "R", cpu: 84, mem: 6.2,  time: 420,  evil: 1, cmd: "claude --dangerously-skip-permissions --yolo" },
    { pid: 31337,user: "root", pri: 20,   ni: 0,   virt: "1.2G", res: "900M", shr: "4M",  st: "R", cpu: 91, mem: 11.0, time: 8088, evil: 1, cmd: "xmrig --donate-level 0 -o pool.evil.onion:4444" },
    { pid: 4444, user: "root", pri: 20,   ni: 0,   virt: "44M",  res: "8M",   shr: "3M",  st: "S", cpu: 0.3,mem: 0.1,  time: 60,   evil: 1, cmd: "nc -lvnp 4444 -e /bin/bash" },
    { pid: 5150, user: "root", pri: 20,   ni: 0,   virt: "120M", res: "40M",  shr: "9M",  st: "R", cpu: 62, mem: 0.6,  time: 200,  evil: 1, cmd: "hashcat -m 22000 -a 0 capture.hccapx rockyou.txt" },
    { pid: 1984, user: "root", pri: 20,   ni: 0,   virt: "20M",  res: "6M",   shr: "2M",  st: "S", cpu: 1.2,mem: 0.1,  time: 99,   evil: 1, cmd: "/usr/bin/keylogger --out /tmp/.k --stealth" },
    { pid: 8008, user: "divd", pri: 20,   ni: 0,   virt: "210M", res: "55M",  shr: "7M",  st: "R", cpu: 9,  mem: 0.7,  time: 12,   evil: 1, cmd: "python3 exfiltrate.py --to pastebin --all-the-things" },
    { pid: 9001, user: "root", pri: 20,   ni: 0,   virt: "1.6G", res: "1.1G", shr: "5M",  st: "D", cpu: 45, mem: 13.5, time: 700,  evil: 1, cmd: "dd if=/dev/urandom of=/dev/mmcblk0 bs=1M" },
    { pid: 1234, user: "root", pri: 20,   ni: 0,   virt: "9M",   res: "2M",   shr: "1M",  st: "S", cpu: 0.0,mem: 0.0,  time: 1,    evil: 1, cmd: "rm -rf / --no-preserve-root  # (held by sudo)" },
    { pid: 7,    user: "mrrobot", pri: 20, ni: 0, virt: "80M", res: "20M",   shr: "6M",  st: "S", cpu: 13, mem: 0.3,  time: 31337,evil: 1, cmd: "./fsociety.dat --hello-friend" },

    // Project Lacewing — the defenders. Local, open-weights AI hunting the bugs
    // the attackers above would exploit. Air-gapped, 0 EUR/Mtok, disclose-first.
    { pid: 1789, user: "lacewing", pri: 20, ni: -5, virt: "6.8G", res: "1.4G", shr: "120M", st: "R", cpu: 76, mem: 9.0, time: 2026, good: 1, cmd: "lacewing-scan --model local/qwen2.5-coder-32b --target openssl --responsible-disclosure" },
    { pid: 1815, user: "lacewing", pri: 20, ni: 0,  virt: "9.1G", res: "2.1G", shr: "88M",  st: "R", cpu: 58, mem: 14.0,time: 1830, good: 1, cmd: "ollama serve  # local open-weights, air-gapped, 0 EUR/Mtok" },
    { pid: 1848, user: "lacewing", pri: 20, ni: 0,  virt: "210M", res: "60M",  shr: "12M",  st: "R", cpu: 22, mem: 0.8, time: 900,  good: 1, cmd: "chrysopidae --hunt CVE --autopatch --disclose-first" },
    { pid: 1937, user: "lacewing", pri: 20, ni: 0,  virt: "140M", res: "44M",  shr: "9M",   st: "S", cpu: 7,  mem: 0.5, time: 420,  good: 1, cmd: "lacewing-fix --draft-pr --maintainer-first" },
    { pid: 2014, user: "lacewing", pri: 20, ni: 0,  virt: "60M",  res: "18M",  shr: "6M",   st: "S", cpu: 3,  mem: 0.3, time: 1200, good: 1, cmd: "lacewing-mesh --peers eu --open-weights --share-responsibly" },

    { pid: 1,    user: "root", pri: 20,   ni: 0,   virt: "168M", res: "12M",  shr: "8M",  st: "S", cpu: 0.0,mem: 0.2,  time: 49021,evil: 0, cmd: "/sbin/init" },
    { pid: 540,  user: "divd", pri: 20,   ni: 0,   virt: "300M", res: "60M",  shr: "30M", st: "S", cpu: 2,  mem: 0.8,  time: 5000, evil: 0, cmd: "cage -- chromium-wayland.sh" },
    { pid: 770,  user: "divd", pri: 20,   ni: 0,   virt: "2.9G", res: "640M", shr: "180M",st: "S", cpu: 14, mem: 8.0,  time: 900,  evil: 0, cmd: "chromium --kiosk --ozone-platform=wayland" },
    { pid: 771,  user: "divd", pri: 20,   ni: 0,   virt: "1.1G", res: "210M", shr: "70M", st: "S", cpu: 6,  mem: 2.6,  time: 880,  evil: 0, cmd: "chromium --type=renderer (kiosk)" },
    { pid: 802,  user: "divd", pri: 20,   ni: 0,   virt: "260M", res: "70M",  shr: "16M", st: "S", cpu: 1.5,mem: 0.9,  time: 870,  evil: 0, cmd: "gunicorn divdprint.wsgi --workers 3" },
    { pid: 803,  user: "divd", pri: 20,   ni: 0,   virt: "260M", res: "72M",  shr: "16M", st: "S", cpu: 0.9,mem: 0.9,  time: 860,  evil: 0, cmd: "gunicorn: worker [divdprint]" },
    { pid: 910,  user: "divd", pri: 20,   ni: 0,   virt: "12M",  res: "4M",   shr: "2M",  st: "R", cpu: 0.7,mem: 0.1,  time: 12,   evil: 0, cmd: "htop" },
    { pid: 230,  user: "root", pri: 20,   ni: 0,   virt: "30M",  res: "7M",   shr: "6M",  st: "S", cpu: 0.0,mem: 0.1,  time: 4000, evil: 0, cmd: "/usr/sbin/sshd -D" },
    { pid: 88,   user: "root", pri: 20,   ni: 0,   virt: "0",    res: "0",    shr: "0",   st: "I", cpu: 0.0,mem: 0.0,  time: 200,  evil: 0, cmd: "[kworker/0:1-events]" }
  ];

  // Idle system/kernel threads used to pad the task list so it fills the whole
  // pane height, like real htop. Static (cpu ~0) so they sort to the bottom and
  // don't flicker between refreshes.
  var FILLER = [
    ["root", "[kworker/0:0-events]"], ["root", "[kworker/1:1-mm_percpu_wq]"],
    ["root", "[kworker/2:0-events]"], ["root", "[kworker/3:2-events]"],
    ["root", "[ksoftirqd/0]"], ["root", "[ksoftirqd/1]"], ["root", "[ksoftirqd/2]"],
    ["root", "[ksoftirqd/3]"], ["root", "[kworker/4:1-events]"], ["root", "[kworker/5:0-events]"],
    ["root", "[kworker/6:2-events]"], ["root", "[kworker/7:1-mm_percpu_wq]"],
    ["root", "[ksoftirqd/4]"], ["root", "[ksoftirqd/5]"], ["root", "[ksoftirqd/6]"],
    ["root", "[ksoftirqd/7]"], ["root", "[migration/0]"], ["root", "[migration/1]"],
    ["root", "[rcu_preempt]"], ["root", "[rcu_sched]"], ["root", "[kcompactd0]"],
    ["root", "[kswapd0]"], ["root", "[kdevtmpfs]"], ["root", "[oom_reaper]"],
    ["root", "[jbd2/mmcblk0p2-8]"], ["root", "[kthreadd]"], ["root", "[cpuhp/0]"],
    ["root", "/lib/systemd/systemd-journald"], ["root", "/lib/systemd/systemd-udevd"],
    ["msgbus", "/usr/bin/dbus-daemon --system --address=systemd:"],
    ["root", "/usr/sbin/cron -f"], ["divd", "/lib/systemd/systemd --user"],
    ["divd", "(sd-pam)"], ["root", "/usr/sbin/rngd -r /dev/hwrng"],
    ["avahi", "avahi-daemon: running [conf-kiosk.local]"],
    ["root", "/usr/sbin/thermald --no-daemon"], ["root", "/usr/lib/polkit-1/polkitd"],
    ["root", "wpa_supplicant -u -s -O /run/wpa_supplicant"], ["root", "[watchdogd]"],
    ["root", "/sbin/agetty -o -p -- \\u --noclear tty1 linux"], ["root", "[irq/24-mmc0]"],
    ["root", "[scsi_eh_0]"], ["root", "[usb-storage]"], ["root", "[card-detect]"],
    ["root", "[kworker/u8:2-flush-179:0]"], ["root", "[mmcqd/0]"],
    ["root", "[idle_inject/0]"], ["root", "[netns]"]
  ];
  var fillerPool = FILLER.map(function (c, i) {
    return {
      pid: 92 + i * 7 + (i % 5), user: c[0], pri: 20, ni: 0,
      virt: ["0", "9M", "12M", "18M", "24M"][i % 5],
      res: ["0", "1M", "2M", "3M", "4M"][i % 5], shr: "0",
      st: i % 6 === 0 ? "I" : "S", cpu: 0.0,
      mem: +(Math.random() * 0.2).toFixed(1),
      time: Math.floor(rnd(5, 9000)), evil: 0, cmd: c[1]
    };
  });

  var startCpu = procs.map(function (p) { return p.cpu; });
  var startMem = procs.map(function (p) { return p.mem; });

  // Project Lacewing live tally — repos swept, 0-days found, responsibly
  // disclosed. Ticks slowly so the defenders look busy without flickering.
  var lwRepos = 1287, lwZero = 41, lwDisc = 39;

  function jitter() {
    procs.forEach(function (p, i) {
      var spread = startCpu[i] > 40 ? 18 : 3;
      p.cpu = Math.max(0, Math.min(100, startCpu[i] + rnd(-spread, spread)));
      p.mem = Math.max(0, startMem[i] + rnd(-0.3, 0.3));
      if (p.st === "R" || p.cpu > 1) p.time += 1;
    });
    if (Math.random() < 0.30) lwRepos += 1;
    if (Math.random() < 0.05) {                 // a fresh finding now and then
      lwZero += 1;
      if (lwDisc < lwZero && Math.random() < 0.8) lwDisc += 1;  // disclose-first
    } else if (lwDisc < lwZero && Math.random() < 0.10) {
      lwDisc += 1;                               // catch disclosures up over time
    }
  }

  function rowHTML(p) {
    var cc = p.cpu < 50 ? "lo" : p.cpu < 80 ? "me" : "hi";
    var cmd = esc(p.cmd);
    if (p.evil) cmd = '<span class="evil">' + cmd + '</span>';
    else if (p.good) cmd = '<span class="good">' + cmd + '</span>';
    return '  <span class="pid">' + padL(p.pid, 6) + '</span> ' +
      '<span class="usr">' + padR(p.user, 8) + '</span>' +
      padL(p.pri, 3) + ' ' + padL(p.ni, 2) + ' ' +
      padR(p.virt, 6) + padR(p.res, 6) + padR(p.st, 2) +
      '<span class="' + cc + '">' + padL(p.cpu.toFixed(1), 5) + '</span> ' +
      '<span class="val">' + padL(p.mem.toFixed(1), 5) + '</span> ' +
      '<span class="val">' + padR(hms(p.time), 8) + '</span>' + cmd;
  }

  function render() {
    var W = el.clientWidth || 600;
    var cols = Math.max(60, Math.floor(W / 8)); // ~8px per char
    var bw = Math.max(14, Math.min(34, cols - 24));
    var lines = [];

    // per-core CPU meters, laid out in two columns like real multi-core htop
    var coreVals = [];
    for (var c = 0; c < NCORES; c++) {
      var base = [22, 88, 15, 64, 41, 77, 9, 53][c];
      coreVals.push(Math.max(0, Math.min(100, base + rnd(-12, 12))));
    }
    var half = Math.ceil(NCORES / 2);
    var bw2 = Math.max(6, Math.min(20, Math.floor(cols / 2) - 13));
    function meter(idx) {
      if (idx >= NCORES) return "";
      return padL(idx + 1, 2) + '<span class="bar">[</span>' + bar(coreVals[idx], bw2) +
        '<span class="val">' + padL(coreVals[idx].toFixed(1), 5) + '%</span>' +
        '<span class="bar">]</span>';
    }
    for (var r = 0; r < half; r++) {
      lines.push('  ' + meter(r) + '  ' + meter(r + half));
    }
    var usedMem = procs.reduce(function (a, p) { return a + p.mem; }, 0) / 100 * TOTAL_MEM;
    usedMem = Math.min(TOTAL_MEM, usedMem + 1400);
    var memPct = usedMem / TOTAL_MEM * 100;
    lines.push('  <span class="lbl">Mem</span><span class="bar">[</span>' +
      bar(memPct, bw) + '<span class="val">' +
      padL((usedMem / 1024).toFixed(1) + "G/" + (TOTAL_MEM / 1024).toFixed(1) + "G", 11) +
      '</span><span class="bar">]</span>');
    lines.push('  <span class="lbl">Swp</span><span class="bar">[</span>' +
      bar(0, bw) + '<span class="val">' + padL("0K/0K", 11) +
      '</span><span class="bar">]</span>');
    lines.push("");

    var running = procs.filter(function (p) { return p.st === "R"; }).length;
    var avg = (coreVals.reduce(function (a, b) { return a + b; }, 0) / NCORES / 100 * NCORES);
    lines.push('  <span class="lbl">Tasks:</span> ' + (200 + Math.floor(rnd(0, 30))) +
      ', 666 thr; <span class="hi">' + running + ' running</span>');
    lines.push('  <span class="lbl">Load average:</span> <span class="hi">' +
      (avg + rnd(0, 2)).toFixed(2) + '</span> ' + (avg * 0.6).toFixed(2) + ' ' +
      (avg * 0.4).toFixed(2) + '   <span class="lbl">Uptime:</span> 13:37:42');
    lines.push('  <span class="lbl">Lacewing:</span> <span class="good">hunting ' +
      lwRepos + ' repos &middot; 0-days ' + lwZero + ' &middot; disclosed ' + lwDisc +
      ' &middot; 0 EUR/Mtok</span>');
    lines.push('  <span class="lbl">DIVD:</span> <span class="good">189 volunteers ' +
      '&middot; 193 cases &middot; 1.4M IPs notified</span> ' +
      '<span class="lbl">&middot; lacewing@divd.nl</span>');
    if (netIP) {
      lines.push('  <span class="lbl">C2 uplink:</span> <span class="evil">' +
        esc(netIP) + ':4444 [ESTABLISHED]</span>');
    } else {
      lines.push('  <span class="lbl">uplink:</span> <span class="me">-- air-gapped --</span>');
    }
    lines.push("");

    // header
    var hdr = '  ' + padL("PID", 6) + ' ' + padR("USER", 8) + 'PRI NI ' +
      padR("VIRT", 6) + padR("RES", 6) + padR("S", 2) +
      padL("CPU%", 5) + ' ' + padL("MEM%", 5) + ' ' + padR("TIME+", 8) + 'Command';
    lines.push('<span class="hdr">' + padR(hdr, cols) + '</span>');

    // Fill every remaining line of the pane with task rows (real procs first,
    // then idle filler threads), so the list reaches the bottom like real htop.
    var cs = getComputedStyle(el);
    var fs = parseFloat(cs.fontSize) || 13;
    var lineH = parseFloat(cs.lineHeight);
    if (!(lineH > fs)) lineH = fs * 1.25;            // unitless line-height -> px
    var capacity = Math.floor((el.clientHeight - 8) / lineH);
    var rowsAvail = Math.max(1, capacity - lines.length);

    var display = procs.slice().sort(function (a, b) { return b.cpu - a.cpu; });
    for (var i = 0; display.length < rowsAvail; i++) {
      display.push(fillerPool[i % fillerPool.length]);
    }
    display.slice(0, rowsAvail).forEach(function (p) { lines.push(rowHTML(p)); });

    el.innerHTML = lines.join("\n");
  }

  // ---- alternate "classic computer" screens (defrag / memtest) ----------- //
  var altActive = false, altTimer = null;

  function newDefrag() {
    var gcols = Math.max(36, Math.floor(((el.clientWidth || 600) / 9)) - 4);
    var rows = 13, total = gcols * rows;
    var cells = [];
    for (var i = 0; i < total; i++) cells.push(Math.random() < 0.55 ? "u" : "f");
    for (var b = 0; b < 3; b++) cells[Math.floor(Math.random() * total)] = "B";
    var head = 0;
    function cellOf(idx) {
      if (idx >= head - 2 && idx < head) return { ch: "▒", cls: "dfg-read" };
      var s = cells[idx];
      if (s === "B") return { ch: "X", cls: "dfg-bad" };
      if (s === "o") return { ch: "█", cls: "dfg-opt" };
      if (s === "u") return { ch: "█", cls: "dfg-used" };
      return { ch: "░", cls: "dfg-free" };
    }
    return {
      delay: 140,
      step: function () {
        var adv = Math.floor(rnd(3, 8));
        for (var k = 0; k < adv && head < total; k++) {
          if (cells[head] === "u") cells[head] = "o";
          head++;
        }
      },
      render: function () {
        var pct = Math.min(100, Math.round(head / total * 100));
        var L = ['<span class="scr-title">  ' +
          padR("Optimizing Drive C:   " + pct + "% complete", gcols + 2) + "</span>", ""];
        for (var r = 0; r < rows; r++) {
          var row = "  ", i = 0;
          while (i < gcols) {
            var c0 = cellOf(r * gcols + i), j = i + 1;
            while (j < gcols) {
              var cj = cellOf(r * gcols + j);
              if (cj.cls !== c0.cls || cj.ch !== c0.ch) break;
              j++;
            }
            row += '<span class="' + c0.cls + '">' +
              new Array(j - i + 1).join(c0.ch) + "</span>";
            i = j;
          }
          L.push(row);
        }
        L.push("");
        L.push('  <span class="dfg-used">█</span>used ' +
          '<span class="dfg-opt">█</span>optimized ' +
          '<span class="dfg-free">░</span>free ' +
          '<span class="dfg-read">▒</span>reading ' +
          '<span class="dfg-bad">X</span>bad');
        L.push('  <span class="scr-hi">Cluster ' + head + ' of ' + total +
          '   (do not turn off your computer)</span>');
        return L.join("\n");
      }
    };
  }

  function newMemtest() {
    var addr = 0, total = 8001, err = 0, pass = 1;
    return {
      delay: 110,
      step: function () {
        addr += Math.floor(rnd(50, 180));
        if (addr >= total) { addr = 0; pass++; }
        if (Math.random() < 0.015) err++;
      },
      render: function () {
        var pct = Math.round(addr / total * 100), bw = 40,
            fill = Math.round(bw * pct / 100);
        var bar = "[" + new Array(fill + 1).join("#") +
          new Array(bw - fill + 1).join(".") + "]";
        return [
          '<span class="scr-title">  ' + padR("Memtest86  v6.66", 56) + "</span>", "",
          '  <span class="scr-hi">Testing:</span> ' + padL(addr, 5) + "M / " +
            total + "M    Pass #" + pass,
          "  " + bar + "  " + pct + "%", "",
          '  Walking ones   ...  <span class="scr-ok">OK</span>',
          '  Walking zeros  ...  <span class="scr-ok">OK</span>',
          '  Address bus    ...  <span class="scr-ok">OK</span>',
          "  Errors: " + (err ? '<span class="dfg-bad">' + err + "</span>"
                              : '<span class="scr-ok">0</span>'), "",
          '  <span class="scr-hi">(this is fine. it is definitely just a memory test.)</span>'
        ].join("\n");
      }
    };
  }

  var previewing = false;   // slash-menu mode preview owns the pane (terminal.js)

  function startAlt(kind) {
    if (altActive || previewing) return;
    altActive = true;
    kind = kind || (Math.random() < 0.6 ? "defrag" : "memtest");
    var st = kind === "memtest" ? newMemtest() : newDefrag();
    var end = Date.now() + (kind === "defrag" ? 22000 : 15000);
    if (window.DIVD_setTitle) {
      window.DIVD_setTitle("htop", kind,
        kind === "memtest" ? "scanning RAM…" : "optimizing C:", "warn");
    }
    (function tick() {
      if (!altActive || Date.now() >= end) { stopAlt(); return; }
      st.step(); el.innerHTML = st.render();
      altTimer = setTimeout(tick, st.delay);
    })();
  }
  function stopAlt() {
    altActive = false;
    if (altTimer) { clearTimeout(altTimer); altTimer = null; }
    if (window.DIVD_resetTitle) window.DIVD_resetTitle("htop");
    jitter(); render();
  }
  // ~28% chance every ~32s to drop into a classic screen for a bit (unless the
  // self-playing breakout demo is currently using this pane).
  setInterval(function () {
    if (altActive || previewing || (window.DIVD_breakoutActive && window.DIVD_breakoutActive())) return;
    if (Math.random() < 0.28) startAlt();
  }, 32000);
  window.addEventListener("divd:konami", function () { startAlt("defrag"); });
  window.DIVD_defrag = function () { startAlt("defrag"); };
  window.DIVD_memtest = function () { startAlt("memtest"); };
  window.DIVD_htopBusy = function () { return altActive; };

  // Take over the pane to show a slash-menu mode preview (html), or release it
  // (null) to resume the live htop. Preview wins over a running defrag/memtest.
  window.DIVD_htopPreview = function (html) {
    if (html == null) {
      if (!previewing) return;
      previewing = false;
      if (!altActive) { jitter(); render(); }
    } else {
      previewing = true;
      if (altActive) { altActive = false; if (altTimer) { clearTimeout(altTimer); altTimer = null; } }
      el.innerHTML = html;
    }
  };

  jitter(); render();
  setInterval(function () { if (!altActive && !previewing) { jitter(); render(); } }, 1000);
  window.addEventListener("resize", function () { if (!altActive) render(); });
})();
