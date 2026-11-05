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

test('header wraps before the extra History and metric controls overflow it', () => {
  // The History toggle added a fourth nav chip; at ~900px the single-row
  // header runs ~43px past the viewport. The wrap breakpoint must sit above
  // that, so the smallest full-width header (four chips + status) always fits.
  const m = html.match(/@media\(max-width:\s*(\d+)px\)\s*\{\s*\.header-inner/);
  assert.ok(m, 'header wrap media query must exist');
  assert.ok(Number(m[1]) >= 1000, `wrap breakpoint ${m[1]}px is below the overflow point`);
});
