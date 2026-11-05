import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HistoryStore } from './history-store.js';

function newStore(dir, opts = {}) {
  return new HistoryStore({ dir, offlineGapMs: 30_000, flushIntervalMs: 3600_000, ...opts });
}

function sample(at, rtt, recvBitrate, extra = {}) {
  return { at, rtt, recvBitrate, droppedPackets: 0, ...extra };
}

test('aggregates 1s samples into 1-minute buckets and flushes them to disk', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hist-'));
  const store = newStore(dir);
  const minute = Date.UTC(2026, 10, 5, 8, 4, 0);
  for (let i = 0; i < 30; i++) store.record('live_a', sample(minute + i * 1000, 0.7 + i * 0.01, 2_800_000));
  await store.flush();

  const series = await store.readSeries('live_a', minute, minute + 60_000, ['rtt', 'recvBitrate']);
  assert.equal(series.length, 1);
  const bucket = series[0];
  assert.equal(bucket.t, minute);
  assert.equal(bucket.n, 30);
  assert.equal(bucket.m.rtt.avg, 0.845);
  assert.equal(bucket.m.rtt.min, 0.7);
  assert.equal(bucket.m.rtt.max, 0.99);
  assert.ok(bucket.m.rtt.p95 >= 0.98 && bucket.m.rtt.p95 <= 0.99);
  assert.equal(bucket.m.recvBitrate.max, 2_800_000);
  rmSync(dir, { recursive: true, force: true });
});

test('records a session with start, end, and quality summary once the stream goes away', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hist-'));
  const store = newStore(dir, { offlineGapMs: 5_000 });
  const start = Date.UTC(2026, 10, 5, 9, 0, 0);
  store.record('live_b', sample(start, 10, 1_000_000));
  store.record('live_b', sample(start + 1_000, 40, 1_100_000));
  store.record('live_b', sample(start + 2_000, 90, 900_000));
  await store.markOffline('live_b', start + 4_000);

  const sessions = await store.readSessions('live_b');
  assert.equal(sessions.length, 1);
  const s = sessions[0];
  assert.equal(s.stream, 'live_b');
  assert.equal(s.start, start);
  assert.equal(s.end, start + 4_000);
  assert.equal(s.samples, 3);
  assert.equal(s.summary.rtt.avg, (10 + 40 + 90) / 3);
  assert.equal(s.summary.rtt.max, 90);
  assert.equal(s.summary.recvBitrate.avg, (1_000_000 + 1_100_000 + 900_000) / 3);
  rmSync(dir, { recursive: true, force: true });
});

test('interval flush only persists completed minutes, never partial duplicates', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hist-'));
  const store = newStore(dir);
  const minute = Date.UTC(2026, 10, 5, 12, 0, 0);
  for (let i = 0; i < 20; i++) store.record('live_h', sample(minute + i * 1000, 1, 5));

  // A mid-minute interval flush must not write the in-progress bucket…
  await store.flush(false);
  assert.equal((await store.readSeries('live_h', minute, minute + 60_000, ['rtt'])).length, 0);

  // …and the completed minute must land exactly once with all 60 samples.
  for (let i = 20; i < 60; i++) store.record('live_h', sample(minute + i * 1000, 1, 5));
  store.record('live_h', sample(minute + 60_000, 2, 6)); // rollover to the next minute
  await store.flush(false);
  const rows = await store.readSeries('live_h', minute, minute + 60_000, ['rtt']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].n, 60);
  assert.equal(rows[0].m.rtt.avg, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('a long gap opens a new session instead of continuing the old one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hist-'));
  const store = newStore(dir, { offlineGapMs: 30_000 });
  const t1 = Date.UTC(2026, 10, 5, 9, 0, 0);
  store.record('live_c', sample(t1, 5, 1_000_000));
  const t2 = Date.UTC(2026, 10, 5, 11, 0, 0); // 2h later
  store.record('live_c', sample(t2, 6, 1_000_000));
  await store.markOffline('live_c', t2 + 1_000);

  const sessions = await store.readSessions('live_c');
  assert.equal(sessions.length, 2);
  assert.ok(sessions[0].end < sessions[1].start);
  rmSync(dir, { recursive: true, force: true });
});

test('retention pruning removes day files beyond the configured horizon', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hist-'));
  const store = newStore(dir, { retentionDays: 2 });
  const old = Date.UTC(2026, 9, 1, 9, 0, 0);
  const fresh = Date.now();
  store.record('live_d', sample(old, 1, 1));
  store.record('live_d', sample(fresh, 2, 2));
  await store.flush();
  await store.pruneNow();

  const days = Object.keys((await store.readStreams()).find((s) => s.stream === 'live_d').days);
  assert.equal(days.length, 1);
  assert.equal(days[0], new Date(fresh).toISOString().slice(0, 10));

  const config = await store.getConfig();
  assert.equal(config.retentionDays, 2);
  config.retentionDays = 90;
  await store.saveConfig(config);
  assert.equal((await store.getConfig()).retentionDays, 90);
  rmSync(dir, { recursive: true, force: true });
});

test('delete removes a time range and rewrites the session index', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hist-'));
  const store = newStore(dir, { offlineGapMs: 30_000 });
  const d1 = Date.UTC(2026, 10, 1, 9, 0, 0);
  const d2 = Date.UTC(2026, 10, 3, 9, 0, 0);
  store.record('live_e', sample(d1, 1, 1));
  await store.markOffline('live_e', d1 + 2_000);
  store.record('live_e', sample(d2, 2, 2));
  await store.markOffline('live_e', d2 + 2_000);
  await store.flush();

  const removed = await store.deleteRange('live_e', d1 - 1, d1 + 60_000);
  assert.equal(removed.series, 1);
  assert.equal(removed.sessions, 1);
  const sessions = await store.readSessions('live_e');
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].start, d2);
  const series = await store.readSeries('live_e', d1 - 1, d1 + 60_000, ['rtt']);
  assert.equal(series.length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('corrupt lines are skipped instead of failing the whole day file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hist-'));
  const store = newStore(dir);
  const t = Date.UTC(2026, 10, 5, 10, 0, 0);
  store.record('live_f', sample(t, 3, 10));
  await store.flush();
  const day = new Date(t).toISOString().slice(0, 10);
  const file = join(dir, 'live_f', 'agg', `${day}.jsonl`);
  const body = readFileSync(file, 'utf8');
  writeFileSync(file, `${body}{corrupt!!!\n`);
  const series = await store.readSeries('live_f', t, t + 60_000, ['rtt']);
  assert.equal(series.length, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('export returns CSV rows for the requested metric columns', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hist-'));
  const store = newStore(dir);
  const t = Date.UTC(2026, 10, 5, 11, 0, 0);
  store.record('live_g', sample(t, 12.34, 1_234_000));
  await store.flush();
  const csv = await store.exportCsv('live_g', t - 1, t + 120_000);
  assert.match(csv, /^time,n,rtt_avg,rtt_min,rtt_max,rtt_p95,recvBitrate_avg/);
  assert.match(csv, new RegExp(`^${new Date(t).toISOString()},1,`, 'm'));
  rmSync(dir, { recursive: true, force: true });
});
