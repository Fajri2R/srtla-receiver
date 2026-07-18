/**
 * Live Preview injector for SLS Management UI
 * Injected via mgmt-proxy nginx sub_filter
 * DOM hooks:
 *   button[title="Add Player"]       — action button per publisher
 *   .publisher-card-publisher-name   — publisher stream ID text
 * Bootstrap 5 + Bootstrap Icons already loaded by the app.
 */
(function () {
  'use strict';
  if (window.__lp) return;
  window.__lp = true;

  /* ── Config (LP_PORT_PLACEHOLDER replaced by receiver.sh) ─────── */
  var LP_PORT = LP_PORT_PLACEHOLDER;
  var BASE    = location.protocol + '//' + location.hostname + ':' + LP_PORT;

  /* ── Load HLS.js ────────────────────────────────────────────────── */
  var hlsScript = document.createElement('script');
  hlsScript.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
  document.head.appendChild(hlsScript);

  /* ── Styles ─────────────────────────────────────────────────────── */
  var style = document.createElement('style');
  style.textContent = [
    /* "Live" button — inherits Bootstrap context, override with !important */
    '.lp-btn{',
      'background:linear-gradient(135deg,#dc3545,#9b1c2e)!important;',
      'border:none!important;color:#fff!important;',
      'font-size:11px!important;padding:3px 10px!important;',
      'border-radius:5px!important;cursor:pointer;',
      'margin-right:5px;vertical-align:middle;',
      'line-height:1.5;transition:opacity .2s;',
    '}',
    '.lp-btn:hover{opacity:.8!important}',

    /* Modal overlay */
    '#lp-ov{display:none;position:fixed;inset:0;z-index:2147483647;',
      'background:rgba(0,0,0,.82);align-items:center;justify-content:center}',
    '#lp-ov.on{display:flex}',

    /* Modal card */
    '#lp-bx{background:#0d0d1a;border:1px solid #1e1e36;border-radius:16px;',
      'padding:24px;width:min(860px,95vw);box-shadow:0 0 80px rgba(0,0,0,.6)}',

    /* Header */
    '#lp-hd{display:flex;justify-content:space-between;',
      'align-items:center;margin-bottom:16px}',
    '#lp-tt{color:#ff4757;font-weight:700;font-size:15px;',
      'display:flex;align-items:center;gap:8px}',

    /* Blinking red dot */
    '#lp-dt{width:9px;height:9px;background:#ff4757;border-radius:50%;',
      'animation:lp-blink 1s ease-in-out infinite}',
    '@keyframes lp-blink{',
      '0%,100%{opacity:1;transform:scale(1)}',
      '50%{opacity:.25;transform:scale(.65)}',
    '}',

    /* Close button */
    '#lp-xb{background:transparent;border:1px solid #2e2e4a;color:#777;',
      'border-radius:8px;padding:5px 14px;cursor:pointer;',
      'font-size:13px;transition:.2s}',
    '#lp-xb:hover{border-color:#ff4757;color:#ff4757}',

    /* Video */
    '#lp-vid{width:100%;border-radius:10px;aspect-ratio:16/9;',
      'background:#000;display:block}',

    /* Status lines */
    '#lp-st{color:#444;font-size:12px;margin-top:10px;',
      'text-align:center;min-height:18px}',
    '#lp-url{color:#333;font-size:11px;margin-top:4px;',
      'text-align:center;word-break:break-all}',
  ].join('');
  document.head.appendChild(style);

  /* ── Modal HTML ─────────────────────────────────────────────────── */
  var ov = document.createElement('div');
  ov.id = 'lp-ov';
  ov.innerHTML = [
    '<div id="lp-bx">',
      '<div id="lp-hd">',
        '<div id="lp-tt">',
          '<span id="lp-dt"></span>',
          '<span id="lp-nm">Live Preview</span>',
        '</div>',
        '<button id="lp-xb" type="button">\u2715 Close</button>',
      '</div>',
      '<video id="lp-vid" controls muted playsinline></video>',
      '<div id="lp-st"></div>',
      '<div id="lp-url"></div>',
    '</div>',
  ].join('');
  document.body.appendChild(ov);

  /* ── Player logic ───────────────────────────────────────────────── */
  var hls = null;

  function safeId(s) {
    return s.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function openPreview(pub) {
    var url = BASE + '/hls/' + safeId(pub) + '/stream.m3u8';
    document.getElementById('lp-nm').textContent = pub;
    document.getElementById('lp-st').textContent  = 'Connecting...';
    document.getElementById('lp-url').textContent = url;
    ov.classList.add('on');

    var v = document.getElementById('lp-vid');
    if (hls) { hls.destroy(); hls = null; }
    v.src = '';

    function startHls() {
      if (window.Hls && Hls.isSupported()) {
        hls = new Hls({
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 5,
          maxBufferLength: 8,
        });
        hls.loadSource(url);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, function () {
          v.play().catch(function () {});
          document.getElementById('lp-st').textContent = '\u25b6 Playing';
        });
        hls.on(Hls.Events.ERROR, function (_, d) {
          if (d.fatal) {
            document.getElementById('lp-st').textContent =
              '\u26a0 Stream not active yet \u2014 is the publisher connected?';
          }
        });
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = url;
        v.play().catch(function () {});
      } else {
        document.getElementById('lp-st').textContent =
          'HLS not supported in this browser.';
      }
    }

    if (window.Hls) {
      startHls();
    } else {
      hlsScript.addEventListener('load', startHls, { once: true });
    }
  }

  function closePreview() {
    ov.classList.remove('on');
    var v = document.getElementById('lp-vid');
    v.pause();
    v.src = '';
    if (hls) { hls.destroy(); hls = null; }
  }

  document.getElementById('lp-xb').onclick = closePreview;
  ov.onclick = function (e) { if (e.target === ov) closePreview(); };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePreview();
  });

  /* ── Button injection ───────────────────────────────────────────── */
  var DONE = 'data-lp-injected';

  function injectButtons() {
    // Find every "Add Player" button that we haven't processed yet
    var addBtns = document.querySelectorAll(
      'button[title="Add Player"]:not([' + DONE + '])'
    );

    addBtns.forEach(function (btn) {
      btn.setAttribute(DONE, '1');

      // Walk up the DOM tree (up to 12 levels) to find the publisher name
      var el = btn;
      var nameEl = null;
      for (var i = 0; i < 12; i++) {
        if (!el.parentElement) break;
        el = el.parentElement;
        nameEl = el.querySelector('.publisher-card-publisher-name');
        if (nameEl) break;
      }

      var pub = nameEl && nameEl.textContent.trim();
      if (!pub) return;

      // Build the "Live" button using Bootstrap classes (already in app)
      var lb = document.createElement('button');
      lb.className   = 'btn btn-sm lp-btn';
      lb.title       = 'Live Preview: ' + pub;
      lb.type        = 'button';
      lb.innerHTML   = '<i class="bi bi-camera-video-fill me-1"></i>Live';
      lb.onclick     = function (e) { e.stopPropagation(); openPreview(pub); };

      // Insert immediately before the "Add Player" button
      btn.insertAdjacentElement('beforebegin', lb);
    });
  }

  // Watch for React re-renders that rebuild the stream list
  new MutationObserver(injectButtons).observe(document.body, {
    childList: true,
    subtree:   true,
  });

  // Also try immediately and after typical React hydration delays
  [400, 1200, 2500, 5000].forEach(function (t) {
    setTimeout(injectButtons, t);
  });
})();
