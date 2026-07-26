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
  var HLS_MANAGER_URL = location.protocol + '//' + location.hostname + ':8090/?mgmt=' + encodeURIComponent(location.port || (location.protocol === 'https:' ? '443' : '80'));
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
    '.mgmt-footer { text-align: center; padding: 24px; font-size: 12px; color: #475569; border-top: 1px solid rgba(255,255,255,.06); margin-top: auto; position: relative; z-index: 1; width: 100%; flex-shrink: 0; }',
    '.mgmt-footer a { color: #818cf8; text-decoration: none; transition: .2s cubic-bezier(.4,0,.2,1); }',
    '.mgmt-footer a:hover { color: #c7d2fe; }',
    '.navbar, nav, header { background: rgba(17,24,39,.96) !important; border-bottom: 1px solid rgba(255,255,255,.08) !important; box-shadow: 0 4px 24px rgba(0,0,0,.25); padding: 0 24px !important; height: 64px !important; display: flex !important; align-items: center !important; }',
    '.navbar > .container, .navbar > .container-fluid { padding: 0 !important; margin: 0 auto !important; max-width: 1440px !important; height: 100% !important; }',
    '.navbar-brand.mgmt-brand { display: inline-flex !important; align-items: center !important; gap: 10px !important; margin: 0 !important; text-decoration: none !important; } .mgmt-brand-icon { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 36px; border-radius: 6px; color: #fff; background: linear-gradient(135deg, #6366f1, #8b5cf6); box-shadow: 0 0 16px rgba(99,102,241,.25); } .mgmt-brand-icon i { margin: 0 !important; font-size: 18px !important; line-height: 1; } .mgmt-brand-text { color: #f1f5f9; font-size: 16px !important; font-weight: 700; letter-spacing: -.3px; line-height: 1; white-space: nowrap; } .mgmt-brand-text span { color: #818cf8; }',
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
    '.publisher-card { background: #111827 !important; border: 1px solid rgba(255,255,255,.12) !important; border-radius: 16px !important; box-shadow: 0 4px 24px rgba(0,0,0,.4) !important; transition: .2s cubic-bezier(.4,0,.2,1) !important; }',
    '.publisher-card:hover { border-color: rgba(99,102,241,.5) !important; box-shadow: 0 4px 24px rgba(0,0,0,.4), 0 0 40px rgba(99,102,241,.15) !important; transform: translateY(-2px); }',
    '.lp-btn { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%) !important; box-shadow: 0 2px 8px rgba(99,102,241,.35) !important; }',
    '.lp-btn:hover { box-shadow: 0 4px 14px rgba(99,102,241,.52) !important; }',
    '#lp-badge { background: rgba(99,102,241,.14) !important; border-color: rgba(129,140,248,.42) !important; }',
    '#lp-badge-dot { background: #818cf8 !important; }',
    '#lp-bx { background: #111827 !important; border-color: rgba(129,140,248,.30) !important; box-shadow: 0 0 0 1px rgba(99,102,241,.15), 0 32px 80px rgba(0,0,0,.7) !important; }',
    '#lp-spinner { border-top-color: #818cf8 !important; }',
    '.hls-manager-nav-btn, button[title="Settings"] { display: inline-flex !important; align-items: center; gap: 7px; background: #1a2235 !important; border: 1px solid rgba(255,255,255,.12) !important; border-radius: 6px !important; color: #94a3b8 !important; font-size: 13px !important; font-weight: 500 !important; padding: 7px 14px !important; transition: .2s cubic-bezier(.4,0,.2,1) !important; box-shadow: none !important; }',
    '.hls-manager-nav-btn { margin-right: 8px; }',
    '.hls-manager-nav-btn:hover, button[title="Settings"]:hover { background: #1e2a3d !important; border-color: rgba(99,102,241,.5) !important; color: #f1f5f9 !important; transform: none !important; }',
    '.navbar .container-fluid { display: flex !important; align-items: center !important; height: 100% !important; } .navbar .ms-auto { display: flex !important; flex-flow: row nowrap !important; align-items: center !important; gap: 8px; margin: 0 !important; }',
    '@media (max-width: 991.98px) { .navbar, nav, header { height: 56px !important; min-height: 56px !important; padding: 0 16px !important; } .navbar > .container, .navbar > .container-fluid, nav > .container, nav > .container-fluid, header > .container, header > .container-fluid { display: flex !important; flex-wrap: nowrap !important; align-items: center !important; gap: 8px !important; min-width: 0; height: 100% !important; } .navbar .ms-auto { flex: 0 0 auto !important; margin-left: auto !important; } .navbar-brand, .navbar .navbar-brand { flex: 1 1 auto !important; min-width: 0; margin-right: 0 !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px !important; } .navbar-collapse, .navbar .navbar-collapse { display: flex !important; flex: 0 0 auto !important; width: auto !important; margin: 0 !important; } .hls-manager-nav-btn { flex: 0 0 36px !important; width: 36px !important; min-width: 36px !important; height: 36px !important; margin: 0 !important; padding: 0 !important; justify-content: center !important; gap: 0 !important; font-size: 0 !important; } button[title="Settings"] { flex: 0 0 auto !important; width: auto !important; min-width: 0 !important; height: 36px !important; margin: 0 !important; padding: 0 12px !important; justify-content: center !important; gap: 7px !important; font-size: 13px !important; white-space: nowrap !important; } .hls-manager-nav-btn i, button[title="Settings"] i { font-size: 16px !important; } .hls-manager-nav-btn svg, button[title="Settings"] svg { width: 16px !important; height: 16px !important; } }',
    '@media (max-width: 600px) { .navbar, nav, header { padding-left: 12px !important; padding-right: 12px !important; } .navbar-brand, .navbar .navbar-brand { flex: 0 0 34px !important; width: 34px !important; font-size: 0 !important; } .mgmt-brand-icon { width: 32px; height: 32px; flex-basis: 32px; } .mgmt-brand-text { display: none; } .hls-manager-nav-btn { flex-basis: 34px !important; width: 34px !important; min-width: 34px !important; height: 34px !important; } button[title="Settings"] { height: 34px !important; padding: 0 10px !important; font-size: 12px !important; } }'
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
  var DONE = 'data-lp-ok';

  function injectFooter() {
    if (document.getElementById('mgmt-footer')) return;
    var footer = document.createElement('footer');
    footer.id = 'mgmt-footer';
    footer.className = 'mgmt-footer';
    footer.innerHTML = '<a href="https://github.com/Fajri2R/srtla-receiver" target="_blank" rel="noopener">Fajri2R/srtla-receiver</a> &nbsp;&middot;&nbsp; Management UI';
    document.body.appendChild(footer);
  }

  function enhanceNavbarBrand() {
    document.querySelectorAll('.navbar-brand:not([data-mgmt-brand])').forEach(function (brand) {
      brand.dataset.mgmtBrand = '1';
      brand.classList.add('mgmt-brand');
      brand.setAttribute('aria-label', 'SRT Live Server Management');
      brand.innerHTML = '<span class="mgmt-brand-icon" aria-hidden="true"><i class="bi bi-play-fill"></i></span><span class="mgmt-brand-text">SRT Live <span>Management</span></span>';
    });
  }

  function injectHlsManagerButton() {
    document.querySelectorAll('button[title="Settings"]').forEach(function (settingsBtn) {
      settingsBtn.setAttribute('aria-label', 'Settings');
      if (!settingsBtn.querySelector('.mgmt-settings-label')) {
        var label = document.createElement('span');
        label.className = 'mgmt-settings-label';
        label.textContent = 'Settings';
        settingsBtn.appendChild(label);
      }

      if (settingsBtn.dataset.hlsManagerTarget) return;
      settingsBtn.dataset.hlsManagerTarget = '1';
      var link = document.createElement('a');
      link.className = 'btn btn-sm hls-manager-nav-btn';
      link.href = HLS_MANAGER_URL;
      link.target = '_blank';
      link.rel = 'noopener';
      link.title = 'Open HLS Manager';
      link.setAttribute('aria-label', 'Open HLS Manager');
      link.innerHTML = '<i class="bi bi-activity" aria-hidden="true"></i><span>HLS Manager</span>';
      settingsBtn.insertAdjacentElement('beforebegin', link);
    });
  }

  function injectButtons() {
    injectFooter();
    enhanceNavbarBrand();
    injectHlsManagerButton();
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
