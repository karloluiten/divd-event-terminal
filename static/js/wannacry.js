/* wannacry.js — a parody of the WannaCry "Wana Decrypt0r 2.0" ransom screen,
 * modelled on https://fakeupdate.net/wnc/ . Nothing is encrypted: this is a
 * harmless full-screen gag. Like the original, pressing any key reveals a
 * "you've been pranked — here's how to stay safe" panel (DIVD's whole reason
 * for existing), and the next key returns to the kiosk.
 *
 * Loaded BEFORE guard.js so the dismiss key is swallowed first (no breakout
 * flash, no stray typing).
 */
(function () {
  "use strict";

  var el = document.createElement("div");
  el.id = "wannacry";
  el.setAttribute("aria-hidden", "true");
  document.body.appendChild(el);

  // padlock icon reused in the title bar and the big left lock
  var LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 1a5 5 0 0 0-5 5v3H5.5A1.5 1.5 0 0 0 4 10.5v10A1.5 1.5 0 0 0 5.5 22h13a1.5 1.5 0 0 0 1.5-1.5v-10A1.5 1.5 0 0 0 18.5 9H17V6a5 5 0 0 0-5-5zm0 2a3 3 0 0 1 3 3v3H9V6a3 3 0 0 1 3-3zm0 10a1.8 1.8 0 0 1 1 3.3V19h-2v-2.7a1.8 1.8 0 0 1 1-3.3z"/>' +
    "</svg>";

  function fmt2(n) { return (n < 10 ? "0" : "") + n; }
  function dateStr(d) {
    return (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear() + " " +
      fmt2(d.getHours()) + ":" + fmt2(d.getMinutes()) + ":" + fmt2(d.getSeconds());
  }

  // The scary ransom window (stage 0).
  function ransomHTML() {
    var now = new Date();
    var raise = new Date(now.getTime() + 3 * 864e5);   // +3 days
    var lost = new Date(now.getTime() + 7 * 864e5);    // +7 days
    return '<div class="wc-window">' +
      '<div class="wc-titlebar"><span class="wc-tl">' + LOCK +
        " Wana Decrypt0r 2.0</span><span class=\"wc-tr\">&#9472; &#9633; &#10005;</span></div>" +
      '<div class="wc-body">' +
        '<div class="wc-left">' +
          '<div class="wc-lock">' + LOCK + "</div>" +
          '<div class="wc-box"><div class="wc-box-h">Payment will be raised on</div>' +
            '<div class="wc-date">' + dateStr(raise) + "</div>" +
            '<div class="wc-box-h">Time Left</div>' +
            '<div class="wc-count" id="wc-c1">71:59:59</div></div>' +
          '<div class="wc-box"><div class="wc-box-h">Your files will be lost on</div>' +
            '<div class="wc-date">' + dateStr(lost) + "</div>" +
            '<div class="wc-box-h">Time Left</div>' +
            '<div class="wc-count" id="wc-c2">167:59:59</div></div>' +
          '<div class="wc-links">About bitcoin<br>How to buy bitcoins?<br>Contact Us</div>' +
        "</div>" +
        '<div class="wc-right">' +
          '<div class="wc-headline">Ooops, your files have been encrypted!</div>' +
          '<div class="wc-sec-h">What Happened to My Computer?</div>' +
          '<p>Your important files are encrypted. Many of your documents, photos, ' +
            "videos and other files are no longer accessible because they have been " +
            "encrypted. Maybe you are busy looking for a way to recover your files, " +
            "but do not waste your time.</p>" +
          '<div class="wc-sec-h">Can I Recover My Files?</div>' +
          "<p>Sure. We guarantee that you can recover all your files safely and " +
            "easily — but you do not have so much time. You can decrypt some of your " +
            "files for free. Try now by clicking &lt;Decrypt&gt;.</p>" +
          '<div class="wc-pay">Send $300 worth of bitcoin to this address:' +
            '<div class="wc-addr">12t9YDPgwueZ9NyMgw519p7AA8isjr6SMw</div></div>' +
          '<div class="wc-btns"><span class="wc-btn">Check Payment</span>' +
            '<span class="wc-btn wc-btn-go">Decrypt</span></div>' +
        "</div>" +
      "</div></div>" +
      '<div class="wc-hint">press any key&hellip;</div>';
  }

  // The reveal (stage 1): it was a prank + DIVD security tips.
  function revealHTML() {
    return '<div class="wc-reveal">' +
      '<div class="wc-r-emoji">&#128526;</div>' +
      "<h1>It's just a PRANK, bro!</h1>" +
      "<p class=\"wc-r-lead\">Nothing is encrypted. Your files are safe. " +
        "You just met a fake <b>WannaCry</b> screen.</p>" +
      "<p>WannaCry was real, though &mdash; in 2017 it hit 200,000+ machines " +
        "worldwide using a hole that had <b>already been patched</b>. Don't be an easy target:</p>" +
      '<ul class="wc-tips">' +
        "<li><b>Keep software updated</b> &mdash; the WannaCry hole was patched months before the outbreak.</li>" +
        "<li><b>Back up</b> your important files &mdash; ransomware can't hold hostage what you have copies of.</li>" +
        "<li><b>Think before you click</b> suspicious emails, links and attachments.</li>" +
        "<li><b>Found a real vulnerability?</b> Disclose it responsibly &mdash; that's what DIVD is here for.</li>" +
      "</ul>" +
      '<div class="wc-hint">press any key to return to the kiosk &mdash; // DIVD</div>' +
      "</div>";
  }

  var active = false, stage = 0, ticker = null;

  // two HH:MM:SS countdowns ticking down once a second
  function startTicker() {
    var t1 = 71 * 3600 + 59 * 60 + 59;
    var t2 = 167 * 3600 + 59 * 60 + 59;
    function paint(id, s) {
      var e = document.getElementById(id);
      if (!e) return;
      var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      e.textContent = fmt2(h) + ":" + fmt2(m) + ":" + fmt2(sec);
    }
    ticker = setInterval(function () {
      if (t1 > 0) t1--;
      if (t2 > 0) t2--;
      paint("wc-c1", t1);
      paint("wc-c2", t2);
    }, 1000);
  }
  function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }

  function show() {
    stage = 0;
    el.innerHTML = ransomHTML();
    el.className = "show ransom";
    active = true;
    startTicker();
  }
  function reveal() {
    stopTicker();
    stage = 1;
    el.innerHTML = revealHTML();
    el.className = "show reveal";
  }
  function hide() {
    active = false;
    stopTicker();
    el.className = "";
    el.innerHTML = "";
  }

  // Any key / tap: stage 0 -> reveal, stage 1 -> back to the kiosk.
  function advance(e) {
    if (!active) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (stage === 0) reveal(); else hide();
  }
  document.addEventListener("keydown", advance, true);
  document.addEventListener("pointerdown", advance, true);

  window.DIVD_wannacry = show;
})();
