import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
const style = (html.match(/<style[^>]*>[\s\S]*?<\/style>/) || [''])[0];
const script = (html.match(/<script>\s*\/\/ ---- live history[\s\S]*?<\/script>/) || [''])[0];
const markup = (html.match(/<section class="history"[\s\S]*?<\/section>/) || [''])[0];

test('navbar exposes a History toggle', () => {
  const tag = html.match(/<button\b[^>]*\bid="btn-history"[^>]*>/);
  assert.ok(tag, 'missing #btn-history');
  assert.match(tag[0], /nav-action/, 'history toggle must use the shared navbar chip style');
  assert.match(tag[0], /data-tooltip=/, 'history toggle needs a tooltip');
});

test('history section ships every interaction hook', () => {
  for (const id of ['history', 'hist-list', 'hist-empty', 'hist-stream', 'hist-retention',
    'hist-save-retention', 'hist-refresh', 'hist-delete-all', 'hist-detail',
    'hist-detail-title', 'hist-metric', 'hist-export', 'hist-delete-session',
    'hist-kpis', 'hist-canvas', 'hist-note', 'hist-error', 'hist-key', 'hist-key-save']) {
    assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  }
  assert.match(markup, /role="listbox"/, 'session list needs listbox semantics');
  assert.match(markup, /aria-label="Live history"/, 'section needs an accessible name');
});

test('history view replaces the live panels instead of stacking under them', () => {
  assert.match(style, /body\.history-open[^{]*\.title[^{]*\{[^}]*display:\s*none/, 'redundant live Metrics title must be hidden');
  assert.match(style, /body\.history-open[^{]*#stats[^{]*\{[^}]*display:\s*none/);
  assert.match(style, /body\.history-open[^{]*#charts[^{]*\{[^}]*display:\s*none/);
  assert.match(style, /body\.history-open \.history\s*\{[^}]*display:\s*block/);
});

test('quality score and incident timeline have stable DOM hooks', () => {
  for (const id of ['hist-quality', 'hist-quality-score', 'hist-quality-grade',
    'hist-quality-health', 'hist-incidents', 'hist-incidents-empty',
    'hist-quality-export', 'hist-thresholds', 'hist-threshold-list']) {
    assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  }
  assert.match(markup, /aria-live="polite"/, 'quality result should announce updates accessibly');
});

test('quality export links to the CSV analysis and thresholds are spelled out', () => {
  assert.ok(script.includes("format=csv"), 'quality export must request format=csv');
  assert.match(script, /qualityExportEl\.href/, 'export anchor href must be updated per session');
  assert.match(script, /q\.thresholds/, 'thresholds from the API must render');
  assert.match(script, /rttWarnMs/, 'threshold keys must be read, not hardcoded');
  assert.match(script, /hist-threshold-list/, 'threshold output element must be wired');
});

test('history styles use Ashveil tokens, never literal colors' , () => {
  const block = style.slice(style.indexOf('LIVE HISTORY'));
  assert.ok(block.length > 200, 'history CSS block missing');
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(block.replace(/rgba\([^)]*\)/g, '')),
    'history CSS must not hardcode hex colors');
  for (const token of ['--bg-surface', '--border-subtle', '--text-primary', '--faint']) {
    assert.ok(block.includes(`var(${token}`), `history CSS should use ${token}`);
  }
  assert.match(block, /@media \(max-width: 900px\)/, 'history layout needs a mobile breakpoint');
});

test('session list is built with textContent, never raw innerHTML from API data', () => {
  assert.ok(script.length > 500, 'live history script block missing');
  assert.match(script, /textContent\s*=/, 'must write API text through textContent');
  assert.ok(!/innerHTML\s*=\s*[^'"]*\+\s*(s|row|item)\./i.test(script),
    'session/stream names must not be concatenated into innerHTML');
});

test('history UI talks to the documented endpoints and keeps the key local', () => {
  for (const route of ['/api/history/config', '/api/history/streams', '/api/history/sessions',
    '/api/history/series', '/api/history/export', '/api/history?']) {
    assert.ok(script.includes(route), `history UI never calls ${route}`);
  }
  assert.match(script, /localStorage\.(get|set)Item\(/, 'API key must persist in localStorage');
  assert.match(script, /Authorization: `Bearer \$\{/, 'mutations must send a Bearer token');
  assert.match(script, /confirm\(/, 'destructive actions must ask for confirmation');
});

test('quality analysis is fetched for the exact selected session range', () => {
  assert.ok(script.includes('/api/history/quality'), 'quality endpoint must be called');
  assert.match(script, /async function loadQuality/);
  assert.match(script, /encodeURIComponent\(current\.stream\)/);
  assert.match(script, /q\.incidents/, 'the incidents array from the API must drive the timeline');
  assert.match(script, /incident\.detail/, 'incident detail must be rendered');
  assert.ok(!/innerHTML\s*=/.test(script), 'no innerHTML anywhere in the history script');
});

test('deleting a session keeps the range editable and refreshes after success' , () => {
  const fn = script.slice(script.indexOf('async function deleteRange'));
  assert.match(fn, /method: 'DELETE'/);
  assert.match(fn, /401|Unauthorized|API key/);
  assert.ok(/await loadSessions\(\)/.test(fn), 'list must reload after a delete');
  assert.match(fn, /encodeURIComponent/, 'stream ids must be URL-encoded');
});

test('canvas is explicitly cleared even when the selected metric has zero rows', () => {
  const fn = script.slice(script.indexOf('function drawHist()'));
  // clearRect must execute BEFORE rows.length check / early-return
  const clearPos = fn.indexOf('clearRect');
  const checkPos = fn.indexOf('if (!rows.length)');
  assert.ok(clearPos > 0, 'drawHist must call clearRect');
  assert.match(fn, /c\.clearRect\(0,\s*0,\s*w,\s*h\)/, 'full canvas must be cleared');
  assert.match(fn, /if \(!rows\.length\) return;/, 'drawHist should exit cleanly after clear when no rows');
  assert.ok(clearPos < fn.indexOf('if (!rows.length) return'), 'clear must precede the no-rows exit so stale pixels are wiped');
});

test('KPI tiles collapse to two columns on small screens', () => {
  assert.match(style, /@media \(max-width: 480px\)[\s\S]*?\.hist-kpis\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
});

test('coarse-pointer history controls expose at least 44px touch targets', () => {
  assert.match(style, /@media \(hover: none\) and \(pointer: coarse\)[\s\S]*?\.hist-actions \.action[\s\S]*?min-height:\s*44px/);
  assert.match(style, /@media \(hover: none\) and \(pointer: coarse\)[\s\S]*?\.hist-field select[\s\S]*?min-height:\s*44px/);
});

test('series fetches are aligned to whole minutes for stable buckets', () => {
  assert.match(script, /60000/, 'history chart should reason in minute buckets');
  assert.match(script, /min|max/, 'history chart must show spread, not only averages');
});
