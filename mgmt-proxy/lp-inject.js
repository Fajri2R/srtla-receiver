/**
 * Live Preview injector for SLS Management UI
 * Served by mgmt-proxy nginx at /lp-inject.js
 *
 * DOM hooks (SLS Management UI React app):
 *   button[title="Add Player"]        — action button per publisher row
 *   .publisher-card-publisher-name    — publisher stream ID text node
 *
 * Bootstrap 5 + Bootstrap Icons are already loaded by the host app.
 */
(function () {
  'use strict';
  if (window.__lp) return;
  window.__lp = true;

  /* ── Config ──────────────────────────────────────────────────────── */
  var LP_PORT = 8090;
  var BASE    = location.protocol + '//' + location.hostname + ':' + LP_PORT;

  /* ── HLS.js (lazy load) ──────────────────────────────────────────── */
  var hlsScript = document.createElement('script');
  hlsScript.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
  document.head.appendChild(hlsScript);

  /* ── Styles ──────────────────────────────────────────────────────── */
  var css = document.createElement('style');
  css.textContent = '\
/* ── Live button ───────────────────────────────────────────────────── */\
.lp-btn {\
  display: inline-flex;\
  align-items: center;\
  gap: 5px;\
  background: linear-gradient(135deg, #e53e3e 0%, #9b2c2c 100%) !important;\
  border: none !important;\
  color: #fff !important;\
  font-size: 11.5px !important;\
  font-weight: 600 !important;\
  letter-spacing: .3px;\
  padding: 3px 11px !important;\
  border-radius: 6px !important;\
  cursor: pointer;\
  margin-right: 6px;\
  vertical-align: middle;\
  transition: opacity .18s, transform .18s;\
  box-shadow: 0 2px 8px rgba(229,62,62,.35);\
}\
.lp-btn:hover {\
  opacity: .88 !important;\
  transform: translateY(-1px);\
  box-shadow: 0 4px 14px rgba(229,62,62,.5);\
}\
.lp-btn:active { transform: translateY(0) !important; }\
/* pulsing dot inside button */\
.lp-dot {\
  width: 7px;\
  height: 7px;\
  background: #fff;\
  border-radius: 50%;\
  flex-shrink: 0;\
  animation: lp-pulse 1.4s ease-in-out infinite;\
}\
@keyframes lp-pulse {\
  0%,100% { opacity: 1; transform: scale(1); }\
  50%     { opacity: .4; transform: scale(.6); }\
}\
/* ── Modal overlay ─────────────────────────────────────────────────── */\
#lp-ov {\
  display: none;\
  position: fixed;\
  inset: 0;\
  z-index: 2147483647;\
  background: rgba(5, 5, 15, .88);\
  backdrop-filter: blur(6px);\
  -webkit-backdrop-filter: blur(6px);\
  align-items: center;\
  justify-content: center;\
  padding: 16px;\
}\
#lp-ov.on { display: flex; animation: lp-fade-in .2s ease; }\
@keyframes lp-fade-in { from { opacity: 0 } to { opacity: 1 } }\
/* ── Modal card ────────────────────────────────────────────────────── */\
#lp-bx {\
  background: #0a0a18;\
  border: 1px solid rgba(255,255,255,.08);\
  border-radius: 18px;\
  padding: 22px 24px 20px;\
  width: min(880px, 100%);\
  box-shadow:\
    0 0 0 1px rgba(229,62,62,.15),\
    0 32px 80px rgba(0,0,0,.7);\
  animation: lp-slide-in .22s cubic-bezier(.34,1.56,.64,1);\
}\
@keyframes lp-slide-in {\
  from { opacity: 0; transform: scale(.96) translateY(8px); }\
  to   { opacity: 1; transform: scale(1) translateY(0); }\
}\
/* ── Header ────────────────────────────────────────────────────────── */\
#lp-hd {\
  display: flex;\
  align-items: center;\
  justify-content: space-between;\
  margin-bottom: 16px;\
  gap: 12px;\
}\
#lp-badge {\
  display: inline-flex;\
  align-items: center;\
  gap: 7px;\
  background: rgba(229,62,62,.12);\
  border: 1px solid rgba(229,62,62,.25);\
  border-radius: 20px;\
  padding: 4px 12px 4px 8px;\
}\
#lp-badge-dot {\
  width: 8px;\
  height: 8px;\
  background: #fc5c5c;\
  border-radius: 50%;\
  animation: lp-pulse 1.2s ease-in-out infinite;\
}\
#lp-badge-txt {\
  font-size: 11px;\
  font-weight: 700;\
  color: #fc5c5c;\
  letter-spacing: 1px;\
  text-transform: uppercase;\
}\
#lp-nm {\
  font-size: 14px;\
  font-weight: 600;\
  color: rgba(255,255,255,.85);\
  font-family: ui-monospace, "Cascadia Code", "Source Code Pro", monospace;\
  flex: 1;\
  min-width: 0;\
  overflow: hidden;\
  text-overflow: ellipsis;\
  white-space: nowrap;\
}\
#lp-xb {\
  flex-shrink: 0;\
  background: transparent;\
  border: 1px solid rgba(255,255,255,.12);\
  color: rgba(255,255,255,.45);\
  border-radius: 8px;\
  padding: 5px 14px;\
  cursor: pointer;\
  font-size: 13px;\
  transition: border-color .15s, color .15s;\
  line-height: 1.4;\
}\
#lp-xb:hover { border-color: rgba(229,62,62,.6); color: #fc5c5c; }\
/* ── Video ─────────────────────────────────────────────────────────── */\
#lp-vid-wrap {\
  position: relative;\
  border-radius: 10px;\
  overflow: hidden;\
  background: #000;\
  aspect-ratio: 16/9;\
}\
#lp-vid {\
  width: 100%;\
  height: 100%;\
  display: block;\
  object-fit: contain;\
}\
#lp-overlay-msg {\
  position: absolute;\
  inset: 0;\
  display: flex;\
  flex-direction: column;\
  align-items: center;\
  justify-content: center;\
  gap: 10px;\
  background: rgba(0,0,0,.6);\
  color: rgba(255,255,255,.7);\
  font-size: 13px;\
  pointer-events: none;\
  transition: opacity .3s;\
}\
#lp-overlay-msg.hidden { opacity: 0; }\
#lp-spinner {\
  width: 32px;\
  height: 32px;\
  border: 3px solid rgba(255,255,255,.1);\
  border-top-color: #fc5c5c;\
  border-radius: 50%;\
  animation: lp-spin .8s linear infinite;\
}\
@keyframes lp-spin { to { transform: rotate(360deg); } }\
/* ── Footer ────────────────────────────────────────────────────────── */\
#lp-ft {\
  display: flex;\
  align-items: center;\
  justify-content: space-between;\
  margin-top: 12px;\
  gap: 8px;\
}\
#lp-url {\
  font-size: 11px;\
  color: rgba(255,255,255,.25);\
  font-family: ui-monospace, monospace;\
  overflow: hidden;\
  text-overflow: ellipsis;\
  white-space: nowrap;\
  flex: 1;\
}\
#lp-hint {\
  font-size: 11px;\
  color: rgba(255,255,255,.2);\
  white-space: nowrap;\
  flex-shrink: 0;\
}\
';
  document.head.appendChild(css);

  /* ── Modal HTML ──────────────────────────────────────────────────── */
  var ov = document.createElement('div');
  ov.id = 'lp-ov';
  ov.innerHTML = '<div id="lp-bx">'
    + '<div id="lp-hd">'
      + '<div id="lp-badge"><span id="lp-badge-dot"></span><span id="lp-badge-txt">Live</span></div>'
      + '<div id="lp-nm">—</div>'
      + '<button id="lp-xb" type="button">&#x2715; Close</button>'
    + '</div>'
    + '<div id="lp-vid-wrap">'
      + '<video id="lp-vid" controls muted playsinline></video>'
      + '<div id="lp-overlay-msg">'
        + '<div id="lp-spinner"></div>'
        + '<span id="lp-msg-txt">Connecting&hellip;</span>'
      + '</div>'
    + '</div>'
    + '<div id="lp-ft">'
      + '<span id="lp-url"></span>'
      + '<span id="lp-hint">ESC to close</span>'
    + '</div>'
  + '</div>';
  document.body.appendChild(ov);

  /* ── Player logic ────────────────────────────────────────────────── */
  var hls = null;

  function safeId(s) { return s.replace(/[^a-zA-Z0-9_-]/g, '_'); }

  function setMsg(txt, spin) {
    var om = document.getElementById('lp-overlay-msg');
    var sp = document.getElementById('lp-spinner');
    var mt = document.getElementById('lp-msg-txt');
    if (txt === null) { om.classList.add('hidden'); return; }
    om.classList.remove('hidden');
    sp.style.display = spin ? 'block' : 'none';
    mt.textContent = txt;
  }

  function openPreview(pub) {
    var url = BASE + '/hls/' + safeId(pub) + '/stream.m3u8';
    document.getElementById('lp-nm').textContent  = pub;
    document.getElementById('lp-url').textContent = url;
    setMsg('Connecting\u2026', true);
    ov.classList.add('on');
    document.body.style.overflow = 'hidden';

    var v = document.getElementById('lp-vid');
    if (hls) { hls.destroy(); hls = null; }
    v.src = '';

    function startHls() {
      if (window.Hls && Hls.isSupported()) {
        hls = new Hls({
          liveSyncDurationCount:    3,
          liveMaxLatencyDurationCount: 5,
          maxBufferLength:          8,
          enableWorker:             true,
        });
        hls.loadSource(url);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, function () {
          v.play().catch(function () {});
          setMsg(null, false);
        });
        hls.on(Hls.Events.ERROR, function (_, d) {
          if (d.fatal) {
            setMsg('\u26a0\ufe0f Stream not active \u2014 is the publisher connected?', false);
          }
        });
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = url;
        v.play().catch(function () {});
        v.addEventListener('canplay', function () { setMsg(null, false); }, { once: true });
      } else {
        setMsg('HLS not supported in this browser.', false);
      }
    }

    if (window.Hls) startHls();
    else hlsScript.addEventListener('load', startHls, { once: true });
  }

  function closePreview() {
    ov.classList.remove('on');
    document.body.style.overflow = '';
    var v = document.getElementById('lp-vid');
    v.pause(); v.src = '';
    if (hls) { hls.destroy(); hls = null; }
    setMsg('Connecting\u2026', true); // reset for next open
  }

  document.getElementById('lp-xb').onclick = closePreview;
  ov.onclick = function (e) { if (e.target === ov) closePreview(); };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePreview();
  });

  /* ── Button injection ────────────────────────────────────────────── */
  var DONE = 'data-lp-ok';

  function injectButtons() {
    document.querySelectorAll('button[title="Add Player"]:not([' + DONE + '])').forEach(function (btn) {
      btn.setAttribute(DONE, '1');

      // Walk up the DOM (max 12 levels) to find .publisher-card-publisher-name
      var el = btn, nameEl = null;
      for (var i = 0; i < 12; i++) {
        if (!el.parentElement) break;
        el = el.parentElement;
        nameEl = el.querySelector('.publisher-card-publisher-name');
        if (nameEl) break;
      }
      var pub = nameEl && nameEl.textContent.trim();
      if (!pub) return;

      // Build Live button
      var lb          = document.createElement('button');
      lb.type         = 'button';
      lb.className    = 'btn btn-sm lp-btn';
      lb.title        = 'Watch live: ' + pub;
      lb.innerHTML    = '<span class="lp-dot"></span><i class="bi bi-camera-video-fill"></i> Live';
      lb.onclick      = function (e) { e.stopPropagation(); openPreview(pub); };

      btn.insertAdjacentElement('beforebegin', lb);
    });
  }

  // Watch React re-renders
  new MutationObserver(injectButtons).observe(document.body, {
    childList: true,
    subtree:   true,
  });
  [400, 1200, 2500, 5000].forEach(function (t) { setTimeout(injectButtons, t); });
})();
