import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { get, request } from 'node:http';
import { once } from 'node:events';

import { handleBrandRoutes, DEFAULT_BRAND } from './brand-routes.js';

test('GET /api/brand returns the stored config as no-store JSON', async () => {
  const { createServer } = await import('node:http');
  const dir = mkdtempSync(join(tmpdir(), 'brand-routes-'));
  const brandPath = join(dir, 'brand.json');
  const server = createServer((req, res) => {
    if (handleBrandRoutes(req, res, { brandPath, apiKey: () => 'secret-key' })) return;
    res.writeHead(404); res.end();
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  const body = await new Promise((resolve, reject) => {
    get(`http://127.0.0.1:${port}/api/brand`, res => {
      assert.equal(res.headers['cache-control'], 'no-store');
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
  assert.deepEqual(body, DEFAULT_BRAND);
  server.close();
});

test('POST /api/brand persists branding only with the right Bearer key', async () => {
  const { createServer } = await import('node:http');
  const dir = mkdtempSync(join(tmpdir(), 'brand-routes-'));
  const brandPath = join(dir, 'brand.json');
  const ctx = { brandPath, apiKey: () => 'secret-key' };
  const server = createServer((req, res) => {
    if (handleBrandRoutes(req, res, ctx)) return;
    res.writeHead(404); res.end();
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  const post = (headers, payload) => new Promise((resolve, reject) => {
    const r = request({ host: '127.0.0.1', port, path: '/api/brand', method: 'POST', headers }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    r.on('error', reject);
    r.end(payload);
  });

  const bad = await post({ authorization: 'Bearer nope', 'content-type': 'application/json' }, '{"name":"X"}');
  assert.equal(bad.status, 401);
  assert.equal(existsSync(brandPath), false, 'unauthorized write must not create the file');

  const good = await post({ authorization: 'Bearer secret-key', 'content-type': 'application/json' },
    JSON.stringify({ name: 'Ashveil', subtitle: 'SRT Live Management', logo: '/ashveil-veil.png' }));
  assert.equal(good.status, 200);
  const stored = JSON.parse(readFileSync(brandPath, 'utf8'));
  assert.deepEqual(stored, { name: 'Ashveil', subtitle: 'SRT Live Management', logo: '/ashveil-veil.png' });
  server.close();
});
