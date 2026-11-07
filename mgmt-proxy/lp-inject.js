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

  /* ── Language (shared across Ashveil web apps) ─────────────────────── */
  var I18N = {
    en: {
      'nav.settings': 'Settings',
      'nav.configureSettings': 'Configure Settings',
      'nav.themeLight': 'Switch to light mode',
      'nav.themeDark': 'Switch to dark mode',
      'nav.themeTooltip': 'Toggle dark/light mode',
      'nav.openHls': 'Open HLS Manager',
      'nav.openSrt': 'Open SRT Monitor',
      'nav.langId': 'Switch language to Indonesian',
      'nav.langEn': 'Switch language to English',
      'status.checking': 'Checking status…',
      'status.active': 'Publishers: {count} active',
      'status.none': 'No active stream',
      'status.unavailable': 'Status unavailable',
      'vendor.welcome': 'Welcome to SRT Live Server Management',
      'vendor.setup': 'Please configure your API key to get started.',
      'vendor.settings': 'Settings',
      'vendor.serverUrl': 'Server URL',
      'vendor.apiKey': 'API Key',
      'vendor.enterApiKey': 'Enter your API key',
      'vendor.advanced': 'Advanced Mode',
      'vendor.advancedHelp': 'Enable manual editing of Publisher and Player IDs',
      'vendor.manageIntro': 'Manage your SRT publishers and monitor their status',
      'vendor.serverHelp': 'The server URL is configured at build time or via runtime configuration.',
      'vendor.apiHelp': 'Your SRT Live Server API key for authentication',
      'vendor.apiKeyHelp': 'To get your API key, check the server console when starting the SRT Live Server. The default admin API key will be displayed there.',
      'vendor.advancedEnabled': 'Advanced Mode enabled:',
      'vendor.loading': 'Loading...',
      'vendor.noStats': 'No statistics available',
      'vendor.noStreams': 'No streams configured',
      'vendor.addFirst': 'Add your first stream to get started',
      'vendor.playerIds': 'Player IDs:',
      'vendor.tip': 'Tip:',
      'vendor.copyTip': 'Click on any URL field to select all text for easy copying.',
      'vendor.nextUpdate': 'Next update in {seconds} seconds',
      'vendor.addPlayerTo': 'Add Player to {name}',
      'vendor.generateNew': 'Generate new {name}',
      'vendor.advancedGate': 'Enable Advanced Mode in settings to edit',
      'vendor.cancel': 'Cancel',
      'vendor.save': 'Save',
      'vendor.saved': 'Settings saved successfully!',
      'vendor.publisher': 'Publisher',
      'vendor.publisherLabel': 'Publisher:',
      'vendor.publishers': 'Publishers',
      'vendor.player': 'Player',
      'vendor.playerId': 'Player ID',
      'vendor.streamUrls': 'Stream URLs',
      'vendor.addPlayer': 'Add Player',
      'vendor.delete': 'Delete',
      'vendor.deletePlayer': 'Delete Player ID',
      'vendor.close': 'Close',
      'vendor.copy': 'Copy',
      'vendor.copyClipboard': 'Copy to clipboard',
      'vendor.bitrate': 'Bitrate',
      'vendor.uptime': 'Uptime',
      'vendor.srtPublisher': 'SRT Publisher',
      'vendor.srtlaPublisher': 'SRTLA Publisher',
      'preview.live': 'Live',
      'preview.close': 'Close',
      'preview.connecting': 'Connecting…',
      'preview.escClose': 'ESC to close',
      'preview.retrying': 'Stream preparing… retrying in {seconds}s',
      'preview.unavailable': '⚠️ Stream unavailable — check the HLS transcoder.',
      'preview.unsupported': 'HLS is not supported in this browser.',
      'host.label': 'Host',
      'host.note': 'The domain uses a DNS-only record directly to the VPS. Choose IP to bypass DNS.',
      'brand.title': 'Brand Identity',
      'brand.kicker': 'dashboard logo & label',
      'brand.name': 'Brand Name',
      'brand.subtitle': 'Subtitle',
      'brand.logoUrl': 'Logo — URL / path',
      'brand.logoPlaceholder': '/logo.png or https://…',
      'brand.upload': 'Upload Logo',
      'brand.chooseFile': 'Choose file',
      'brand.noFile': 'No file chosen',
      'brand.uploadHint': 'PNG/JPG/WebP/SVG, max 300 KB. Stored on the server, not in the repository.',
      'brand.reset': 'Reset to Default',
      'brand.save': 'Save Brand',
      'brand.fileLarge': 'File is too large (max 300 KB).',
      'brand.uploaded': 'Logo uploaded: {name} — click Save Brand.',
      'brand.resetHint': 'Values reset to defaults — click Save Brand to apply.',
      'brand.apiMissing': 'The SLS API key is not saved in this browser.',
      'brand.saving': 'Saving…',
      'brand.saved': 'Saved. The header and tab title were updated.',
      'brand.saveFailed': 'Failed to save ({reason}).',
      'brand.connectionFailed': 'Failed to save — check the connection.',
      'toast.apiUpdated': 'API Key updated successfully',
      'toast.apiSyncFailed': 'Failed to sync API Key with backend',
      'toast.apiSyncError': 'Error syncing API Key: {reason}'
    },
    id: {
      'nav.settings': 'Pengaturan',
      'nav.configureSettings': 'Atur Pengaturan',
      'nav.themeLight': 'Aktifkan mode terang',
      'nav.themeDark': 'Aktifkan mode gelap',
      'nav.themeTooltip': 'Ganti mode gelap/terang',
      'nav.openHls': 'Buka HLS Manager',
      'nav.openSrt': 'Buka SRT Monitor',
      'nav.langId': 'Ganti bahasa ke Indonesia',
      'nav.langEn': 'Ganti bahasa ke Inggris',
      'status.checking': 'Memeriksa status…',
      'status.active': 'Publisher: {count} aktif',
      'status.none': 'Tidak ada stream aktif',
      'status.unavailable': 'Status tidak tersedia',
      'vendor.welcome': 'Selamat datang di Manajemen SRT Live Server',
      'vendor.setup': 'Atur API key untuk memulai.',
      'vendor.settings': 'Pengaturan',
      'vendor.serverUrl': 'URL Server',
      'vendor.apiKey': 'API Key',
      'vendor.enterApiKey': 'Masukkan API key',
      'vendor.advanced': 'Mode Lanjutan',
      'vendor.advancedHelp': 'Izinkan pengeditan manual ID Publisher dan Player',
      'vendor.manageIntro': 'Kelola publisher SRT dan pantau statusnya',
      'vendor.serverHelp': 'URL server diatur saat build atau melalui konfigurasi runtime.',
      'vendor.apiHelp': 'API key SRT Live Server Anda untuk autentikasi',
      'vendor.apiKeyHelp': 'Untuk mendapatkan API key, periksa konsol server saat menjalankan SRT Live Server. API key admin default akan ditampilkan di sana.',
      'vendor.advancedEnabled': 'Mode Lanjutan aktif:',
      'vendor.loading': 'Memuat…',
      'vendor.noStats': 'Statistik belum tersedia',
      'vendor.noStreams': 'Belum ada stream terkonfigurasi',
      'vendor.addFirst': 'Tambahkan stream pertama untuk memulai',
      'vendor.playerIds': 'ID Player:',
      'vendor.tip': 'Tip:',
      'vendor.copyTip': 'Klik kolom URL mana pun untuk memilih seluruh teks agar mudah disalin.',
      'vendor.nextUpdate': 'Pembaruan berikutnya dalam {seconds} detik',
      'vendor.addPlayerTo': 'Tambah Player ke {name}',
      'vendor.generateNew': 'Buat {name} baru',
      'vendor.advancedGate': 'Aktifkan Mode Lanjutan di pengaturan untuk mengedit',
      'vendor.cancel': 'Batal',
      'vendor.save': 'Simpan',
      'vendor.saved': 'Pengaturan berhasil disimpan!',
      'vendor.publisher': 'Publisher',
      'vendor.publisherLabel': 'Publisher:',
      'vendor.publishers': 'Publisher',
      'vendor.player': 'Player',
      'vendor.playerId': 'ID Player',
      'vendor.streamUrls': 'URL Stream',
      'vendor.addPlayer': 'Tambah Player',
      'vendor.delete': 'Hapus',
      'vendor.deletePlayer': 'Hapus ID Player',
      'vendor.close': 'Tutup',
      'vendor.copy': 'Salin',
      'vendor.copyClipboard': 'Salin ke papan klip',
      'vendor.bitrate': 'Bitrate',
      'vendor.uptime': 'Durasi Aktif',
      'vendor.srtPublisher': 'Publisher SRT',
      'vendor.srtlaPublisher': 'Publisher SRTLA',
      'preview.live': 'Siaran Langsung',
      'preview.close': 'Tutup',
      'preview.connecting': 'Menghubungkan…',
      'preview.escClose': 'ESC untuk menutup',
      'preview.retrying': 'Menyiapkan stream… mencoba lagi dalam {seconds} dtk',
      'preview.unavailable': '⚠️ Stream tidak tersedia — periksa transcoder HLS.',
      'preview.unsupported': 'HLS tidak didukung oleh browser ini.',
      'host.label': 'Host',
      'host.note': 'Domain memakai record DNS-only langsung ke VPS. Pilih IP untuk melewati DNS.',
      'brand.title': 'Identitas Brand',
      'brand.kicker': 'logo & label dashboard',
      'brand.name': 'Nama Brand',
      'brand.subtitle': 'Subjudul',
      'brand.logoUrl': 'Logo — URL / path',
      'brand.logoPlaceholder': '/logo.png atau https://…',
      'brand.upload': 'Unggah Logo',
      'brand.chooseFile': 'Pilih file',
      'brand.noFile': 'Belum ada file',
      'brand.uploadHint': 'PNG/JPG/WebP/SVG, maks 300 KB. Tersimpan di server, tidak masuk repo.',
      'brand.reset': 'Reset ke Default',
      'brand.save': 'Simpan Brand',
      'brand.fileLarge': 'File terlalu besar (maks 300 KB).',
      'brand.uploaded': 'Logo terunggah: {name} — klik Simpan Brand.',
      'brand.resetHint': 'Nilai direset ke default — klik Simpan Brand untuk menerapkan.',
      'brand.apiMissing': 'API key SLS belum tersimpan di browser ini.',
      'brand.saving': 'Menyimpan…',
      'brand.saved': 'Tersimpan. Header dan judul tab diperbarui.',
      'brand.saveFailed': 'Gagal menyimpan ({reason}).',
      'brand.connectionFailed': 'Gagal menyimpan — cek koneksi.',
      'toast.apiUpdated': 'API Key berhasil diperbarui',
      'toast.apiSyncFailed': 'Gagal menyinkronkan API Key dengan backend',
      'toast.apiSyncError': 'Kesalahan sinkronisasi API Key: {reason}'
    }
  };
  var VENDOR_TEXT_KEYS = {
    'Welcome to SRT Live Server Management': 'vendor.welcome',
    'Please configure your API key to get started.': 'vendor.setup',
    'Configure Settings': 'nav.configureSettings',
    'Settings': 'vendor.settings',
    'Server URL': 'vendor.serverUrl',
    'API Key': 'vendor.apiKey',
    'Enter your API key': 'vendor.enterApiKey',
    'Advanced Mode': 'vendor.advanced',
    'Enable manual editing of Publisher and Player IDs': 'vendor.advancedHelp',
    'Manage your SRT publishers and monitor their status': 'vendor.manageIntro',
    'The server URL is configured at build time or via runtime configuration.': 'vendor.serverHelp',
    'Your SRT Live Server API key for authentication': 'vendor.apiHelp',
    'To get your API key, check the server console when starting the SRT Live Server. The default admin API key will be displayed there.': 'vendor.apiKeyHelp',
    'Advanced Mode enabled:': 'vendor.advancedEnabled',
    'Loading...': 'vendor.loading',
    'No statistics available': 'vendor.noStats',
    'No streams configured': 'vendor.noStreams',
    'Add your first stream to get started': 'vendor.addFirst',
    'Player IDs:': 'vendor.playerIds',
    'Tip:': 'vendor.tip',
    'Click on any URL field to select all text for easy copying.': 'vendor.copyTip',
    'Cancel': 'vendor.cancel',
    'Save': 'vendor.save',
    'Settings saved successfully!': 'vendor.saved',
    'Publisher': 'vendor.publisher',
    'Publisher:': 'vendor.publisherLabel',
    'Publishers': 'vendor.publishers',
    'Player': 'vendor.player',
    'Player ID': 'vendor.playerId',
    'Stream URLs': 'vendor.streamUrls',
    'Add Player': 'vendor.addPlayer',
    'Delete': 'vendor.delete',
    'Delete Player ID': 'vendor.deletePlayer',
    'Close': 'vendor.close',
    'Copy': 'vendor.copy',
    'Copy to clipboard': 'vendor.copyClipboard',
    'Bitrate': 'vendor.bitrate',
    'Uptime': 'vendor.uptime',
    'SRT Publisher': 'vendor.srtPublisher',
    'SRTLA Publisher': 'vendor.srtlaPublisher'
  };
  var VENDOR_PATTERNS = [
    { re: /^Next update in (\d+) seconds?$/, key: 'vendor.nextUpdate' },
    { re: /^Add Player to (.+)$/, key: 'vendor.addPlayerTo' },
    { re: /^Generate new (.+)$/, key: 'vendor.generateNew' },
    { re: /^Enable Advanced Mode in settings to edit$/, key: 'vendor.advancedGate' }
  ];
  var lang = (function () {
    try {
      var saved = localStorage.getItem('ashveil-lang');
      if (saved === 'id' || saved === 'en') return saved;
    } catch (_) {}
    return ("" + (navigator.language || navigator.userLanguage || "")).toLowerCase().slice(0, 2) === "id" ? "id" : "en";
  })();
  var translatingUi = false;

  function t(key, vars) {
    var value = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
    Object.keys(vars || {}).forEach(function (name) {
      value = value.replace(new RegExp('\\{' + name + '\\}', 'g'), String(vars[name]));
    });
    return value;
  }

  function applyTranslationHooks(root) {
    var scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      var value = t(el.getAttribute('data-i18n'));
      if (el.textContent !== value) el.textContent = value;
    });
    [['data-i18n-placeholder', 'placeholder'], ['data-i18n-aria', 'aria-label'],
     ['data-i18n-tooltip', 'data-tooltip'], ['data-i18n-title', 'title']].forEach(function (spec) {
      scope.querySelectorAll('[' + spec[0] + ']').forEach(function (el) {
        var value = t(el.getAttribute(spec[0]));
        if (el.getAttribute(spec[1]) !== value) el.setAttribute(spec[1], value);
      });
    });
  }

  function vendorKeyFor(value) {
    if (!value) return null;
    var trimmed = String(value).trim();
    if (VENDOR_TEXT_KEYS[trimmed]) return VENDOR_TEXT_KEYS[trimmed];
    for (var i = 0; i < VENDOR_PATTERNS.length; i++) {
      if (VENDOR_PATTERNS[i].re.test(trimmed)) return VENDOR_PATTERNS[i].key;
    }
    var found = null;
    Object.keys(I18N.en).some(function (key) {
      if (I18N.en[key] === trimmed || I18N.id[key] === trimmed) { found = key; return true; }
      return false;
    });
    return found;
  }

  function renderPatternText(key, text) {
    if (key === 'vendor.nextUpdate') {
      var m = text.match(/(\d+)/);
      return m ? t(key, { seconds: m[1] }) : text;
    }
    if (key === 'vendor.addPlayerTo') {
      var m2 = text.match(/Add Player to (.+)/i) || text.match(/Tambah Player ke (.+)/i);
      return m2 ? t(key, { name: m2[1] }) : text;
    }
    if (key === 'vendor.generateNew') {
      var m3 = text.match(/Generate new (.+)/i) || text.match(/Buat (.+) baru/i);
      return m3 ? t(key, { name: m3[1] }) : text;
    }
    return t(key);
  }

  function isInjectedUi(el) {
    return !!(el && el.closest && el.closest('.navbar, nav, header, #lp-ov, .mgmt-toast, [data-lp-brand-panel], .publisher-card-publisher-name, code, kbd, samp, .font-monospace'));
  }

  function translateVendorUi(root) {
    var scope = root || document.body;
    if (!scope) return;
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    var nodes = [];
    var node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(function (textNode) {
      var parent = textNode.parentElement;
      if (!parent || /^(SCRIPT|STYLE|TEXTAREA|OPTION)$/i.test(parent.tagName) || parent.closest('[data-i18n]') || isInjectedUi(parent)) return;
      var raw = textNode.nodeValue || '';
      var trimmed = raw.trim();
      if (!trimmed) return;
      var key = textNode.__ashveilI18nKey || vendorKeyFor(trimmed);
      if (!key) return;
      textNode.__ashveilI18nKey = key;
      parent.setAttribute('data-ashveil-i18n', key);
      var value = renderPatternText(key, trimmed);
      var next = raw.replace(trimmed, value);
      if (raw !== next) textNode.nodeValue = next;
    });
    ['title', 'placeholder', 'aria-label'].forEach(function (attr) {
      scope.querySelectorAll('[' + attr + ']').forEach(function (el) {
        if (el.hasAttribute('data-i18n-' + (attr === 'aria-label' ? 'aria' : attr)) || isInjectedUi(el)) return;
        var marker = 'data-ashveil-i18n-' + attr;
        var key = el.getAttribute(marker) || vendorKeyFor(el.getAttribute(attr));
        if (!key) return;
        el.setAttribute(marker, key);
        var value = renderPatternText(key, el.getAttribute(attr) || '');
        if (el.getAttribute(attr) !== value) el.setAttribute(attr, value);
      });
    });
  }

  // Repaints the live-status chip from its last known state so a language
  // switch never resets it to the "checking" placeholder. Fresh badges start
  // in the uninitialized state below until the first health poll arrives.
  function paintLiveStatusText() {
    var badge = document.getElementById('mgmt-live-status');
    if (!badge) return;
    var span = badge.querySelector('span');
    if (!span) return;
    var state = lastLiveStatus || '';
    var text;
    if (state === 'error') text = t('status.unavailable');
    else if (/^ok:(\d+)$/.test(state)) {
      var count = parseInt(state.split(':')[1], 10) || 0;
      text = t(count > 0 ? 'status.active' : 'status.none', { count: count });
    } else {
      text = t('status.checking');
    }
    if (span.textContent !== text) span.textContent = text;
  }

  function translateUi() {
    if (translatingUi) return;
    translatingUi = true;
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('data-lang', lang);
    applyTranslationHooks(document);
    translateVendorUi(document.body);
    paintLiveStatusText();
    var languageBtn = document.getElementById('mgmt-lang-btn');
    if (languageBtn) {
      languageBtn.textContent = lang === 'id' ? 'ID' : 'EN';
      languageBtn.setAttribute('aria-label', t(lang === 'id' ? 'nav.langEn' : 'nav.langId'));
      languageBtn.setAttribute('data-tooltip', t(lang === 'id' ? 'nav.langEn' : 'nav.langId'));
    }
    applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark', false);
    translatingUi = false;
  }

  function setLanguage(next, save) {
    lang = next === 'id' ? 'id' : 'en';
    if (save) {
      try { localStorage.setItem('ashveil-lang', lang); } catch (_) {}
    }
    translateUi();
    try { document.dispatchEvent(new CustomEvent('ashveil:langchange', { detail: { lang: lang } })); } catch (_) {}
  }

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
      + '<div id="lp-badge"><span id="lp-badge-dot"></span><span id="lp-badge-txt" data-i18n="preview.live">Live</span></div>'
      + '<div id="lp-nm">—</div>'
      + '<button id="lp-xb" type="button" data-i18n-aria="preview.close"><span aria-hidden="true">&#x2715;</span> <span data-i18n="preview.close">Close</span></button>'
    + '</div>'
    + '<div id="lp-vid-wrap">'
      + '<video id="lp-vid" controls muted playsinline></video>'
      + '<div id="lp-overlay-msg">'
        + '<div id="lp-spinner"></div>'
        + '<span id="lp-msg-txt" data-i18n="preview.connecting">Connecting&hellip;</span>'
      + '</div>'
    + '</div>'
    + '<div id="lp-ft">'
      + '<span id="lp-url"></span>'
      + '<span id="lp-hint" data-i18n="preview.escClose">ESC to close</span>'
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
    setMsg(t('preview.connecting'), true);
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
              setMsg(t('preview.retrying', { seconds: delay / 1000 }), true);
              setTimeout(function () {
                if (ov.classList.contains('on')) openPreview(pub, retryAttempt + 1);
              }, delay);
              return;
            }
            setMsg(t('preview.unavailable'), false);
         }
       });
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = url;
        v.play().catch(function () {});
        v.addEventListener('canplay', function () { setMsg(null, false); }, { once: true });
      } else {
        setMsg(t('preview.unsupported'), false);
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
    setMsg(t('preview.connecting'), true); // reset for next open
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
        // React occasionally replaces the injected navbar children while the
        // health request is in flight. Re-apply the visible state every poll,
        // not only when the count changes, so a fresh badge never remains on
        // its "Checking status…" placeholder.
        if (activeCount > 0) badge.classList.remove('error');
        else badge.classList.add('error');
        if (textNode) {
          var newText = activeCount > 0
            ? t('status.active', { count: activeCount })
            : t('status.none');
          if (textNode.textContent !== newText) textNode.textContent = newText;
        }
        lastLiveStatus = statusKey;
      })
      .catch(function() {
        if (lastLiveStatus !== 'error') {
          lastLiveStatus = 'error';
          badge.classList.add('error');
          var errSpan = badge.querySelector('span');
          if (errSpan) errSpan.textContent = t('status.unavailable');
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

  function applyTheme(mode, save) {
    document.documentElement.setAttribute('data-theme', mode);
    var theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.content = mode === 'light' ? '#f4f6f1' : '#2b2d2c';
    var svgIcon = document.querySelector('link[rel="icon"][type="image/svg+xml"]');
    if (svgIcon) svgIcon.href = '/favicon-' + mode + '.svg?v=20261105c';
    var btn = document.getElementById('mgmt-theme-btn');
    if (btn) {
      var label = t(mode === 'light' ? 'nav.themeDark' : 'nav.themeLight');
      if (btn.getAttribute('aria-label') !== label) btn.setAttribute('aria-label', label);
    }
    if (save) { try { localStorage.setItem('ashveil-theme', mode); } catch (_) {} }
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

  function buildLanguageButton() {
    var langBtn = document.createElement('button');
    langBtn.className = 'mgmt-nav-btn mgmt-lang-btn';
    langBtn.id = 'mgmt-lang-btn';
    langBtn.type = 'button';
    langBtn.setAttribute('lang', lang);
    langBtn.textContent = lang === 'id' ? 'ID' : 'EN';
    langBtn.setAttribute('aria-label', t(lang === 'id' ? 'nav.langEn' : 'nav.langId'));
    langBtn.setAttribute('data-tooltip', t(lang === 'id' ? 'nav.langEn' : 'nav.langId'));
    langBtn.addEventListener('click', function () {
      setLanguage(lang === 'id' ? 'en' : 'id', true);
    });
    return langBtn;
  }

  function injectNavTools() {
    document.querySelectorAll('button[data-mgmt-settings], button[title="Settings"], button[title="Configure Settings"]').forEach(function (settingsBtn) {
      settingsBtn.dataset.mgmtSettings = '1';
      settingsBtn.setAttribute('data-i18n-aria', 'nav.configureSettings');
      settingsBtn.setAttribute('data-i18n-tooltip', 'nav.configureSettings');
      settingsBtn.removeAttribute('title');
      if (!settingsBtn.dataset.lpA11yHook) {
        settingsBtn.dataset.lpA11yHook = '1';
        settingsBtn.addEventListener('click', function () {
          // React mounts the modal after the click handler returns; run the
          // enhancer on the next frames so accessible names and initial focus
          // are present from the moment the dialog becomes usable.
          lastFocused = settingsBtn;
          [0, 80, 220].forEach(function (delay) {
            setTimeout(enhanceSettingsModal, delay);
          });
        });
      }
      var existingLabel = settingsBtn.querySelector('.mgmt-settings-label');
      if (!existingLabel) {
        var label = document.createElement('span');
        label.className = 'mgmt-settings-label';
        label.setAttribute('data-i18n', 'nav.settings');
        settingsBtn.appendChild(label);
      }

      if (settingsBtn.parentNode.querySelector('.mgmt-nav-tools')) return;

      // 1. Theme toggle (dark / light), mirrors the Control Hub control
      var themeBtn = document.createElement('button');
      themeBtn.className = 'mgmt-nav-btn mgmt-theme-btn';
      themeBtn.id = 'mgmt-theme-btn';
      themeBtn.type = 'button';
      themeBtn.setAttribute('data-i18n-aria', 'nav.themeLight');
      themeBtn.setAttribute('data-i18n-tooltip', 'nav.themeTooltip');
      themeBtn.innerHTML = '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20.4 15.4A8.5 8.5 0 0 1 8.6 3.6 8.5 8.5 0 1 0 20.4 15.4Z"/></svg>'
        + '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>';
      themeBtn.addEventListener('click', function () {
        var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        applyTheme(next, true);
      });

      // 2. Language toggle (ID / EN) — always visible, persisted in ashveil-lang
      var langBtn = buildLanguageButton();

      // 2. SRT Monitor Button
      var srtBtn = document.createElement('a');
      srtBtn.className = 'mgmt-nav-btn';
      srtBtn.href = SRT_MONITOR_URL;
      srtBtn.target = '_blank';
      srtBtn.rel = 'noopener';
      srtBtn.setAttribute('data-i18n-tooltip', 'nav.openSrt');
      srtBtn.setAttribute('data-i18n-aria', 'nav.openSrt');
      srtBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg><span class="btn-text" data-i18n="nav.openSrt">SRT Monitor</span>';

      // 2. HLS Manager Button
      var hlsBtn = document.createElement('a');
      hlsBtn.className = 'mgmt-nav-btn';
      hlsBtn.href = HLS_MANAGER_URL;
      hlsBtn.target = '_blank';
      hlsBtn.rel = 'noopener';
      hlsBtn.setAttribute('data-i18n-tooltip', 'nav.openHls');
      hlsBtn.setAttribute('data-i18n-aria', 'nav.openHls');
      hlsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg><span class="btn-text" data-i18n="nav.openHls">HLS Manager</span>';

      // 3. Live Status Badge
      var liveBadge = document.createElement('div');
      liveBadge.className = 'live-status';
      liveBadge.id = 'mgmt-live-status';
      liveBadge.innerHTML = '<i class="dot"></i><span></span>';
      var initSpan = liveBadge.querySelector('span');
      if (initSpan) initSpan.textContent = t('status.checking');

      // Order injected before the Settings button (left to right):
      // Wrap them in a single container to prevent React DOM tracking issues
      var container = document.createElement('div');
      container.className = 'mgmt-nav-tools';
      container.style.display = 'contents';
      container.appendChild(themeBtn);
      container.appendChild(langBtn);
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
      var apikey = arguments.length > 1 ? String(value) : '';
      fetch('/api/apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apikey: apikey })
      })
      .then(function(res) {
        if (res.ok) {
          showToast(t('toast.apiUpdated'), false);
        } else {
          showToast(t('toast.apiSyncFailed'), true);
        }
      })
      .catch(function(err) {
        showToast(t('toast.apiSyncError', { reason: err.message }), true);
      });
    }
  };

  function injectButtons() {
    enhanceSettingsModal();
    applyBrandIdentity();
    enhanceNavbarBrand();
    injectNavTools();
    enhanceStreamUrlModal();
    translateUi();
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
      '<span class="lp-host-label" data-i18n="host.label">Host</span>' +
      '<button type="button" class="lp-host-btn" data-lp-host="domain">' + SRT_DOMAIN + '</button>' +
      '<button type="button" class="lp-host-btn" data-lp-host="ip">' + VPS_IP + '</button>' +
      '<div class="lp-host-note" data-i18n="host.note">Domain memakai record DNS-only langsung ke VPS. Pilih IP bila ingin bypass DNS.</div>';

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
      + '<span class="lp-brand-title" data-i18n="brand.title">Identitas Brand</span>'
      + '<span class="lp-brand-kicker" data-i18n="brand.kicker">logo &amp; label dashboard</span>'
      + '</div>'
      + '<div class="lp-brand-grid">'
      +   '<label class="lp-brand-field"><span data-i18n="brand.name">Nama Brand</span>'
      +     '<input class="lp-brand-input" data-brand-field="name" type="text" maxlength="28" autocomplete="off" spellcheck="false">'
      +   '</label>'
      +   '<label class="lp-brand-field"><span data-i18n="brand.subtitle">Subjudul</span>'
      +     '<input class="lp-brand-input" data-brand-field="subtitle" type="text" maxlength="48" autocomplete="off" spellcheck="false">'
      +   '</label>'
      +   '<label class="lp-brand-field"><span data-i18n="brand.logoUrl">Logo \u2014 URL / path</span>'
      +     '<input class="lp-brand-input" data-brand-field="logo" type="text" autocomplete="off" spellcheck="false" data-i18n-placeholder="brand.logoPlaceholder" placeholder="/logo.png atau https://\u2026">'
      +   '</label>'
      +   '<label class="lp-brand-field"><span data-i18n="brand.upload">Unggah Logo</span>'
      +     '<span class="lp-brand-file-control">'
      +       '<span class="lp-brand-file-button" data-i18n="brand.chooseFile">Pilih file</span>'
      +       '<span class="lp-brand-file-name" data-i18n="brand.noFile">Belum ada file</span>'
      +       '<input class="lp-brand-file" data-brand-field="file" type="file" aria-hidden="true" tabindex="-1" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml">'
      +     '</span>'
      +     '<em class="lp-brand-hint" data-i18n="brand.uploadHint">PNG/JPG/WebP/SVG, maks 300\u00a0KB. Tersimpan di server, tidak masuk repo.</em>'
      +   '</label>'
      + '</div>'
      + '<div class="lp-brand-actions">'
      +   '<span class="lp-brand-msg" data-state="idle"></span>'
      +   '<button type="button" class="lp-brand-btn lp-brand-reset" data-i18n="brand.reset">Reset ke Default</button>'
      +   '<button type="button" class="lp-brand-btn lp-brand-save" data-i18n="brand.save">Simpan Brand</button>'
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
        brandSetMsg(wrap, 'error', t('brand.fileLarge'));
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        brandUploadData = String(reader.result || '');
        wrap.dataset.brandDirty = '1';
        var logoInput = wrap.querySelector('[data-brand-field="logo"]');
        logoInput.value = '';
        var fileName = wrap.querySelector('.lp-brand-file-name');
        if (fileName) {
          fileName.textContent = f.name;
          fileName.classList.add('has-file');
          fileName.removeAttribute('data-i18n');
        }
        brandSetMsg(wrap, 'idle', t('brand.uploaded', { name: f.name }));
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
      var fileName = wrap.querySelector('.lp-brand-file-name');
      if (fileName) {
        fileName.textContent = '';
        fileName.classList.remove('has-file');
        fileName.setAttribute('data-i18n', 'brand.noFile');
      }
      brandSetMsg(wrap, 'idle', t('brand.resetHint'));
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
        brandSetMsg(wrap, 'error', t('brand.apiMissing'));
        return;
      }
      brandSetMsg(wrap, 'saving', t('brand.saving'));
      fetch('/api/brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify(payload)
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
        .then(function (res) {
          if (!res.ok) {
            brandSetMsg(wrap, 'error', t('brand.saveFailed', { reason: (res.d && res.d.error) || ('HTTP ' + res.status) }));
            return;
          }
          BRAND = sanitizeBrand(res.d);
          brandUploadData = null;
          cacheBrand();
          paintBrand();
          brandSetMsg(wrap, 'saved', t('brand.saved'));
          fillBrandPanel(wrap);  // also clears the dirty flag
        })
        .catch(function () { brandSetMsg(wrap, 'error', t('brand.connectionFailed')); });
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
  // Give the vendor settings fields an accessible name: their labels float free
  // with no for/id pair, so screen readers announce "edit text, blank". The
  // aria label is registered as a translation hook so it follows EN/ID.
  function labelSettingsFields() {
    var modal = document.querySelector('.modal.show, .modal.in, .modal');
    if (!modal) return;
    var title = modal.querySelector('.modal-title');
    if (!title) return;
    if (!title.id) title.id = 'lp-modal-title';
    if (!modal.getAttribute('aria-labelledby')) {
      modal.setAttribute('aria-labelledby', title.id);
    }
    if (!modal.getAttribute('aria-modal') && (modal.classList.contains('show') || modal.classList.contains('in'))) {
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('role', 'dialog');
    }
    var inputs = modal.querySelectorAll(['input[type="text"]', 'input[type="password"]',
      'input[type="url"]', 'select'].join(','));
    [].forEach.call(inputs, function (inp) {
      if (inp.closest('[data-lp-brand-panel]')) return;
      var wrap = inp.closest('.mb-3, .form-group, .settings-field, .input-group');
      var label = wrap ? wrap.querySelector('label, .form-label') : null;
      var text = (label ? label.textContent : (inp.getAttribute('placeholder') || inp.name || '')).trim();
      if (!text) return;
      var key = VENDOR_TEXT_KEYS[text];
      if (label && !label.htmlFor) {
        if (!inp.id) inp.id = 'lp-field-' + text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        label.htmlFor = inp.id;
      } else if (!label && !inp.id) {
        // Placeholder-only fields still need a stable id so the label text can
        // be referenced and tested; aria-label alone leaves no DOM association.
        inp.id = 'lp-field-' + text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      }
      if (!inp.getAttribute('aria-label')) {
        inp.setAttribute('aria-label', text);
        if (key) inp.setAttribute('data-i18n-aria', key);
      }
    });
  }

  // Keep keyboard focus inside the open dialog and hand it back to the trigger
  // on close, so a Bootstrap modal actually behaves modal for keyboard users.
  var trappedModal = null;
  var lastFocused = null;
  function trapModalFocus(modal) {
    if (trappedModal === modal) return;
    if (trappedModal) untrapModalFocus();
    trappedModal = modal;
    // Keep the element that opened the modal; React often moves focus into the
    // dialog before this runs, which would restore focus to the dialog itself.
    if (!document.body.contains(lastFocused) || modal.contains(lastFocused)) {
      lastFocused = document.activeElement;
    }
    var focusables = function () {
      return [].filter.call(modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ), function (el) { return !el.disabled && el.offsetParent !== null; });
    };
    var onKeydown = function (e) {
      if (e.key !== 'Tab' && e.keyCode !== 9) return;
      var list = focusables();
      if (!list.length) return;
      var first = list[0], last = list[list.length - 1];
      var active = document.activeElement;
      if (e.shiftKey && (active === first || !modal.contains(active))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (active === last || !modal.contains(active))) {
        e.preventDefault(); first.focus();
      }
    };
    var returnFocus = lastFocused;
    var restored = false;
    var onHide = function () {
      if (restored) return;
      restored = true;
      untrapModalFocus();
      // React/Bootstrap may move focus while unmounting; restore on the next task.
      setTimeout(function () {
        if (returnFocus && document.body.contains(returnFocus)) {
          try { returnFocus.focus(); } catch (err) {}
        }
      }, 0);
    };
    modal.addEventListener('keydown', onKeydown);
    modal.addEventListener('hidden.bs.modal', onHide);
    // Some vendor builds remove the modal without dispatching hidden.bs.modal.
    // Observe class/unmount changes so focus never remains in a detached dialog.
    var lifecycleObserver = new MutationObserver(function () {
      if (!document.body.contains(modal) || (!modal.classList.contains('show') && !modal.classList.contains('in'))) {
        onHide();
      }
    });
    lifecycleObserver.observe(modal.parentNode || document.body, { childList: true });
    modal._lpUntrap = function () {
      lifecycleObserver.disconnect();
      modal.removeEventListener('keydown', onKeydown);
      modal.removeEventListener('hidden.bs.modal', onHide);
    };
    var initial = modal.querySelector('.btn-close, button.close') || focusables()[0];
    if (initial) {
      try { initial.focus(); } catch (err) {}
    }
  }

  function untrapModalFocus() {
    if (trappedModal && trappedModal._lpUntrap) trappedModal._lpUntrap();
    trappedModal = null;
  }

  function enhanceSettingsModal() {
    var modal = document.querySelector('.modal.show, .modal.in, .modal');
    if (!modal) return;
    var title = modal.querySelector('.modal-title');
    var titleKey = title && (title.getAttribute('data-ashveil-i18n') || VENDOR_TEXT_KEYS[(title.textContent || '').trim()] || vendorKeyFor((title.textContent || '').trim()));
    if (!title || titleKey !== 'vendor.settings') return;
    var body = modal.querySelector('.modal-body');
    if (!body) return;
    labelSettingsFields();
    if (modal.classList.contains('show') || modal.classList.contains('in')) {
      trapModalFocus(modal);
    }
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
    injectTimeout = setTimeout(function () { injectButtons(); translateUi(); }, 200);
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
