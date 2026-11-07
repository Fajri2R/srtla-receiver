/**
 * Ashveil i18n runtime (classic script, no bundler).
 *
 * - Dictionary lives in /i18n.json so both languages are reviewable in one
 *   place and the tests can assert key parity.
 * - Markup carries data-i18n / data-i18n-ph / data-i18n-title hooks.
 * - Code calls AshveilI18n.t('key') for strings produced at runtime.
 * - The choice persists in localStorage and defaults to the browser locale.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'ashveil-lang';
  var dict = null;
  var lang = 'en';
  var ready = null;

  function normalise(value) {
    var base = String(value || '').toLowerCase().split('-')[0];
    return base === 'id' ? 'id' : 'en';
  }

  function stored() {
    try {
      var value = localStorage.getItem(STORAGE_KEY);
      return value === 'id' || value === 'en' ? value : null;
    } catch (_) {
      return null;
    }
  }

  function initialLang() {
    return stored() || normalise(navigator.language || navigator.userLanguage);
  }

  function apply(root) {
    var scope = root || document;
    if (!dict) return;
    var table = dict[lang] || dict.en;
    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (table[key] != null) el.textContent = table[key];
    });
    scope.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-ph');
      if (table[key] != null) el.setAttribute('placeholder', table[key]);
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-aria');
      if (table[key] != null) el.setAttribute('aria-label', table[key]);
    });
    scope.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-title');
      if (table[key] != null) {
        el.setAttribute('title', table[key]);
        el.setAttribute('aria-label', table[key]);
      }
    });
    scope.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      if (table[key] != null) el.innerHTML = table[key];
    });
    scope.querySelectorAll('[data-i18n-tooltip]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-tooltip');
      if (table[key] != null) el.setAttribute('data-tooltip', table[key]);
    });
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('data-lang', lang);
    var toggle = document.getElementById('lang-toggle');
    if (toggle) {
      toggle.textContent = lang === 'id' ? 'ID' : 'EN';
      toggle.setAttribute('aria-label', table['nav.lang'] || 'Switch language');
      toggle.setAttribute('title', table['nav.lang'] || 'Switch language');
    }
  }

  var api = {
    get lang() { return lang; },
    ready: function () { return ready || Promise.resolve(); },
    t: function (key, fallback, vars) {
      var value;
      if (!dict) value = fallback != null ? fallback : key;
      else {
        var table = dict[lang] || dict.en;
        value = table[key] != null ? table[key]
          : (dict.en && dict.en[key] != null ? dict.en[key] : (fallback != null ? fallback : key));
      }
      if (vars) {
        value = String(value).replace(/\{([A-Za-z0-9_]+)\}/g, function (_, name) {
          return vars[name] != null ? String(vars[name]) : '{' + name + '}';
        });
      }
      return value;
    },
    setLang: function (next) {
      if (next !== 'id' && next !== 'en') return false;
      lang = next;
      try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
      apply(document);
      document.dispatchEvent(new CustomEvent('ashveil:langchange', { detail: { lang: lang } }));
      return true;
    },
    toggle: function () { return api.setLang(lang === 'id' ? 'en' : 'id'); },
    apply: apply,
    init: function () {
      if (ready) return ready;
      lang = initialLang();
      ready = fetch('/i18n.json', { cache: 'no-cache' })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (json) {
          if (json && json.en && json.id) dict = json;
          apply(document);
          document.dispatchEvent(new CustomEvent('ashveil:langready', { detail: { lang: lang } }));
        })
        .catch(function () { apply(document); });
      return ready;
    }
  };

  window.AshveilI18n = api;

  function boot() {
    api.init();
    document.addEventListener('click', function (event) {
      var toggle = event.target.closest && event.target.closest('#lang-toggle');
      if (toggle) {
        event.preventDefault();
        api.toggle();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
