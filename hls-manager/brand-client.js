/**
 * Shared brand-identity client for the HLS Manager and SRT Monitor dashboards.
 *
 * Served by the HLS manager at /api/brand/brand.js and included by both pages,
 * so a change made in SLS → Settings → Brand Identity reaches every dashboard
 * without duplicating the sync logic. The repository itself stays neutral: no
 * deployment name or logo is baked into this file.
 */
(function () {
  'use strict';
  if (window.__brandSync) return;
  window.__brandSync = true;

  var API = '/api/brand';
  var REFRESH_MS = 30000;
  var lastJson = '';

  function pick(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) return el;
    }
    return null;
  }

  function resolveLogo(logo) {
    if (!logo) return '';
    if (/^data:image\//i.test(logo) || /^https?:\/\//i.test(logo)) return logo;
    // Root-relative logos live on the SLS host; the API serves those bytes here.
    return '/api/brand/asset?v=' + encodeURIComponent(logo);
  }

  function apply(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    var name = typeof cfg.name === 'string' ? cfg.name : '';
    var subtitle = typeof cfg.subtitle === 'string' ? cfg.subtitle : '';
    var logo = typeof cfg.logo === 'string' ? cfg.logo : '';
    if (!name && !subtitle && !logo) return;

    var img = pick(['.logo-icon img', '.brand-icon img', '.brand img', 'header img']);
    if (img && logo) {
      var src = resolveLogo(logo);
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
      img.setAttribute('alt', name);
      // Shipped repo assets are light-on-transparent (invert in light mode);
      // user-supplied uploads and remote logos keep their own colours.
      var custom = /^data:image\//i.test(logo) || /^https?:\/\//i.test(logo);
      if (custom) img.setAttribute('data-brand-custom', '1');
      else img.removeAttribute('data-brand-custom');
    }

    var nameEl = pick(['.logo-text b', '.brand-text b', '.brand b']);
    if (nameEl && name) nameEl.textContent = name;

    var subEl = pick(['.logo-sub', '.brand-sub']);
    if (subEl && subtitle) subEl.textContent = subtitle;

    var link = img && img.closest('a');
    if (link) link.setAttribute('aria-label', (name + ' ' + subtitle).trim());

    if (name && subtitle) document.title = name + ' \u00b7 ' + subtitle;
    else if (name) document.title = name;

    var appName = document.querySelector('meta[name="application-name"]');
    if (appName && name) appName.setAttribute('content', name);
  }

  function load() {
    fetch(API, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (!cfg) return;
        var json = JSON.stringify(cfg);
        if (json === lastJson) return;
        lastJson = json;
        apply(cfg);
      })
      .catch(function () { /* keep the server-rendered identity */ });
  }

  window.LPApplyBrand = load;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }

  // Follow edits made in SLS without a reload. Poll unconditionally: a hidden
  // tab (or a headless/background window) must not drift out of sync, and the
  // payload is a few dozen bytes once every 30s.
  setInterval(load, REFRESH_MS);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) load();
  });
})();
