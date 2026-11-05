import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCounters } from './telemetry.js';

/** Poll points arrive once per second; counters are cumulative monotonic. */
function point(at, droppedPackets, extra = {}) {
  return { at, droppedPackets, ...extra };
}

test('a growing counter yields a positive per-interval delta', () => {
  const out = deriveCounters(point(0, 100), point(1000, 130));
  assert.equal(out.droppedDelta, 30);
  assert.equal(out.droppedRate, 30);
});

test('rate is normalised per second, not per poll', () => {
  const out = deriveCounters(point(0, 0), point(2000, 40));
  assert.equal(out.droppedDelta, 40);
  assert.equal(out.droppedRate, 20, '40 drops over 2 s is 20/s');
});

test('an unchanged counter yields zero, not the cumulative total', () => {
  const out = deriveCounters(point(0, 900), point(1000, 900));
  assert.equal(out.droppedDelta, 0);
  assert.equal(out.droppedRate, 0);
});

test('a counter reset is treated as a reset, never a huge negative or spike', () => {
  const out = deriveCounters(point(0, 500), point(1000, 12));
  assert.equal(out.droppedDelta, 0);
  assert.equal(out.droppedRate, 0);
});

test('the first sample has no baseline so no rate is claimed', () => {
  const out = deriveCounters(null, point(1000, 40));
  assert.equal(out.droppedDelta, null);
  assert.equal(out.droppedRate, null);
});

test('a zero or backwards timestamp cannot produce an infinite rate', () => {
  for (const prevAt of [0, 5000]) {
    const out = deriveCounters(point(prevAt, 10), point(prevAt, 60));
    assert.ok(Number.isFinite(out.droppedRate), 'rate must stay finite');
    assert.ok(out.droppedRate >= 0, 'rate must never be negative');
  }
});

test('missing counters stay null instead of silently becoming zero', () => {
  const out = deriveCounters({ at: 0 }, { at: 1000 });
  assert.equal(out.droppedDelta, null);
  assert.equal(out.droppedRate, null);
});

test('deriveCounters reports counters only, never echoes instantaneous metrics', () => {
  const out = deriveCounters(point(0, 1, { rtt: 5 }), point(1000, 2, { rtt: 7, throughput: 2_000_000 }));
  assert.equal(out.droppedDelta, 1);
  assert.equal(out.rtt, undefined);
  assert.equal(out.throughput, undefined);
});
