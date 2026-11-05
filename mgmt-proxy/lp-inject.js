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
  /* ── Brand identity (runtime-configurable) ───────────────────────────
     The repository is public, so nothing here is Ashveil-specific: a
     deployment overrides these from Settings → Brand Identity and the
     values are stored server-side in /brand.json (gitignored). */
  var BRAND_DEFAULTS = {
    name:     'SRT LIVE',
    subtitle: 'Stream Management Console',
    logo:     '/brand-mark.svg'
  };
  var BRAND = {
    name:     BRAND_DEFAULTS.name,
    subtitle: BRAND_DEFAULTS.subtitle,
    logo:     BRAND_DEFAULTS.logo
  };

  function sanitizeBrand(input) {
    var src = (input && typeof input === 'object') ? input : {};
    function txt(v, max, fallback) {
      if (typeof v !== 'string') return fallback;
      var clean = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
      return clean || fallback;
    }
    function logo(v) {
      if (typeof v !== 'string') return BRAND_DEFAULTS.logo;
      var s = v.trim();
      if (!s || s.length > 700000) return BRAND_DEFAULTS.logo;
      if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(s)) return s;
      if (/^https?:\/\/[^\s"'<>\\]+$/i.test(s)) return s;
      if (/^\/(?!\/)[^\s"'<>\\]*$/.test(s)) return s;
      return BRAND_DEFAULTS.logo;
    }
    return { name: txt(src.name, 28, BRAND_DEFAULTS.name),
             subtitle: txt(src.subtitle, 48, BRAND_DEFAULTS.subtitle),
             logo: logo(src.logo) };
  }

  function loadBrandFromCache() {
    try {
      var raw = localStorage.getItem('sls-brand-config');
      if (raw) BRAND = sanitizeBrand(JSON.parse(raw));
    } catch (e) {}
  }

  function cacheBrand() {
    try { localStorage.setItem('sls-brand-config', JSON.stringify(BRAND)); } catch (e) {}
  }

  // Paint the header from BRAND; safe to call repeatedly (React re-renders).
  function paintBrand() {
    document.title = BRAND.name + ' \u00b7 ' + BRAND.subtitle;
    var img = document.querySelector('.mgmt-brand-icon img');
    if (img) {
      if (img.getAttribute('src') !== BRAND.logo) img.setAttribute('src', BRAND.logo);
      var invertible = BRAND.logo === BRAND_DEFAULTS.logo || BRAND.logo === '/ashveil-veil.png';
      if (invertible) img.removeAttribute('data-brand-custom');
      else img.setAttribute('data-brand-custom', '1');
      img.setAttribute('alt', BRAND.name);
      img.onerror = function () {
        if (img.getAttribute('src') !== BRAND_DEFAULTS.logo) {
          img.setAttribute('src', BRAND_DEFAULTS.logo);
        }
      };
    }
    var nameEl = document.querySelector('.mgmt-brand-text');
    if (nameEl) {
      var subEl = nameEl.querySelector('.mgmt-brand-sub');
      var nameNode = nameEl.firstChild;
      if (!nameNode || nameNode.nodeType !== 3) {
        nameNode = document.createTextNode(BRAND.name);
        nameEl.insertBefore(nameNode, subEl || nameEl.firstChild);
      } else if (nameNode.nodeValue.trim() !== BRAND.name) {
        nameNode.nodeValue = BRAND.name;
      }
      if (subEl && subEl.textContent !== BRAND.subtitle) subEl.textContent = BRAND.subtitle;
    }
  }

  function fetchBrand() {
    return fetch('/api/brand', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        BRAND = sanitizeBrand(d);
        cacheBrand();
        paintBrand();
      })
      .catch(function () {});
  }

  loadBrandFromCache();
  fetchBrand();




  /* ── HLS.js (lazy load) ──────────────────────────────────────────── */
  var hlsScript = document.createElement('script');
  hlsScript.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
  document.head.appendChild(hlsScript);

  /* ── Styles ──────────────────────────────────────────────────────────
     All presentation lives in /ashveil-sls.css (Ashveil design system),
     injected into <head> by nginx so it paints before first render. */


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
        var textNode = badge.querySelector('span');
        var newText = activeCount > 0 ? ('Publishers: ' + activeCount + ' active') : 'No active stream';
        // React occasionally replaces the injected navbar children while the
        // health request is in flight. Re-apply the visible state every poll,
        // not only when the count changes, so a fresh badge never remains on
        // its "Checking status…" placeholder.
        if (activeCount > 0) badge.classList.remove('error');
        else badge.classList.add('error');
        if (textNode && textNode.textContent !== newText) textNode.textContent = newText;
        lastLiveStatus = statusKey;
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
      brand.setAttribute('aria-label', BRAND.name + ' ' + BRAND.subtitle);
      brand.innerHTML = '<span class="mgmt-brand-icon" aria-hidden="true">'
        + '<img src="" alt="" width="44" height="20" decoding="async">'
        + '</span>'
        + '<span class="mgmt-brand-text"><em class="mgmt-brand-sub"></em></span>';
    });
    paintBrand();
  }

  function applyTheme(t, save) {
    document.documentElement.setAttribute('data-theme', t);
    var theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.content = t === 'light' ? '#f4f6f1' : '#2b2d2c';
    var svgIcon = document.querySelector('link[rel="icon"][type="image/svg+xml"]');
    if (svgIcon) svgIcon.href = '/favicon-' + t + '.svg?v=20261105c';
    var btn = document.getElementById('mgmt-theme-btn');
    if (btn) btn.setAttribute('aria-label', t === 'light' ? 'Aktifkan mode gelap' : 'Aktifkan mode terang');
    if (save) { try { localStorage.setItem('ashveil-theme', t); } catch (_) {} }
  }

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('ashveil-theme'); } catch (_) {}
    applyTheme(saved === 'light' ? 'light' : 'dark', false);
  }
  initTheme();

  // Give the tab the Ashveil identity as well: the vendor bundle ships a
  // generic/emoji title and no favicon. Declares the same canonical set as
  // the Control Hub (one SVG, one ICO, one 32px PNG, one touch icon),
  // byte-identical artwork, cache-busted together.
  function applyBrandIdentity() {
    paintBrand();
    if (!document.querySelector('link[data-ashveil-icon]')) {
      [['icon', '/favicon.svg', 'image/svg+xml', null],
       ['icon', '/favicon-32.png', 'image/png', '32x32'],
       ['shortcut icon', '/favicon.ico', null, null],
       ['apple-touch-icon', '/apple-touch-icon.png', 'image/png', '180x180']].forEach(function (spec) {
        var link = document.createElement('link');
        link.rel = spec[0];
        link.href = spec[1] + '?v=20261105c';
        if (spec[2]) link.type = spec[2];
        if (spec[3]) link.setAttribute('sizes', spec[3]);
        link.setAttribute('data-ashveil-icon', '1');
        document.head.appendChild(link);
      });
    }
    // The vendor bundle ships theme-color #0a0e27; patch that exact node
    // instead of appending a second meta, otherwise the first one wins.
    var theme = document.querySelector('meta[name="theme-color"]');
    if (!theme) {
      theme = document.createElement('meta');
      theme.name = 'theme-color';
      document.head.appendChild(theme);
    }
    applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark', false);
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

      // 1. Theme toggle (dark / light), mirrors the Control Hub control
      var themeBtn = document.createElement('button');
      themeBtn.className = 'mgmt-nav-btn mgmt-theme-btn';
      themeBtn.id = 'mgmt-theme-btn';
      themeBtn.type = 'button';
      themeBtn.setAttribute('aria-label', 'Aktifkan mode terang');
      themeBtn.setAttribute('data-tooltip', 'Ganti dark/light mode');
      themeBtn.innerHTML = '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20.4 15.4A8.5 8.5 0 0 1 8.6 3.6 8.5 8.5 0 1 0 20.4 15.4Z"/></svg>'
        + '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>';
      themeBtn.addEventListener('click', function () {
        var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        applyTheme(next, true);
      });

      // 2. SRT Monitor Button
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
      container.appendChild(themeBtn);
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
    enhanceSettingsModal();
    applyBrandIdentity();
    enhanceNavbarBrand();
    injectNavTools();
    enhanceStreamUrlModal();
    // The navbar badge is created here, after the initial updateLiveStatus()
    // call at load time — prime it as soon as it exists.
    if (document.getElementById('mgmt-live-status')) updateLiveStatus();
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

  /* ── Settings → Brand Identity panel ───────────────────────────────────
     The repo is public, so a deployment personalizes its dashboard here
     instead of forking the bundle. Values persist in /brand.json on the
     server (gitignored); writes reuse the SLS API key. */
  var brandUploadData = null;
  var brandPanelState = 'idle'; // idle | saving | saved | error

  // localStorage only holds the key after the vendor's own Save button runs, so
  // also read the value the user just typed into the Settings form.
  function getApiKeyFromModal() {
    var modal = document.querySelector('.modal.show, .modal.in');
    if (!modal) return '';
    var inputs = modal.querySelectorAll('input[type="password"], input[type="text"]');
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      if (inp.closest('[data-lp-brand-panel]')) continue;
      var label = (inp.getAttribute('placeholder') || '') + ' ' + (inp.name || '') + ' ' + (inp.id || '');
      var wrapper = inp.closest('.mb-3, .form-group, .settings-field, label');
      if (wrapper) label += ' ' + (wrapper.textContent || '');
      if (/api[\s_-]?key/i.test(label) && String(inp.value || '').trim()) return String(inp.value).trim();
    }
    return '';
  }

  function getApiKey() {
    try {
      return getApiKeyFromModal()
        || localStorage.getItem('srt-api-key')
        || localStorage.getItem('apiKey')
        || localStorage.getItem('api_key')
        || '';
    } catch (e) { return ''; }
  }

  function brandSetMsg(panel, state, text) {
    brandPanelState = state;
    var note = panel.querySelector('.lp-brand-msg');
    if (note) {
      note.textContent = text || '';
      note.setAttribute('data-state', state);
    }
  }

  function buildBrandPanel(body) {
    var wrap = document.createElement('div');
    wrap.className = 'lp-brand-panel';
    wrap.setAttribute('data-lp-brand-panel', '1');
    wrap.innerHTML =
      '<div class="lp-brand-head">'
      + '<span class="lp-brand-title">Identitas Brand</span>'
      + '<span class="lp-brand-kicker">logo &amp; label dashboard</span>'
      + '</div>'
      + '<div class="lp-brand-grid">'
      +   '<label class="lp-brand-field"><span>Nama Brand</span>'
      +     '<input class="lp-brand-input" data-brand-field="name" type="text" maxlength="28" autocomplete="off" spellcheck="false">'
      +   '</label>'
      +   '<label class="lp-brand-field"><span>Subjudul</span>'
      +     '<input class="lp-brand-input" data-brand-field="subtitle" type="text" maxlength="48" autocomplete="off" spellcheck="false">'
      +   '</label>'
      +   '<label class="lp-brand-field"><span>Logo \u2014 URL / path</span>'
      +     '<input class="lp-brand-input" data-brand-field="logo" type="text" autocomplete="off" spellcheck="false" placeholder="/logo.png atau https://\u2026">'
      +   '</label>'
      +   '<label class="lp-brand-field"><span>Unggah Logo</span>'
      +     '<input class="lp-brand-file" data-brand-field="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml">'
      +     '<em class="lp-brand-hint">PNG/JPG/WebP/SVG, maks 300\u00a0KB. Tersimpan di server, tidak masuk repo.</em>'
      +   '</label>'
      + '</div>'
      + '<div class="lp-brand-actions">'
      +   '<span class="lp-brand-msg" data-state="idle"></span>'
      +   '<button type="button" class="lp-brand-btn lp-brand-reset">Reset ke Default</button>'
      +   '<button type="button" class="lp-brand-btn lp-brand-save">Simpan Brand</button>'
      + '</div>'
      + '<div class="lp-brand-preview">'
      +   '<span class="mgmt-brand-icon" aria-hidden="true"><img data-brand-preview alt=""></span>'
      +   '<span class="lp-brand-preview-text"><strong data-brand-preview-name></strong><em data-brand-preview-sub></em></span>'
      + '</div>';

    wrap.querySelectorAll('.lp-brand-input').forEach(function (inp) {
      inp.addEventListener('input', function () {
        wrap.dataset.brandDirty = '1';
        syncBrandPreview(wrap);
      });
    });

    var file = wrap.querySelector('[data-brand-field="file"]');
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      if (f.size > 300 * 1024) {
        file.value = '';
        brandUploadData = null;
        brandSetMsg(wrap, 'error', 'File terlalu besar (maks 300 KB).');
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        brandUploadData = String(reader.result || '');
        wrap.dataset.brandDirty = '1';
        var logoInput = wrap.querySelector('[data-brand-field="logo"]');
        logoInput.value = '';
        brandSetMsg(wrap, 'idle', 'Logo terunggah: ' + f.name + ' \u2014 klik Simpan Brand.');
        syncBrandPreview(wrap);
      };
      reader.readAsDataURL(f);
    });

    wrap.querySelector('.lp-brand-reset').addEventListener('click', function () {
      brandUploadData = null;
      wrap.dataset.brandDirty = '1';
      wrap.querySelector('[data-brand-field="name"]').value = BRAND_DEFAULTS.name;
      wrap.querySelector('[data-brand-field="subtitle"]').value = BRAND_DEFAULTS.subtitle;
      wrap.querySelector('[data-brand-field="logo"]').value = BRAND_DEFAULTS.logo;
      var fileEl = wrap.querySelector('[data-brand-field="file"]');
      if (fileEl) fileEl.value = '';
      brandSetMsg(wrap, 'idle', 'Nilai direset ke default \u2014 klik Simpan Brand untuk menerapkan.');
      syncBrandPreview(wrap);
    });

    wrap.querySelector('.lp-brand-save').addEventListener('click', function () {
      var payload = {
        name: wrap.querySelector('[data-brand-field="name"]').value,
        subtitle: wrap.querySelector('[data-brand-field="subtitle"]').value,
        logo: brandUploadData || wrap.querySelector('[data-brand-field="logo"]').value
      };
      var key = getApiKey();
      if (!key) {
        brandSetMsg(wrap, 'error', 'API key SLS belum tersimpan di browser ini.');
        return;
      }
      brandSetMsg(wrap, 'saving', 'Menyimpan\u2026');
      fetch('/api/brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify(payload)
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
        .then(function (res) {
          if (!res.ok) {
            brandSetMsg(wrap, 'error', 'Gagal menyimpan (' + ((res.d && res.d.error) || ('HTTP ' + res.status)) + ').');
            return;
          }
          BRAND = sanitizeBrand(res.d);
          brandUploadData = null;
          cacheBrand();
          paintBrand();
          brandSetMsg(wrap, 'saved', 'Tersimpan. Header dan judul tab diperbarui.');
          fillBrandPanel(wrap);  // also clears the dirty flag
        })
        .catch(function () { brandSetMsg(wrap, 'error', 'Gagal menyimpan \u2014 cek koneksi.'); });
    });

    // Live preview mirrors the fields as they are typed.
    var previewImg = wrap.querySelector('[data-brand-preview]');
    previewImg.onerror = function () { previewImg.style.display = 'none'; };
    previewImg.onload = function () { previewImg.style.display = ''; };
    return wrap;
  }

  function syncBrandPreview(wrap) {
    var name = wrap.querySelector('[data-brand-field="name"]').value || BRAND_DEFAULTS.name;
    var sub = wrap.querySelector('[data-brand-field="subtitle"]').value || BRAND_DEFAULTS.subtitle;
    var logo = brandUploadData || wrap.querySelector('[data-brand-field="logo"]').value || BRAND_DEFAULTS.logo;
    wrap.querySelector('[data-brand-preview]').src = logo;
    wrap.querySelector('[data-brand-preview-name]').textContent = name;
    wrap.querySelector('[data-brand-preview-sub]').textContent = sub;
  }

  function fillBrandPanel(wrap) {
    wrap.querySelector('[data-brand-field="name"]').value = BRAND.name;
    wrap.querySelector('[data-brand-field="subtitle"]').value = BRAND.subtitle;
    wrap.querySelector('[data-brand-field="logo"]').value = BRAND.logo;
    wrap.dataset.brandRendered = BRAND.name + '\u0000' + BRAND.subtitle + '\u0000' + BRAND.logo;
    wrap.dataset.brandDirty = '0';
    syncBrandPreview(wrap);
  }

  /**
   * The Settings modal is re-scanned on a 1s poll, so repainting inputs blindly
   * would erase whatever the user is typing. Only adopt server values when the
   * panel is untouched and the config actually changed.
   */
  function shouldRefillPanel(opts) {
    var o = opts || {};
    if (o.dirty || o.focused) return false;
    return o.rendered !== o.server;
  }

  function brandSnapshot() {
    return BRAND.name + '\u0000' + BRAND.subtitle + '\u0000' + BRAND.logo;
  }

  function syncBrandPanel(wrap) {
    var active = document.activeElement;
    var focused = !!(active && wrap.contains(active));
    var dirty = wrap.dataset.brandDirty === '1';
    var rendered = wrap.dataset.brandRendered || '';
    if (shouldRefillPanel({ dirty: dirty, focused: focused, rendered: rendered, server: brandSnapshot() })) {
      fillBrandPanel(wrap);
      return;
    }
    syncBrandPreview(wrap);
  }

  // Injected into the vendor Settings modal whenever React re-renders it.
  function enhanceSettingsModal() {
    var modal = document.querySelector('.modal.show, .modal.in, .modal');
    if (!modal) return;
    var title = modal.querySelector('.modal-title');
    if (!title || !/^\s*Settings\s*$/i.test(title.textContent || '')) return;
    var body = modal.querySelector('.modal-body');
    if (!body) return;
    var existing = body.querySelector('[data-lp-brand-panel]');
    if (existing) { syncBrandPanel(existing); return; }
    var wrap = buildBrandPanel(body);
    fillBrandPanel(wrap);
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
    updateLiveStatus();
    // React regenerates the URL fields during polling; keep the selected
    // valid UDP host and same-origin stats URL after that re-render.
    if (!document.hidden) {
      enhanceStreamUrlModal();
      enhanceSettingsModal();
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
