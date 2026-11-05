import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { METRICS } from './history-store.js';

const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const dockerfile = readFileSync(new URL('./Dockerfile', import.meta.url), 'utf8');
const compose = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8');

test('all telemetry fields from the real SLS payload are normalized and persisted', () => {
  for (const metric of ['recvBitrate', 'rtt', 'recvBuffer', 'throughput', 'latency', 'droppedPackets', 'uptime']) {
    assert.ok(METRICS.includes(metric), `${metric} must be persisted`);
  }
  assert.match(source, /recvBuffer:\s*\[[^\]]*"buffer"/);
  assert.match(source, /throughput:\s*\["throughput"/);
  assert.match(source, /latency:\s*\["latency"/);
});

test('polling records present streams and closes their history session after grace expiry', () => {
  assert.match(source, /historyStore\.record\(publisherId, point\)/);
  assert.match(source, /await historyStore\.markOffline\(id/);
});

test('HTTP server mounts history routes before the generic stream routes', () => {
  const historyPos = source.indexOf('handleHistoryRoutes(req, res');
  const streamPos = source.indexOf('url.pathname === "/api/streams"');
  assert.ok(historyPos > 0, 'history route handler must be mounted');
  assert.ok(streamPos > historyPos, 'history routes must be checked first');
});

test('history survives container recreation in a named volume', () => {
  assert.match(dockerfile, /COPY index\.js brand-proxy\.js history-store\.js history-routes\.js/);
  assert.match(compose, /srt-monitor-history:\/data/);
  assert.match(compose, /HISTORY_DIR:\s*"\/data"/);
  assert.match(compose, /^\s{2}srt-monitor-history:\s*$/m);
});

test('server shutdown flushes buckets and closes active sessions', () => {
  assert.match(source, /historyStore\.flush\(\)/);
  assert.match(source, /historyStore\.markOffline/);
  assert.match(source, /SIGTERM/);
});

test('the container image copies every module the server imports', () => {
  const dockerfile = readFileSync(new URL('./Dockerfile', import.meta.url), 'utf8');
  const index = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const imports = [...index.matchAll(/from\s+["']\.\/([\w.-]+\.js)["']/g)].map((m) => m[1]);
  assert.ok(imports.length >= 3, 'expected local module imports in index.js');
  for (const file of imports) {
    assert.ok(dockerfile.includes(file), `Dockerfile must COPY ${file}`);
  }
});

test('the deployed Dockerfile copies every module too, not only the repo copy', () => {
  // The build context is the deployed directory, so a repo-only Dockerfile
  // edit ships an image missing new modules and the container crash-loops
  // with ERR_MODULE_NOT_FOUND. Guard both copies.
  const deployed = '/root/srt-monitor/Dockerfile';
  if (!existsSync(deployed)) return; // not every checkout is a deployment
  const text = readFileSync(deployed, 'utf8');
  const index = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const imports = [...index.matchAll(/from\s+["']\.\/([\w.-]+\.js)["']/g)].map((m) => m[1]);
  for (const file of imports) {
    assert.ok(text.includes(file), `deployed Dockerfile must COPY ${file}`);
  }
});
