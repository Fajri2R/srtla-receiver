import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
const server = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const store = readFileSync(new URL('./history-store.js', import.meta.url), 'utf8');

test('live tiles expose every network metric the payload provides', () => {
  const block = html.slice(html.indexOf('const summaryDefs = ['), html.indexOf('const defs ='));
  for (const key of ['recvBitrate', 'throughput', 'rtt', 'droppedRate', 'recvBuffer', 'latency']) {
    assert.ok(block.includes(`key: '${key}'`) || block.includes(`key: "${key}"`), `${key} tile missing`);
  }
});

test('charts cover throughput, RTT, drop rate and receive buffer', () => {
  const defs = html.slice(html.indexOf('const chartKeys ='), html.indexOf('function fmt'));
  for (const key of ['recvBitrate', 'throughput', 'rtt', 'droppedRate', 'recvBuffer']) {
    assert.ok(defs.includes(`'${key}'`), `${key} must be charted`);
  }
});

test('drop rate renders as a per-second count, not the cumulative total', () => {
  assert.match(html, /key: 'droppedRate',[\s\S]{0,100}fmt: 'count'/, 'drop rate needs a numeric format');
  assert.match(html, /per second|drops\/s/i, 'the tile must state the unit');
});

test('live status reacts to the drop rate instead of the lifetime counter', () => {
  const load = html.slice(html.indexOf('async function load()'), html.indexOf('window.addEventListener(\'resize\''));
  assert.match(load, /droppedRate/, 'status must read the derived rate');
  assert.ok(!/drops\s*>\s*50/.test(load), 'cumulative totals must not drive severity');
});

test('the server derives counters from the previous poll point', () => {
  assert.match(server, /import\s*\{[^}]*deriveCounters[^}]*\}\s*from\s*"\.\/telemetry\.js"/);
  assert.match(server, /deriveCounters\(entry\.latest,\s*point\)/);
  assert.match(server, /Object\.assign\(point,\s*deriveCounters/);
});

test('the derived rate is persisted so history shows the same signal', () => {
  assert.match(store, /'droppedRate'/, 'droppedRate must be a persisted metric');
});

test('tablet header collapses chip labels instead of wrapping to a second row', () => {
  // The History toggle added a fourth nav chip, so a full-label bar overflows
  // below ~1120px. Instead of growing into a second row (which made SRT 109px
  // tall where SLS/HLS stayed 60px), labels collapse to icons and the bar keeps
  // the shared 60px single-row shell.
  const m = /@media\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)@media/.exec(html);
  assert.ok(m, 'tablet breakpoint must exist');
  assert.ok(Number(m[1]) >= 1000, `collapse breakpoint ${m[1]}px is below the overflow point`);
  const inner = /\.header-inner\s*\{([^}]*)\}/.exec(m[2])?.[1] ?? '';
  assert.match(inner, /flex-wrap:\s*nowrap/, 'bar must stay on one row');
  assert.match(inner, /height:\s*60px/, 'bar keeps the shared 60px shell');
  assert.match(m[2], /\.btn-text[^}]*display:\s*none/, 'chip labels collapse to icons so four chips fit');
});
