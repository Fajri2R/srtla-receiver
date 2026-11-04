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
  var BASE    = location.protocol + '//' + location.host;
  var portStr = location.port ? ':' + location.port : '';
  var hostParts = location.hostname.split('.');
  var isIpHost = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(location.hostname);
  var isDomain = !isIpHost && location.hostname !== 'localhost';
  var rootDomain = hostParts.length > 1 ? hostParts.slice(1).join('.') : location.hostname;
  var HLS_MANAGER_URL = isDomain
    ? location.protocol + '//preview.' + rootDomain + '/?mgmt=' + encodeURIComponent(location.port || (location.protocol === 'https:' ? '443' : '80'))
    : location.protocol + '//' + location.hostname + ':8090/?mgmt=' + encodeURIComponent(location.port || (location.protocol === 'https:' ? '443' : '80'));
  var SRT_MONITOR_URL = isDomain
    ? location.protocol + '//monitor.' + rootDomain + '/'
    : location.protocol + '//' + location.hostname + ':9010/';
  var BRAND_TITLE = 'ASHVEIL \u00b7 SRT Live Management';

  /* ?? Google Fonts (lazy load) ?????????????????????????????????????? */
  var fontP1 = document.createElement('link'); fontP1.rel = 'preconnect'; fontP1.href = 'https://fonts.googleapis.com';
  var fontP2 = document.createElement('link'); fontP2.rel = 'preconnect'; fontP2.href = 'https://fonts.gstatic.com'; fontP2.crossOrigin = 'anonymous';
  var fontL = document.createElement('link'); fontL.rel = 'stylesheet'; fontL.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';
  document.head.append(fontP1, fontP2, fontL);


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

  var themeCss = document.createElement('style');
  themeCss.id = 'hls-manager-theme';
  themeCss.textContent = [
    ':root { --bs-body-bg: #0a0e1a; --bs-body-color: #f1f5f9; --bs-primary: #6366f1; --bs-primary-rgb: 99,102,241; --bs-secondary-color: #94a3b8; --bs-border-color: rgba(255,255,255,.12); }',
    'html, body, button, input, select, textarea { font-family: "Inter", system-ui, -apple-system, sans-serif !important; }',
    'h1, h2, h3, h4, h5, h6, .navbar-brand { letter-spacing: -0.3px; font-weight: 700 !important; }',
    'html, body { min-height: 100vh; background: #0a0e1a !important; color: #f1f5f9 !important; display: flex !important; flex-direction: column !important; margin: 0 !important; } #root { position: relative; z-index: 1; flex: 1 0 auto !important; min-height: 0 !important; background: transparent !important; color: #f1f5f9 !important; }',
    'body::before { content: "" !important; position: fixed !important; inset: 0 !important; background-image: linear-gradient(rgba(99,102,241,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,.03) 1px, transparent 1px) !important; background-size: 40px 40px !important; pointer-events: none !important; z-index: 0 !important; }',
    '.navbar, nav, header { background: rgba(17,24,39,.95) !important; border-bottom: 1px solid rgba(255,255,255,.06) !important; backdrop-filter: blur(20px) !important; -webkit-backdrop-filter: blur(20px) !important; box-shadow: 0 4px 24px rgba(0,0,0,.25) !important; padding: 0 24px !important; height: 64px !important; display: flex !important; align-items: center !important; }',
    '.navbar > .container, .navbar > .container-fluid { padding: 0 !important; margin: 0 auto !important; max-width: 1440px !important; height: 100% !important; }',
    '.navbar-brand.mgmt-brand { display: inline-flex !important; align-items: center !important; gap: 10px !important; margin: 0 !important; text-decoration: none !important; } .mgmt-brand-icon { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 36px; border-radius: 9px; background: radial-gradient(120% 120% at 50% 15%, #3a3d3b 0%, #2c2e2d 55%, #232524 100%); border: 1px solid rgba(228,225,217,.28); box-shadow: 0 2px 10px rgba(0,0,0,.35), inset 0 1px 0 rgba(228,225,217,.12); overflow: hidden; } .mgmt-brand-icon img { margin: 0 !important; width: 24px !important; height: 24px !important; object-fit: contain; display: block; } .mgmt-brand-text { color: #e4e1d9; font-size: 16px !important; font-weight: 800; letter-spacing: .08em; line-height: 1; white-space: nowrap; display: inline-flex; align-items: baseline; gap: 8px; } .mgmt-brand-sub { color: #94a3b8; font-size: 12px !important; font-weight: 600; letter-spacing: .02em; padding-left: 9px; border-left: 1px solid rgba(255,255,255,.12); font-style: normal; }',
    '::-webkit-scrollbar { width: 6px !important; height: 6px !important; }',
    '::-webkit-scrollbar-track { background: transparent !important; }',
    '::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12) !important; border-radius: 100px !important; }',
    '::-webkit-scrollbar-thumb:hover { background: #475569 !important; }',
    '.card, .modal-content, .dropdown-menu, .accordion-item, .list-group-item { background: #111827 !important; color: #f1f5f9 !important; border-color: rgba(255,255,255,.10) !important; box-shadow: 0 4px 24px rgba(0,0,0,.24); }',
    '.card-header, .card-footer, .modal-header, .modal-footer, .accordion-button { background: #1a2235 !important; color: #f1f5f9 !important; border-color: rgba(255,255,255,.10) !important; }',
    '.accordion-button:not(.collapsed) { color: #c7d2fe !important; box-shadow: inset 0 -1px 0 rgba(255,255,255,.10) !important; }',
    '.table { --bs-table-bg: transparent; --bs-table-color: #e2e8f0; --bs-table-border-color: rgba(255,255,255,.10); --bs-table-striped-bg: rgba(255,255,255,.035); --bs-table-hover-bg: rgba(99,102,241,.12); }',
    '.form-control, .form-select, .input-group-text, textarea { background: #0f172a !important; color: #f1f5f9 !important; border-color: rgba(255,255,255,.14) !important; }',
    '.form-control:focus, .form-select:focus, textarea:focus { background: #111827 !important; color: #f1f5f9 !important; border-color: #818cf8 !important; box-shadow: 0 0 0 .2rem rgba(99,102,241,.20) !important; }',
    '.form-control::placeholder { color: #64748b !important; }',
    '.btn-primary, .btn-outline-primary:hover { background: linear-gradient(135deg, #6366f1, #7c3aed) !important; border: none !important; color: #fff !important; font-weight: 600 !important; box-shadow: 0 4px 12px rgba(99,102,241,.28) !important; transition: .2s cubic-bezier(.4,0,.2,1) !important; }',
    '.btn-primary:hover { background: #4f46e5 !important; border-color: #4f46e5 !important; }',
    '.btn-outline-primary { color: #a5b4fc !important; border-color: #6366f1 !important; }',
    '.btn-secondary, .btn-outline-secondary { background: #1e293b !important; color: #cbd5e1 !important; border-color: rgba(255,255,255,.14) !important; }',
    '.btn-danger { background: #ef4444 !important; border-color: #ef4444 !important; }',
    'a { color: #a5b4fc; } a:hover { color: #c7d2fe; }',
    '.text-muted, .text-secondary, small { color: #94a3b8 !important; }',
    '.badge.bg-primary, .bg-primary { background-color: #6366f1 !important; }',
    '.publisher-card { background: #111827 !important; border: 1px solid rgba(255,255,255,.12) !important; border-radius: 16px !important; padding: 12px !important; box-shadow: 0 4px 24px rgba(0,0,0,.4) !important; transition: .2s cubic-bezier(.4,0,.2,1) !important; overflow: visible !important; }',
    '.publisher-card:hover { border-color: rgba(99,102,241,.5) !important; box-shadow: 0 4px 24px rgba(0,0,0,.4), 0 0 40px rgba(99,102,241,.15) !important; transform: translateY(-2px); }',
    '#lp-badge { background: rgba(99,102,241,.14) !important; border-color: rgba(129,140,248,.42) !important; }',
    '#lp-badge-dot { background: #818cf8 !important; }',
    '#lp-bx { background: #111827 !important; border-color: rgba(129,140,248,.30) !important; box-shadow: 0 0 0 1px rgba(99,102,241,.15), 0 32px 80px rgba(0,0,0,.7) !important; }',
    '#lp-spinner { border-top-color: #818cf8 !important; }',
    '.mgmt-nav-btn { display: inline-flex !important; align-items: center; justify-content: center; gap: 7px; height: 36px !important; padding: 0 14px !important; border: 1px solid rgba(255,255,255,.12) !important; border-radius: 6px !important; background: #1a2235 !important; color: #94a3b8 !important; font-size: 13px !important; font-weight: 500 !important; cursor: pointer; text-decoration: none !important; transition: background .18s, color .18s, border-color .18s !important; }',
    '.mgmt-nav-btn:hover { color: #f1f5f9 !important; border-color: rgba(99,102,241,.5) !important; background: #1e2a3d !important; transform: none !important; }',
    '.mgmt-nav-btn svg { width: 15px !important; height: 15px !important; }',
    'button[data-mgmt-settings] { position: relative; display: inline-flex !important; align-items: center; gap: 7px; height: 36px !important; padding: 0 14px !important; border: 1px solid rgba(255,255,255,.12) !important; border-radius: 6px !important; background: #1a2235 !important; color: #94a3b8 !important; font-size: 13px !important; font-weight: 500 !important; transition: .2s cubic-bezier(.4,0,.2,1) !important; box-shadow: none !important; }',
    'button[data-mgmt-settings]:hover, button[data-mgmt-settings]:focus-visible { background: #1e2a3d !important; border-color: rgba(99,102,241,.5) !important; color: #f1f5f9 !important; outline: none !important; }',
    '.mgmt-nav-btn[data-tooltip] { position: relative; }',
    '@media (min-width: 992px) { .mgmt-nav-btn[data-tooltip]::after { content: attr(data-tooltip); position: absolute; top: calc(100% + 9px); right: 0; z-index: 2147483647; padding: 7px 10px; border: 1px solid rgba(255,255,255,.12); border-radius: 6px; background: rgba(17,24,39,.98); color: #f1f5f9; font-size: 11px; font-weight: 500; white-space: nowrap; box-shadow: 0 8px 20px rgba(0,0,0,.35); opacity: 0; transform: translateY(-4px); pointer-events: none; transition: opacity .16s ease, transform .16s ease; } .mgmt-nav-btn[data-tooltip]:hover::after, .mgmt-nav-btn[data-tooltip]:focus-visible::after { opacity: 1; transform: translateY(0); } }',
    '@media (min-width: 992px) { button[data-mgmt-settings]::after { content: attr(data-tooltip); position: absolute; top: calc(100% + 9px); right: 0; z-index: 2147483647; padding: 7px 10px; border: 1px solid rgba(255,255,255,.12); border-radius: 6px; background: rgba(17,24,39,.98); color: #f1f5f9; font-size: 11px; font-weight: 500; white-space: nowrap; box-shadow: 0 8px 20px rgba(0,0,0,.35); opacity: 0; transform: translateY(-4px); pointer-events: none; transition: opacity .16s ease, transform .16s ease; } button[data-mgmt-settings]:hover::after, button[data-mgmt-settings]:focus-visible::after { opacity: 1; transform: translateY(0); } }',
    '.live-status { display: flex !important; align-items: center; gap: 6px; height: 36px !important; padding: 0 12px !important; border-radius: 100px !important; color: #94a3b8 !important; background: #1a2235 !important; border: 1px solid rgba(255,255,255,.06) !important; font-size: 12px !important; font-weight: 500 !important; white-space: nowrap !important; margin-right: 8px; }',
    '.live-status.error { color: #94a3b8 !important; }',
    '.live-status .dot { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; background: #22c55e; animation: pulse-anim 2s infinite; }',
    '.live-status.error .dot { background: #ef4444; }',
    '@keyframes pulse-anim { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .5; transform: scale(.8); } }',
    '.navbar .container-fluid { display: flex !important; align-items: center !important; height: 100% !important; } .navbar .ms-auto { display: flex !important; flex-flow: row nowrap !important; align-items: center !important; gap: 8px; margin: 0 !important; }',
    '@media (max-width: 991.98px) { .navbar, nav, header { height: auto !important; min-height: 56px !important; padding: 12px 16px !important; } .navbar > .container, .navbar > .container-fluid { flex-wrap: wrap !important; gap: 8px 12px !important; } .navbar-brand { order: 1; flex: 1 1 auto !important; } .live-status { order: 6; flex: 0 0 auto !important; margin: 0 !important; height: 34px !important; padding: 0 10px !important; font-size: 11px !important; } .navbar .ms-auto { order: 3; width: 100% !important; flex: 1 1 100% !important; display: contents !important; } .mgmt-nav-btn { order: 4; } button[data-mgmt-settings] { order: 5; height: 34px !important; padding: 0 10px !important; font-size: 12px !important; } .mgmt-nav-btn .btn-text { display: none !important; } button[data-mgmt-settings] .mgmt-settings-label { display: none !important; } .mgmt-nav-btn { padding: 0 10px !important; } .live-status .dot { width: 6px; height: 6px; flex: 0 0 6px; } }',
    '@media (max-width: 600px) { .navbar, nav, header { padding: 12px !important; } .navbar-brand { font-size: 14px !important; } .mgmt-brand-icon { width: 32px; height: 32px; flex: 0 0 32px; font-size: 16px; } .mgmt-brand-text { display: none; } }',
    '.mgmt-toast { position: fixed; bottom: 24px; right: 24px; z-index: 2147483647; background: rgba(17,24,39,0.95); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); border-radius: var(--radius-md); color: #f1f5f9; padding: 12px 20px; font-size: 13px; font-weight: 500; box-shadow: 0 10px 30px rgba(0,0,0,0.5); transform: translateY(20px); opacity: 0; transition: transform .25s ease, opacity .25s ease; pointer-events: none; display: flex; align-items: center; gap: 8px; }',
    '.mgmt-toast.show { transform: translateY(0); opacity: 1; }',
    '.mgmt-toast.error { border-color: rgba(239,68,68,0.25); background: rgba(127,29,29,0.95); }'
  ].join('\n');
  document.head.appendChild(themeCss);

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

  function openPreview(pub, retryAttempt) {
    retryAttempt = retryAttempt || 0;
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
            if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
              return;
            }
            if (d.type === Hls.ErrorTypes.NETWORK_ERROR && retryAttempt < 5) {
              var delay = 2000 + retryAttempt * 1000;
              hls.destroy();
              hls = null;
              setMsg('Stream preparing\u2026 retrying in ' + (delay / 1000) + 's', true);
              setTimeout(function () {
                if (ov.classList.contains('on')) openPreview(pub, retryAttempt + 1);
              }, delay);
              return;
            }
            setMsg('\u26a0\ufe0f Stream unavailable \u2014 check the HLS transcoder.', false);
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

  var lastLiveStatus = "";
  function showToast(msg, isError) {
    var oldToast = document.querySelector('.mgmt-toast');
    if (oldToast) oldToast.remove();
    var toast = document.createElement('div');
    toast.className = 'mgmt-toast' + (isError ? ' error' : '');
    toast.innerHTML = (isError ? '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' : '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>') + '<span>' + msg + '</span>';
    document.body.appendChild(toast);
    setTimeout(function () { toast.classList.add('show'); }, 50);
    setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () { toast.remove(); }, 300);
    }, 4000);
  }

  function updateLiveStatus() {
    var badge = document.getElementById('mgmt-live-status');
    if (!badge) return;

    fetch('/api/hls-health', { cache: 'no-store' })
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(data) {

        // Auto-sync Management UI if publishers are added or deleted in another browser
        var serverPubCount = (data && Array.isArray(data.publishers)) ? data.publishers.length : null;
        if (serverPubCount !== null) {
          if (window.lpLastKnownConfigCount === undefined) {
             window.lpLastKnownConfigCount = serverPubCount;
          } else if (window.lpLastKnownConfigCount !== serverPubCount) {
             var isModalOpen = document.querySelector('.modal.show, .modal.in, [role="dialog"]');
             var isInputFocused = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
             if (!isModalOpen && !isInputFocused) {
                console.log('Publishers count changed (' + window.lpLastKnownConfigCount + ' -> ' + serverPubCount + '). Syncing UI...');
                document.body.style.transition = 'opacity 160ms ease, filter 160ms ease';
                document.body.style.opacity = '0.88';
                document.body.style.filter = 'blur(1px)';
                document.body.style.pointerEvents = 'none';
                setTimeout(function() { window.location.reload(); }, 160);
                return;
             }
          }
        }

        var activeCount = 0;
        if (data && Number.isFinite(data.activePublishers)) {
          activeCount = data.activePublishers;
        } else if (data && Array.isArray(data.streams)) {
          activeCount = data.streams.filter(function(s) { return !!s.publisherStats; }).length;
        }
        var statusKey = 'ok:' + activeCount;
        if (statusKey !== lastLiveStatus) {
          lastLiveStatus = statusKey;
          var textNode = badge.querySelector('span');
          var newText = activeCount > 0 ? ('Publishers: ' + activeCount + ' active') : 'No active stream';
          if (activeCount > 0) badge.classList.remove('error');
          else badge.classList.add('error');
          textNode.textContent = newText;
        }
      })
      .catch(function() {
        if (lastLiveStatus !== 'error') {
          lastLiveStatus = 'error';
          badge.classList.add('error');
          badge.querySelector('span').textContent = 'Status unavailable';
        }
      });
  }

  function enhanceNavbarBrand() {
    document.querySelectorAll('.navbar-brand:not([data-mgmt-brand])').forEach(function (brand) {
      brand.dataset.mgmtBrand = '1';
      brand.classList.add('mgmt-brand');
      brand.setAttribute('aria-label', 'ASHVEIL SRT Live Management');
      brand.innerHTML = '<span class="mgmt-brand-icon" aria-hidden="true">'
        + '<img src="/ashveil-emblem.png?v=2" alt="" width="24" height="24" decoding="async">'
        + '</span>'
        + '<span class="mgmt-brand-text">ASHVEIL<em class="mgmt-brand-sub">SRT Live Management</em></span>';
    });
  }

  // Give the tab the Ashveil identity as well: the vendor bundle ships a
  // generic/emoji title and no favicon.
  function applyBrandIdentity() {
    if (document.title !== BRAND_TITLE) document.title = BRAND_TITLE;
    if (!document.querySelector('link[data-ashveil-icon]')) {
      [['icon', '/ashveil-favicon.png', 'image/png'],
       ['apple-touch-icon', '/apple-touch-icon.png', 'image/png']].forEach(function (spec) {
        var link = document.createElement('link');
        link.rel = spec[0];
        link.href = spec[1];
        if (spec[2]) link.type = spec[2];
        link.setAttribute('data-ashveil-icon', '1');
        document.head.appendChild(link);
      });
      var theme = document.createElement('meta');
      theme.name = 'theme-color';
      theme.content = '#2c2e2d';
      theme.setAttribute('data-ashveil-icon', '1');
      document.head.appendChild(theme);
    }
  }

  function injectNavTools() {
    document.querySelectorAll('button[data-mgmt-settings], button[title="Settings"], button[title="Configure Settings"]').forEach(function (settingsBtn) {
      settingsBtn.dataset.mgmtSettings = '1';
      settingsBtn.setAttribute('aria-label', 'Configure Settings');
      settingsBtn.setAttribute('data-tooltip', 'Configure Settings');
      settingsBtn.removeAttribute('title');
      if (!settingsBtn.querySelector('.mgmt-settings-label')) {
        var label = document.createElement('span');
        label.className = 'mgmt-settings-label';
        label.textContent = 'Settings';
        settingsBtn.appendChild(label);
      }

      if (settingsBtn.parentNode.querySelector('.mgmt-nav-tools')) return;

      // 1. SRT Monitor Button
      var srtBtn = document.createElement('a');
      srtBtn.className = 'mgmt-nav-btn';
      srtBtn.href = SRT_MONITOR_URL;
      srtBtn.target = '_blank';
      srtBtn.rel = 'noopener';
      srtBtn.setAttribute('data-tooltip', 'Open SRT Monitor');
      srtBtn.setAttribute('aria-label', 'Open SRT Monitor');
      srtBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg><span class="btn-text">SRT Monitor</span>';

      // 2. HLS Manager Button
      var hlsBtn = document.createElement('a');
      hlsBtn.className = 'mgmt-nav-btn';
      hlsBtn.href = HLS_MANAGER_URL;
      hlsBtn.target = '_blank';
      hlsBtn.rel = 'noopener';
      hlsBtn.setAttribute('data-tooltip', 'Open HLS Manager');
      hlsBtn.setAttribute('aria-label', 'Open HLS Manager');
      hlsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg><span class="btn-text">HLS Manager</span>';

      // 3. Live Status Badge
      var liveBadge = document.createElement('div');
      liveBadge.className = 'live-status';
      liveBadge.id = 'mgmt-live-status';
      liveBadge.innerHTML = '<i class="dot"></i><span>Checking status…</span>';

      // Order injected before the Settings button (left to right):
      // Wrap them in a single container to prevent React DOM tracking issues
      var container = document.createElement('div');
      container.className = 'mgmt-nav-tools';
      container.style.display = 'contents';
      container.appendChild(hlsBtn);
      container.appendChild(srtBtn);

      settingsBtn.insertAdjacentElement('beforebegin', container);
      settingsBtn.insertAdjacentElement('afterend', liveBadge);

    });
  }

  var _origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    _origSetItem.apply(this, arguments);
    if (/api.?key/i.test(String(key))) {
      // Sync it to backend immediately without reloading the page
      fetch('/api/apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apikey: value })
      })
      .then(function(res) {
        if (res.ok) {
          showToast('API Key updated successfully', false);
        } else {
          showToast('Failed to sync API Key with backend', true);
        }
      })
      .catch(function(err) {
        showToast('Error syncing API Key: ' + err.message, true);
      });
    }
  };

  function injectButtons() {
    applyBrandIdentity();
    enhanceNavbarBrand();
    injectNavTools();
    enhanceStreamUrlModal();
  }

  /* ── Stream URL host selection (SRT-only domain, else origin IP) ──── */
  // SRT/SRTLA use UDP: they must never point at the dashboard hostname
  // (Cloudflare-proxied) and instead need either the origin IP or a
  // DNS-only hostname that resolves straight to it. The correct host is
  // chosen automatically and the existing URL fields are rewritten in
  // place — no duplicated list of alternate URLs.
  //
  // No hostnames are hardcoded here: values come from /lp-config.json
  // (generated from LP_VPS_IP / LP_SRT_DOMAIN on the host) and otherwise
  // fall back to the page hostname.
  var cfg = window.__LP_CONFIG || {};
  var VPS_IP = cfg.vpsIp || window.__LP_VPS_IP || (isIpHost ? location.hostname : '');
  var SRT_DOMAIN = cfg.srtDomain || window.__LP_SRT_DOMAIN || (isDomain ? 'srt.' + rootDomain : '');
  var configLoaded = !!(cfg.vpsIp || cfg.srtDomain);

  // Load the per-deployment host config (served by mgmt-proxy from a file
  // that is generated at container start, never committed).
  function loadConfig(cb) {
    if (configLoaded) { cb(); return; }
    var finish = function () { configLoaded = true; cb(); };
    fetch('/lp-config.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) {
        if (d && d.vpsIp) VPS_IP = d.vpsIp;
        if (d && d.srtDomain) SRT_DOMAIN = d.srtDomain;
        finish();
      })
      .catch(finish);
  }

  // The bundle reads this when rendering SRT/SRTLA URLs (see the nginx
  // sub_filter for Uo()), so it must exist before the first modal render.
  if (!window.__LP_SRT_HOST) window.__LP_SRT_HOST = VPS_IP || location.hostname;

  var hvState = {
    domainOk: false,
    checked:  false,
    mode:     null  // 'domain' | 'ip'
  };

  var hvcss = document.createElement('style');
  hvcss.textContent =
    '.lp-host{margin-top:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;color:#94a3b8}' +
    '.lp-host-label{font-size:10.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#a5b4fc}' +
    '.lp-host-btn{font-size:10.5px;font-weight:700;letter-spacing:.3px;padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#cbd5e1;cursor:pointer}' +
    '.lp-host-btn:hover{background:rgba(255,255,255,.12);color:#fff}' +
    '.lp-host-btn.on{background:rgba(59,130,246,.22);border-color:rgba(96,165,250,.5);color:#93c5fd}' +
    '.lp-host-note{flex:1 1 100%;font-size:10.5px;line-height:1.45;color:#94a3b8}' +
    '.lp-host-note.warn{color:#fbbf24}';
  document.head.appendChild(hvcss);

  function withHost(url, host) {
    try {
      var u = new URL(url);
      if (!u.hostname) return null;
      u.hostname = host;
      return u.toString();
    } catch (e) { return null; }
  }

  // Resolve the SRT hostname over DNS-over-HTTPS and only treat it as
  // usable when it points at this server (i.e. a DNS-only A record).
  function detectDomain(cb) {
    if (hvState.checked) { cb(hvState.domainOk); return; }
    loadConfig(function () {
      var done = function (ok) {
        hvState.checked = true;
        hvState.domainOk = ok;
        cb(ok);
      };
      if (!SRT_DOMAIN || !VPS_IP) { done(false); return; }
      var timer = setTimeout(function () { done(false); }, 4000);
      fetch('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(SRT_DOMAIN) + '&type=A',
            { headers: { Accept: 'application/dns-json' }, cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          clearTimeout(timer);
          var ips = (d.Answer || []).filter(function (a) { return a.type === 1; }).map(function (a) { return a.data; });
          done(ips.indexOf(VPS_IP) !== -1);
        })
        .catch(function () { clearTimeout(timer); done(false); });
    });
  }

  // Rewrite every SRT/SRTLA/stats field so it is reachable. The bundle now
  // derives the UDP host from window.__LP_SRT_HOST, so a modal that opens
  // after the chooser changes is already correct; this keeps an open modal
  // in sync as a fallback.
  function setInputValue(inp, val) {
    if (!inp || inp.value === val) return;
    try {
      var proto = window.HTMLInputElement && window.HTMLInputElement.prototype;
      var setter = proto && Object.getOwnPropertyDescriptor(proto, 'value');
      if (setter && setter.set) {
        setter.set.call(inp, val);
      } else {
        inp.value = val;
      }
    } catch (e) { inp.value = val; }
  }

  // Statistics URL: the vendor bundle formats it as http://<udp-host>:<port>.
  // From an HTTPS dashboard that is both mixed-content and unreachable, so the
  // value is pinned to the dashboard origin. React owns the input and rewrites
  // it on every poll, hence the property override instead of a one-off set.
  function pinStatsUrl(inp) {
    if (inp.__lpPinned) return;
    inp.__lpPinned = true;
    var raw = inp.value;
    try {
      Object.defineProperty(inp, 'value', {
        configurable: true,
        get: function () {
          var v = raw || '';
          if (!/^https?:\/\/.+\/stats\//.test(v)) return v;
          try {
            var u = new URL(v);
            return location.origin + u.pathname + u.search;
          } catch (e) { return v; }
        },
        set: function (next) { raw = next; }
      });
    } catch (e) { inp.__lpPinned = false; }
  }

  function applyHost(mode) {
    var modal = document.querySelector('.modal.show, .modal.in, .modal');
    if (!modal) return;
    var host = mode === 'domain' ? SRT_DOMAIN : VPS_IP;

    [].forEach.call(modal.querySelectorAll('input'), function (inp) {
      var val = inp.value || '';
      if (/^(srt|srtla):\/\//.test(val)) {
        var swapped = withHost(val, host);
        if (swapped && swapped !== val) setInputValue(inp, swapped);
      } else if (/^https?:\/\/.+\/stats\//.test(val)) {
        pinStatsUrl(inp);
      }
    });
  }

  function renderHostSwitch() {
    var modal = document.querySelector('.modal.show, .modal.in');
    if (!modal) return;
    var body = modal.querySelector('.modal-body');
    if (!body) return;
    var existing = body.querySelector('.lp-host');

    if (!hvState.domainOk) {
      if (existing) existing.remove();
      applyHost('ip');
      return;
    }
    if (existing) {
      [].forEach.call(existing.querySelectorAll('.lp-host-btn'), function (b) {
        b.classList.toggle('on', b.getAttribute('data-lp-host') === hvState.mode);
      });
      return;
    }

    var wrap = document.createElement('div');
    wrap.className = 'lp-host';
    wrap.innerHTML =
      '<span class="lp-host-label">Host</span>' +
      '<button type="button" class="lp-host-btn" data-lp-host="domain">' + SRT_DOMAIN + '</button>' +
      '<button type="button" class="lp-host-btn" data-lp-host="ip">' + VPS_IP + '</button>' +
      '<div class="lp-host-note">Domain memakai record DNS-only langsung ke VPS. Pilih IP bila ingin bypass DNS.</div>';

    [].forEach.call(wrap.querySelectorAll('.lp-host-btn'), function (btn) {
      btn.addEventListener('click', function () {
        hvState.mode = btn.getAttribute('data-lp-host');
        window.__LP_SRT_HOST = hvState.mode === 'domain' ? SRT_DOMAIN : VPS_IP;
        applyHost(hvState.mode);
        renderHostSwitch();
      });
    });
    body.appendChild(wrap);
  }

  function enhanceStreamUrlModal() {
    var modal = document.querySelector('.modal.show, .modal.in, .modal');
    if (!modal) return;
    var body = modal.querySelector('.modal-body') || modal;

    // Only act on the stream-URL modal (it contains publish/play URLs).
    var hasSrt = [].some.call(modal.querySelectorAll('input'), function (i) {
      return /^(srt|srtla):\/\//.test(i.value || '');
    });
    if (!hasSrt) return;

    detectDomain(function (ok) {
      if (!hvState.mode) hvState.mode = ok ? 'domain' : 'ip';
      if (!ok) hvState.mode = 'ip';
      window.__LP_SRT_HOST = hvState.mode === 'domain' ? SRT_DOMAIN : VPS_IP;
      applyHost(hvState.mode);
      renderHostSwitch();
      watchModal(modal);
    });
  }

  // React rewrites the URL inputs on every stats poll, so the chosen host
  // has to be re-applied right after each re-render.
  var watchedModal = null;
  function watchModal(modal) {
    if (watchedModal === modal) return;
    watchedModal = modal;
    var reapply = function () { if (hvState.checked) applyHost(hvState.mode || 'ip'); };
    try {
      new MutationObserver(reapply).observe(modal, { childList: true, subtree: true });
    } catch (e) {}
    setInterval(function () {
      if (!document.body.contains(modal)) { watchedModal = null; return; }
      if (!document.hidden) reapply();
    }, 400);
  }

  function syncApiKeyOnLoad() {
    var storedKey = localStorage.getItem('apiKey') || localStorage.getItem('api_key') || localStorage.getItem('srt-api-key');
    if (storedKey) {
      fetch('/api/apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apikey: storedKey })
      }).catch(function(){});
    }
  }
  syncApiKeyOnLoad();

  // Watch React re-renders
  var injectTimeout = null;
  new MutationObserver(function() {
    if (injectTimeout) clearTimeout(injectTimeout);
    injectTimeout = setTimeout(injectButtons, 200);
  }).observe(document.body, {
    childList: true,
    subtree:   true,
  });
  [400, 1200, 2500, 5000].forEach(function (t) { setTimeout(injectButtons, t); });
  setInterval(function() {
    if (!document.hidden) {
      updateLiveStatus();
      // React regenerates the URL fields during polling; keep the selected
      // valid UDP host and same-origin stats URL after that re-render.
      enhanceStreamUrlModal();
    }
  }, 1000);
  updateLiveStatus();
  // Refresh immediately when the tab becomes visible again: the poll interval
  // is skipped while the page is hidden, so the badge would otherwise show a
  // stale count until the next interval after focus returns.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) updateLiveStatus();
  });
  // Resolve the DNS-only host before the user opens the URL modal, so the
  // vendor bundle renders the correct host on its first render.
  setTimeout(function() {
    detectDomain(function(ok) {
      hvState.domainOk = ok;
      hvState.checked = true;
      hvState.mode = ok ? 'domain' : 'ip';
      window.__LP_SRT_HOST = ok ? SRT_DOMAIN : VPS_IP;
    });
  }, 200);
})();
