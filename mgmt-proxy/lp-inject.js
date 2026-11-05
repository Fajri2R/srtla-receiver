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
    if (!document.hidden) enhanceStreamUrlModal();
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
