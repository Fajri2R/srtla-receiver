import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_THRESHOLDS,
  scoreFromBuckets,
} from './quality.js';

/** A clean one-minute bucket: LAN-like rtt, no drops, healthy buffer. */
function cleanBucket(t, over = {}) {
  return {
    t,
    n: 50,
    offline: 0,
    m: {
      rtt: { avg: 1, min: 0.8, max: 1.2, p95: 1.1 },
      recvBitrate: { avg: 2_600_000, min: 2_500_000, max: 2_700_000, p95: 2_650_000 },
      droppedPackets: { avg: 0, min: 0, max: 0, p95: 0 },
      recvBuffer: { avg: 160, min: 150, max: 170, p95: 165 },
      transcoderFps: { avg: 30, min: 29, max: 31, p95: 30 },
      ...(over.m || {}),
    },
    ...(over.o || {}),
  };
}

function minute(start) {
  return (i) => start + i * 60_000;
}

test('a clean session scores 100 with sensible thresholds and no incidents', () => {
  const at = minute(0);
  const out = scoreFromBuckets([cleanBucket(at(0)), cleanBucket(at(1)), cleanBucket(at(2))]);
  assert.equal(out.score, 100);
  assert.equal(out.grade, 'excellent');
  assert.deepEqual(out.incidents, []);
});

test('an empty timeline has no score instead of a misleading 100', () => {
  const out = scoreFromBuckets([]);
  assert.equal(out.score, null);
  assert.equal(out.grade, null);
  assert.deepEqual(out.incidents, []);
});

test('an RTT spike raises an rtt incident and lowers the score', () => {
  const at = minute(0);
  const buckets = [cleanBucket(at(0)), cleanBucket(at(1), {
    m: { rtt: { avg: 150, min: 120, max: 180, p95: 165 } },
  }), cleanBucket(at(2))];
  const out = scoreFromBuckets(buckets);
  assert.ok(out.score < 100, 'score must drop');
  assert.equal(out.incidents.length, 1);
  assert.equal(out.incidents[0].type, 'rtt');
  assert.equal(out.incidents[0].severity, 'warning');
  assert.equal(out.incidents[0].t, at(1));
  assert.ok(out.incidents[0].detail.includes('165'), 'incident detail should quote the measured value');
});

test('severe RTT is classified as critical, not warning', () => {
  const at = minute(0);
  const buckets = [cleanBucket(at(0), {
    m: { rtt: { avg: 320, min: 300, max: 340, p95: 330 } },
  })];
  const { incidents } = scoreFromBuckets(buckets);
  assert.equal(incidents[0].severity, 'critical');
});

test('a packet-drop burst is reported per affected minute', () => {
  const at = minute(0);
  const buckets = [cleanBucket(at(0)), cleanBucket(at(1), {
    m: { droppedPackets: { avg: 30, min: 0, max: 80, p95: 70 } },
  }), cleanBucket(at(2))];
  const { incidents } = scoreFromBuckets(buckets);
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].type, 'drops');
  assert.equal(incidents[0].severity, 'warning');
});

test('severe drops are critical', () => {
  const at = minute(0);
  const buckets = [cleanBucket(at(0), {
    m: { droppedPackets: { avg: 60, min: 10, max: 120, p95: 110 } },
  })];
  const { incidents } = scoreFromBuckets(buckets);
  assert.equal(incidents[0].severity, 'critical');
});

test('receiver buffer bloat raises a buffer incident', () => {
  const at = minute(0);
  const buckets = [cleanBucket(at(0)), cleanBucket(at(1), {
    m: { recvBuffer: { avg: 2_000, min: 1_900, max: 2_100, p95: 2_050 } },
  })];
  const { incidents, score } = scoreFromBuckets(buckets);
  assert.equal(incidents[0].type, 'buffer');
  assert.equal(incidents[0].severity, 'critical');
  assert.ok(score < 100);
});

test('a bitrate collapse against the session baseline raises an incident', () => {
  const at = minute(0);
  const collapsed = (t) => cleanBucket(t, {
    m: { recvBitrate: { avg: 700_000, min: 600_000, max: 800_000, p95: 750_000 } },
  });
  const buckets = [cleanBucket(at(0)), cleanBucket(at(1)), collapsed(at(2)), collapsed(at(3))];
  const { incidents } = scoreFromBuckets(buckets);
  assert.equal(incidents.length, 2);
  assert.equal(incidents[0].type, 'bitrate');
  assert.equal(incidents[0].severity, 'warning');
});

test('a tiny LAN baseline must not be mistaken for a collapse', () => {
  const at = minute(0);
  const tiny = (t) => cleanBucket(t, {
    m: { recvBitrate: { avg: 50_000, min: 40_000, max: 60_000, p95: 55_000 } },
  });
  const buckets = [tiny(at(0)), tiny(at(1)), tiny(at(2))];
  const out = scoreFromBuckets(buckets);
  assert.deepEqual(out.incidents, []);
  assert.equal(out.score, 100);
});

test('grades descend monotonically as damage accumulates', () => {
  const at = minute(0);
  const clean = cleanBucket(at(0));
  const hurt = (t, over) => cleanBucket(t, over);
  const dropBurst = { m: { droppedPackets: { avg: 60, min: 10, max: 120, p95: 110 } } };
  const rttSpike = { m: { rtt: { avg: 320, min: 300, max: 340, p95: 330 } } };
  const bloat = { m: { recvBuffer: { avg: 2_000, min: 1_900, max: 2_100, p95: 2_050 } } };
  const collapse = { m: { recvBitrate: { avg: 700_000, min: 600_000, max: 800_000, p95: 750_000 } } };

  const one = scoreFromBuckets([clean, hurt(at(1), dropBurst), cleanBucket(at(2))]);
  const two = scoreFromBuckets([
    clean, hurt(at(1), dropBurst), cleanBucket(at(2)), hurt(at(3), rttSpike),
  ]);
  const four = scoreFromBuckets([
    clean,
    hurt(at(1), dropBurst),
    hurt(at(2), rttSpike),
    hurt(at(3), bloat),
    hurt(at(4), collapse),
  ]);

  assert.equal(scoreFromBuckets([clean]).grade, 'excellent');
  assert.ok(one.score > two.score, 'second damaged minute must lower the score further');
  assert.ok(two.score > four.score, 'more damaged minutes must lower the score further');
  assert.equal(four.grade, 'bad');
  for (const out of [one, two, four]) {
    assert.ok(out.score >= 0 && out.score <= 100, 'score must stay in range');
    assert.ok(out.healthyMinutes <= out.minutes, 'healthy minutes cannot exceed total');
  }
});

test('minutes with no payload are skipped, not scored against thresholds', () => {
  const at = minute(0);
  const buckets = [cleanBucket(at(0)), { t: at(1), n: 0, m: {} }, cleanBucket(at(2))];
  const out = scoreFromBuckets(buckets);
  assert.equal(out.score, 100);
  assert.deepEqual(out.incidents, []);
});

test('thresholds are overridable per call', () => {
  const at = minute(0);
  const buckets = [cleanBucket(at(0), {
    m: { rtt: { avg: 30, min: 20, max: 40, p95: 35 } },
  })];
  const strict = scoreFromBuckets(buckets, { rttWarnMs: 20, rttBadMs: 50 });
  assert.equal(strict.incidents[0].severity, 'warning');
  const relaxed = scoreFromBuckets(buckets, { rttWarnMs: 50, rttBadMs: 100 });
  assert.deepEqual(relaxed.incidents, []);
  assert.ok(DEFAULT_THRESHOLDS.rttWarnMs > 0);
});
