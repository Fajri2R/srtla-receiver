import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('./i18n.js', import.meta.url), 'utf8');
const dict = JSON.parse(readFileSync(new URL('./i18n.json', import.meta.url), 'utf8'));

test('HLS dictionary ships matching complete id and en key sets', () => {
  assert.deepEqual(Object.keys(dict.id).sort(), Object.keys(dict.en).sort());
  assert.ok(Object.keys(dict.en).length >= 65, `expected at least 65 UI keys, got ${Object.keys(dict.en).length}`);
  for (const lang of ['en', 'id']) {
    for (const [key, value] of Object.entries(dict[lang])) {
      assert.ok(String(value).trim(), `${lang}.${key} is empty`);
    }
  }
});

test('HLS page loads the common language runtime and exposes a language button', () => {
  assert.match(html, /src="\/i18n\.js\?v=[^"]+"/);
  assert.match(html, /id="lang-toggle"/);
  assert.match(runtime, /window\.AshveilI18n/);
  assert.ok(runtime.includes("'ashveil-lang'"), 'runtime must use the shared ashveil-lang storage key');
  assert.match(runtime, /localStorage\.getItem/, 'runtime must read the stored choice');
  assert.match(runtime, /navigator\.language/);
});

test('all HLS static translation hooks resolve', () => {
  const keys = [...html.matchAll(/data-i18n(?:-ph|-title|-tooltip)?="([^"]+)"/g)].map(m => m[1]);
  assert.ok(new Set(keys).size >= 35, `expected broad static coverage, got ${new Set(keys).size}`);
  for (const key of new Set(keys)) {
    assert.ok(dict.en[key], `missing en.${key}`);
    assert.ok(dict.id[key], `missing id.${key}`);
  }
});

test('dynamic HLS card and status text resolves through translation keys', () => {
  for (const key of [
    'status.checking', 'status.offline', 'status.unavailable',
    'status.ready', 'status.active',
    'stream.preview', 'stream.stop', 'stream.monitor', 'stream.copy',
    'stream.unavailable', 'stream.copied',
    'monitor.graph', 'monitor.logs', 'monitor.close', 'empty.noStreams'
  ]) {
    assert.ok(html.includes(`'${key}'`) || html.includes(`"${key}"`), `missing translation hook or call for ${key}`);
  }
});

test('language changes repaint React-style dynamic content without reload', () => {
  assert.match(html, /ashveil:langchange/);
  assert.match(html, /function renderDashboard\(/);
  assert.match(html, /lastDashboardData/, 'last payload must be cached for repaint');
  assert.match(runtime, /CustomEvent\(['"]ashveil:langchange['"]/);
});
