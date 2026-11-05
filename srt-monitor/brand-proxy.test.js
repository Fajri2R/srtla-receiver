import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { get } from 'node:http';
import { once } from 'node:events';

import { handleBrandProxy } from './brand-proxy.js';

function getBody(port, path) {
  return new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port, path }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: data }));
    }).on('error', reject);
  });
}

test('proxies GET /api/brand and /api/brand/asset to the HLS manager', async () => {
  // Upstream = the real hls-manager route handler.
  const { handleBrandRoutes } = await import('../hls-manager/brand-routes.js');
  const { writeBrandConfig } = await import('../hls-manager/brand-config.js');
  const { mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');

  const dir = mkdtempSync(join(tmpdir(), 'brand-proxy-'));
  const brandPath = join(dir, 'brand.json');
  writeBrandConfig(brandPath, { name: 'SHARED BRAND', subtitle: 'Ops', logo: '/brand-mark.svg' });

  const upstream = createServer((req, res) => {
    if (handleBrandRoutes(req, res, { brandPath, assetsDir: join(dir, 'assets'), apiKey: () => 'k' })) return;
    res.writeHead(404); res.end();
  }).listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;

  const proxy = createServer((req, res) => {
    if (handleBrandProxy(req, res, { baseUrl: upstreamUrl })) return;
    res.writeHead(404); res.end();
  }).listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const port = proxy.address().port;

  const cfg = await getBody(port, '/api/brand');
  assert.equal(cfg.status, 200);
  assert.deepEqual(JSON.parse(cfg.body), { name: 'SHARED BRAND', subtitle: 'Ops', logo: '/brand-mark.svg' });

  const asset = await getBody(port, '/api/brand/asset');
  assert.equal(asset.status, 404); // asset file not present in this fixture dir

  proxy.close();
  upstream.close();
});

test('reports 502 when the upstream is unreachable', async () => {
  const proxy = createServer((req, res) => {
    if (handleBrandProxy(req, res, { baseUrl: 'http://127.0.0.1:1' })) return;
    res.writeHead(404); res.end();
  }).listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const res = await getBody(proxy.address().port, '/api/brand');
  assert.equal(res.status, 502);
  proxy.close();
});

test('ignores non-brand paths so the caller can fall through', async () => {
  const handled = handleBrandProxy({ url: '/api/status', headers: {} }, { writeHead() {}, end() {} }, { baseUrl: 'http://127.0.0.1:1' });
  assert.equal(handled, false);
});
