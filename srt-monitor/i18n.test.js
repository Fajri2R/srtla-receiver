import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
const server = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const i18nScript = readFileSync(new URL('./public/i18n.js', import.meta.url), 'utf8');

test('the dictionary ships complete id and en tables with identical keys', () => {
  const json = JSON.parse(readFileSync(new URL('./public/i18n.json', import.meta.url), 'utf8'));
  assert.ok(json.id && json.en, 'both languages required');
  const idKeys = Object.keys(json.id).sort();
  const enKeys = Object.keys(json.en).sort();
  assert.deepEqual(idKeys, enKeys, 'id and en must cover exactly the same keys');
  assert.ok(idKeys.length >= 60, `expected a full dictionary, got ${idKeys.length}`);
  // Proper nouns and protocol terms legitimately stay identical.
  const SAME_ON_PURPOSE = new Set([
    'brand.sub', 'nav.stream', 'nav.hls', 'nav.theme', 'nav.history',
    'status.live', 'status.offline', 'metric.rtt', 'history.streamFilter',
    'history.save', 'history.csv', 'history.metricLabel', 'quality.thresholds',
    'quality.incidents', 'quality.incident', 'key.title', 'title.metrics',
  ]);
  let translated = 0;
  for (const [key, value] of Object.entries(json.en)) {
    assert.ok(String(value).trim().length > 0, `en.${key} is empty`);
    assert.ok(String(json.id[key]).trim().length > 0, `id.${key} is empty`);
    if (String(value) !== String(json.id[key])) translated++;
  }
  const ratio = translated / idKeys.length;
  assert.ok(ratio >= 0.85, `only ${(ratio * 100).toFixed(1)}% of keys are actually translated`);
  for (const key of SAME_ON_PURPOSE) {
    assert.equal(typeof json.id[key], 'string', `${key} must exist in id`);
  }
});

test('every data-i18n hook in the page resolves to a dictionary key', () => {
  const json = JSON.parse(readFileSync(new URL('./public/i18n.json', import.meta.url), 'utf8'));
  const used = new Set([
    ...[...html.matchAll(/data-i18n(?:-ph|-title)?="([^"]+)"/g)].map((m) => m[1]),
  ]);
  assert.ok(used.size >= 40, `expected broad i18n coverage, got ${used.size} hooks`);
  assert.ok(new Set([...html.matchAll(/data-i18n-title="([^"]+)"/g)].map(m => m[1])).size >= 6, 'tooltips/aria labels must be translated too');
  for (const key of used) {
    assert.ok(json.en[key], `data-i18n="${key}" missing from en`);
    assert.ok(json.id[key], `data-i18n="${key}" missing from id`);
  }
});

test('the runtime helper loads both tables and persists the choice', () => {
  assert.match(i18nScript, /window\.AshveilI18n/, 'classic script must expose the global');
  assert.match(i18nScript, /localStorage/, 'the language choice must persist');
  assert.match(i18nScript, /data-i18n-title/, 'tooltips must translate too');
  assert.match(i18nScript, /navigator\.language/, 'first visit should follow the browser locale');
  assert.match(html, /i18n\.js"><\/script>/, 'page must load the helper');
});

test('dynamic dashboard strings go through the dictionary, not hardcoded literals', () => {
  const liveScript = html.slice(html.indexOf('<script>', html.indexOf('<title>')), html.indexOf('window.addEventListener(\'resize\''));
  for (const key of ['status.live', 'status.warning', 'status.critical', 'status.disconnecting', 'status.apiError', 'status.disconnected', 'status.unavailable']) {
    assert.ok(html.includes(`'${key}'`), `status strings must switch via ${key}`);
  }
  for (const key of ['chart.show', 'chart.hide', 'chart.fullscreen', 'chart.external', 'chart.waiting']) {
    assert.ok(html.includes(`'${key}'`), `chart actions must switch via ${key}`);
  }
  for (const key of ['hint.hover', 'hint.touch']) {
    assert.ok(html.includes(`'${key}'`), `hint text must switch via ${key}`);
  }
});

test('a back control returns from history to the live panels', () => {
  assert.ok(html.includes('id="hist-back"'), 'history needs a back button');
  assert.match(html, /id="hist-back"[\s\S]{0,400}?<\/button>/, 'back must be a real button');
  assert.match(html, /addEventListener\('click',\s*\(\)\s*=>\s*setOpen\(false\)/, 'back must close the history view');
  assert.match(html, /history\.back/, 'dictionary must carry the back label');
});

test('the server serves the dictionary and the helper', () => {
  assert.match(server, /i18n\.json/, 'static route must serve i18n.json');
  assert.match(server, /i18n\.js/, 'static route must serve i18n.js');
});
