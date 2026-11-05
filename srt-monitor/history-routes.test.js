import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HistoryStore } from './history-store.js';
import { handleHistoryRoutes } from './history-routes.js';

function setupServer(store, apiKey = 'secret123') {
  const server = createServer(async (req, res) => {
    if (await handleHistoryRoutes(req, res, { store, apiKey })) return;
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not handled' }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        port,
        close: () => new Promise((r) => server.close(r)),
        url: (path) => `http://127.0.0.1:${port}${path}`,
      });
    });
  });
}

test('GET /api/history/sessions lists recorded sessions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hist-srv-'));
  const store = new HistoryStore({ dir, offlineGapMs: 10_000 });
  const t = Date.UTC(2026, 10, 5, 8, 0, 0);
  store.record('stream1', { at: t, rtt: 5, recvBitrate: 2_000_000 });
  await store.markOffline('stream1', t + 2_000);

  const srv = await setupServer(store);
  try {
    const res = await fetch(srv.url('/api/history/sessions?stream=stream1'));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.sessions.length, 1);
    assert.equal(body.sessions[0].stream, 'stream1');
  } finally {
    await srv.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/history/series returns time-bucketed points', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hist-srv-'));
  const store = new HistoryStore({ dir });
  const t = Date.UTC(2026, 10, 5, 8, 0, 0);
  store.record('stream2', { at: t, rtt: 10, recvBitrate: 1_500_000 });
  await store.flush();

  const srv = await setupServer(store);
  try {
    const res = await fetch(srv.url(`/api/history/series?stream=stream2&from=${t - 1}&to=${t + 60_000}`));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.series.length, 1);
    assert.equal(body.series[0].m.rtt.avg, 10);
  } finally {
    await srv.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('DELETE /api/history requires API key and removes range', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hist-srv-'));
  const store = new HistoryStore({ dir });
  const t = Date.UTC(2026, 10, 5, 8, 0, 0);
  store.record('stream3', { at: t, rtt: 10 });
  await store.markOffline('stream3', t + 1000);
  await store.flush();

  const srv = await setupServer(store, 'my-key');
  try {
    // 1. Unauthenticated DELETE → 401
    const unauth = await fetch(srv.url(`/api/history?stream=stream3&from=${t - 1}&to=${t + 2000}`), { method: 'DELETE' });
    assert.equal(unauth.status, 401);

    // 2. Authenticated DELETE → 200
    const auth = await fetch(srv.url(`/api/history?stream=stream3&from=${t - 1}&to=${t + 2000}`), {
      method: 'DELETE',
      headers: { Authorization: 'Bearer my-key' },
    });
    assert.equal(auth.status, 200);
    const body = await auth.json();
    assert.equal(body.removed.sessions, 1);

    // 3. Confirm gone
    const sessions = await store.readSessions('stream3');
    assert.equal(sessions.length, 0);
  } finally {
    await srv.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET and POST /api/history/config inspect and update retention', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hist-srv-'));
  const store = new HistoryStore({ dir });
  const srv = await setupServer(store, 'my-key');
  try {
    const getRes = await fetch(srv.url('/api/history/config'));
    assert.equal(getRes.status, 200);
    const getBody = await getRes.json();
    assert.equal(getBody.retentionDays, 90);

    const postUnauth = await fetch(srv.url('/api/history/config'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ retentionDays: 30 }),
    });
    assert.equal(postUnauth.status, 401);

    const postAuth = await fetch(srv.url('/api/history/config'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer my-key' },
      body: JSON.stringify({ retentionDays: 45 }),
    });
    assert.equal(postAuth.status, 200);
    assert.equal((await postAuth.json()).retentionDays, 45);
  } finally {
    await srv.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('accepts a getter for the API key (the deployment re-reads it from disk)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hist-srv-'));
  const store = new HistoryStore({ dir });
  const t = Date.UTC(2026, 10, 5, 8, 0, 0);
  store.record('stream5', { at: t, rtt: 1 });
  await store.markOffline('stream5', t + 1000);

  let reads = 0;
  const getter = () => { reads += 1; return 'getter-key'; };
  const srv = await setupServer(store, getter);
  try {
    const res = await fetch(srv.url(`/api/history?stream=stream5&from=${t - 1}&to=${t + 2000}`), {
      method: 'DELETE',
      headers: { Authorization: 'Bearer getter-key' },
    });
    assert.equal(res.status, 200);
    assert.ok(reads > 0, 'the key getter must be consulted on each request');
  } finally {
    await srv.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/history/quality scores a range and lists incidents', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hist-srv-'));
  const store = new HistoryStore({ dir });
  const t = Date.UTC(2026, 10, 5, 9, 0, 0);
  store.record('streamQ', { at: t, rtt: 3, recvBitrate: 2_000_000, droppedPackets: 0 });
  store.record('streamQ', { at: t + 61_000, rtt: 320, recvBitrate: 2_000_000, droppedPackets: 120 });
  await store.flush();

  const srv = await setupServer(store);
  try {
    const res = await fetch(srv.url(`/api/history/quality?stream=streamQ&from=${t - 1}&to=${t + 120_000}`));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(typeof body.score, 'number');
    assert.equal(body.grade, 'bad');
    assert.ok(body.incidents.length >= 2, `expected rtt + drops incidents, got ${JSON.stringify(body.incidents)}`);
    assert.ok(body.incidents.some((i) => i.type === 'rtt' && i.severity === 'critical'));
    assert.ok(body.incidents.some((i) => i.type === 'drops' && i.severity === 'critical'));
    assert.ok(body.thresholds && body.thresholds.rttBadMs > 0, 'thresholds must be exposed for transparency');
  } finally {
    await srv.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/history/quality requires a stream parameter', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hist-srv-'));
  const store = new HistoryStore({ dir });
  const srv = await setupServer(store);
  try {
    const res = await fetch(srv.url('/api/history/quality'));
    assert.equal(res.status, 400);
  } finally {
    await srv.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/history/export serves text/csv attachment', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hist-srv-'));
  const store = new HistoryStore({ dir });
  const t = Date.UTC(2026, 10, 5, 8, 0, 0);
  store.record('stream4', { at: t, rtt: 10, recvBitrate: 2_000_000 });
  await store.flush();

  const srv = await setupServer(store);
  try {
    const res = await fetch(srv.url(`/api/history/export?stream=stream4&from=${t - 1}&to=${t + 60_000}`));
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.match(res.headers.get('content-disposition'), /attachment; filename="stream4-history\.csv"/);
    const body = await res.text();
    assert.match(body, /^time,n,rtt_avg/);
  } finally {
    await srv.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/history/quality?format=csv exports the analysis as a table', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hist-srv-'));
  const store = new HistoryStore({ dir });
  const t = Date.UTC(2026, 10, 5, 10, 0, 0);
  store.record('streamQC', { at: t, rtt: 3, recvBitrate: 2_000_000, droppedPackets: 0 });
  store.record('streamQC', { at: t + 61_000, rtt: 320, recvBitrate: 2_000_000, droppedPackets: 120 });
  await store.flush();

  const srv = await setupServer(store);
  try {
    const res = await fetch(srv.url(`/api/history/quality?stream=streamQC&from=${t - 1}&to=${t + 120_000}&format=csv`));
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.match(res.headers.get('content-disposition'), /attachment; filename="streamQC-quality\.csv"/);
    const body = await res.text();
    assert.match(body, /^metric,value/);
    assert.match(body, /^score,50$/m);
    assert.match(body, /^grade,bad$/m);
    assert.match(body, /^incident_time,type,severity,value,threshold,detail$/m);
    assert.match(body, /rtt,critical/);
    assert.match(body, /drops,critical/);
  } finally {
    await srv.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
