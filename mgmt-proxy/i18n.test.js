import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'lp-inject.js'), 'utf8');
const css = readFileSync(join(here, 'ashveil-sls.css'), 'utf8');

function extractExpression(name, nextMarker) {
  const start = src.indexOf(`var ${name} = `);
  assert.notEqual(start, -1, `${name} must exist`);
  const valueStart = start + `var ${name} = `.length;
  const end = src.indexOf(nextMarker, valueStart);
  assert.notEqual(end, -1, `end marker for ${name} must exist`);
  return new Function(`return (${src.slice(valueStart, end).trim().replace(/;$/, '')})`)();
}

test('injector defines complete matching Indonesian and English dictionaries', () => {
  const dict = extractExpression('I18N', '\n  var VENDOR_TEXT_KEYS');
  assert.deepEqual(Object.keys(dict.id).sort(), Object.keys(dict.en).sort());
  assert.ok(Object.keys(dict.en).length >= 55, `expected broad coverage, got ${Object.keys(dict.en).length}`);
  for (const lang of ['id', 'en']) {
    for (const [key, value] of Object.entries(dict[lang])) {
      assert.ok(String(value).trim(), `${lang}.${key} is empty`);
    }
  }
});

test('language state persists under shared ashveil-lang key and emits a repaint event', () => {
  assert.match(src, /localStorage\.getItem\(['"]ashveil-lang['"]\)/);
  assert.match(src, /localStorage\.setItem\(['"]ashveil-lang['"],\s*lang\)/);
  assert.match(src, /document\.documentElement\.setAttribute\(['"]lang['"],\s*lang\)/);
  assert.match(src, /CustomEvent\(['"]ashveil:langchange['"]/);
});

test('injector exposes an always-visible accessible language toggle', () => {
  assert.match(src, /id\s*=\s*['"]mgmt-lang-btn['"]/);
  assert.match(src, /className\s*=\s*['"][^'"]*mgmt-lang-btn/);
  assert.match(src, /setLanguage\(lang === ['"]id['"] \? ['"]en['"] : ['"]id['"], true\)/);
  assert.ok(/\.mgmt-lang-btn\s*\{[^}]*display\s*:\s*inline-flex/is.test(css), 'language button needs a visible flex treatment');
  assert.ok(!/@media[^{]*\{[^@]*\.mgmt-lang-btn\s*\{[^}]*display\s*:\s*none/is.test(css), 'language button must never be hidden');
});

test('custom injector copy uses translation hooks instead of fixed mixed-language labels', () => {
  for (const key of [
    'preview.live', 'preview.close', 'preview.connecting', 'preview.escClose',
    'nav.settings', 'nav.themeTooltip', 'nav.openHls', 'nav.openSrt',
    'brand.title', 'brand.name', 'brand.subtitle', 'brand.upload',
    'brand.reset', 'brand.save', 'host.note'
  ]) {
    assert.ok(new RegExp(`(?:data-i18n(?:-[a-z]+)?=(?:\\\\?['"])|data-i18n(?:-[a-z]+)?['"],\\s*['"]|t\\(')${key.replace(/\./g, '\\.')}['"]`).test(src), `missing translation hook/call for ${key}`);
  }
});

test('vendor copy translation is exact, idempotent, and re-render safe', () => {
  assert.match(src, /var VENDOR_TEXT_KEYS\s*=\s*\{/);
  assert.match(src, /function translateVendorUi\(/);
  assert.match(src, /data-ashveil-i18n/);
  assert.match(src, /publisher-card-publisher-name/);
  assert.match(src, /new MutationObserver\([\s\S]*translateUi/);
  assert.match(src, /translateUi\(\)/);
  for (const label of ['Welcome to SRT Live Server Management', 'Configure Settings', 'Server URL', 'API Key', 'Advanced Mode', 'Cancel', 'Save']) {
    assert.ok(src.includes(`'${label}'`) || src.includes(`"${label}"`), `missing safe vendor mapping for ${label}`);
  }
});

test('status and runtime feedback are translated through keys with interpolation', () => {
  for (const key of ['status.active', 'status.none', 'status.unavailable', 'preview.retrying', 'preview.unavailable', 'brand.fileLarge', 'brand.saved', 'brand.saveFailed']) {
    assert.ok(src.includes(`t('${key}'`), `runtime message must call t('${key}')`);
  }
  assert.match(src, /\{count\}/);
  assert.match(src, /\{seconds\}/);
});

test('vendor mappings round-trip cleanly through their stable marker keys', () => {
  const dict = extractExpression('I18N', '\n  var VENDOR_TEXT_KEYS');
  const map = extractExpression('VENDOR_TEXT_KEYS', '\n  var VENDOR_PATTERNS');
  for (const [english, key] of Object.entries(map)) {
    assert.equal(dict.en[key], english, `${key} english value must equal its vendor label`);
    assert.ok(dict.id[key], `${key} needs an Indonesian counterpart`);
    // Once translateVendorUi marks a text node, repeated toggles resolve by key,
    // not by the translated text. This is the idempotence/re-render contract.
    assert.equal(dict.en[key], english);
  }
  const patterns = extractExpression('VENDOR_PATTERNS', '\n  var lang = ');
  assert.ok(patterns.length >= 3, 'dynamic vendor copy needs pattern rules');
  for (const rule of patterns) {
    assert.ok(dict.en[rule.key] && dict.id[rule.key], `${rule.key} missing from a dictionary`);
  }
});

test('interpolation replaces every placeholder and leaves no braces behind', () => {
  const dict = extractExpression('I18N', '\n  var VENDOR_TEXT_KEYS');
  const render = (lang, key, vars) => String(dict[lang][key]).replace(/\{(\w+)\}/g, (m, name) => String(vars[name]));
  assert.equal(render('en', 'status.active', { count: 2 }), 'Publishers: 2 active');
  assert.equal(render('id', 'status.active', { count: 2 }), 'Publisher: 2 aktif');
  assert.equal(render('id', 'preview.retrying', { seconds: 5 }), 'Menyiapkan stream… mencoba lagi dalam 5 dtk');
  assert.equal(render('en', 'brand.uploaded', { name: 'logo.svg' }), 'Logo uploaded: logo.svg — click Save Brand.');
  for (const lang of ['en', 'id']) {
    for (const [key, value] of Object.entries(dict[lang])) {
      const names = [...String(value).matchAll(/\{(\w+)\}/g)].map(m => m[1]);
      for (const name of names) {
        assert.ok(['count', 'seconds', 'name', 'reason'].includes(name), `${lang}.${key} uses unsupported placeholder {${name}}`);
      }
      assert.deepEqual(
        names.sort(),
        [...String(dict.en[key]).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(),
        `${key} must use the same placeholders in both languages`,
      );
    }
  }
});

test('custom file upload control never relies on browser-locale native labels', () => {
  assert.match(src, /data-i18n="brand\.chooseFile"/);
  assert.match(src, /data-i18n="brand\.noFile"/);
  assert.match(src, /class="lp-brand-file"[^>]*aria-hidden="true"/);
  assert.match(css, /\.lp-brand-file\s*\{[^}]*opacity\s*:\s*0/is);
});

test('language repaint preserves the last live-status state instead of resetting to checking', () => {
  assert.match(src, /function paintLiveStatusText\(/);
  assert.match(src, /function translateUi\([\s\S]*paintLiveStatusText\(\)/);
  assert.doesNotMatch(src, /<span data-i18n="status\.checking">/);
});

test('nginx bootstrap restores the saved language before first paint', () => {
  const template = readFileSync(join(here, 'default.conf.template'), 'utf8');
  assert.match(template, /ashveil-lang/);
  assert.match(template, /setAttribute\("lang"/);
  assert.match(template, /ashveil-sls\.css\?v=/);
});

test('static assets declare a single MIME type via default_type, never add_header', () => {
  const template = readFileSync(join(here, 'default.conf.template'), 'utf8');
  // add_header Content-Type appends a second header on top of nginx's default
  // text/plain; browsers honour the first one and silently drop the asset
  // (this broke the whole Ashveil skin). default_type replaces it instead.
  assert.doesNotMatch(template, /add_header\s+Content-Type/i, 'add_header Content-Type duplicates the header');
  assert.match(template, /location = \/ashveil-sls\.css\s*\{[^}]*default_type\s+text\/css/i);
  assert.match(template, /location = \/lp-inject\.js\s*\{[^}]*default_type\s+application\/javascript/i);
});

test('responsive language control has compact mobile treatment and no forced header overflow', () => {
  assert.match(css, /@media\s*\(max-width:\s*560px\)/);
  assert.match(css, /\.mgmt-lang-btn/);
  assert.match(css, /\.navbar[^}]*height\s*:\s*auto/is);
  assert.match(css, /\.navbar\s+\.ms-auto[^}]*flex-wrap\s*:\s*wrap/is);
}
);
