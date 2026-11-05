import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { get } from 'node:http';
import { once } from 'node:events';
import { createServer } from 'node:http';

import { handleBrandRoutes } from './brand-routes.js';
import { writeBrandConfig } from './brand-config.js';

function start(ctx) {
  const server = createServer((req, res) => {
    if (handleBrandRoutes(req, res, ctx)) return;
    res.writeHead(404); res.end();
  });
  server.listen(0, '127.0.0.1');
  return once(server, 'listening').then(() => ({ server, port: server.address().port }));
}

function fetchRaw(port, path) {
  return new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port, path }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

function tempBrand(logo) {
  const dir = mkdtempSync(join(tmpdir(), 'brand-asset-'));
  const brandPath = join(dir, 'brand.json');
  const assetsDir = join(dir, 'assets');
  mkdirSync(assetsDir, { recursive: true });
  writeFileSync(join(assetsDir, 'brand-mark.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeBrandConfig(brandPath, { name: 'QA', subtitle: 'QA Sub', logo });
  return { brandPath, assetsDir };
}

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('GET /api/brand/asset decodes an uploaded data URL with its own mime type', async () => {
  const ctx = { ...tempBrand(PNG_1PX), apiKey: () => 'k' };
  const { server, port } = await start(ctx);
  const res = await fetchRaw(port, '/api/brand/asset');
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'image/png');
  assert.ok(res.body.length > 50, 'decoded bytes, not the base64 string');
  server.close();
});

test('GET /api/brand/asset serves a root-relative logo from the assets volume', async () => {
  const ctx = { ...tempBrand('/brand-mark.svg'), apiKey: () => 'k' };
  const { server, port } = await start(ctx);
  const res = await fetchRaw(port, '/api/brand/asset');
  assert.equal(res.status, 200);
  assert.match(String(res.headers['content-type']), /image\/svg\+xml/);
  assert.match(res.body.toString(), /<svg/);
  server.close();
});

test('GET /api/brand/asset redirects to an absolute http(s) logo', async () => {
  const ctx = { ...tempBrand('https://cdn.example.test/logo.webp'), apiKey: () => 'k' };
  const { server, port } = await start(ctx);
  const res = await fetchRaw(port, '/api/brand/asset');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, 'https://cdn.example.test/logo.webp');
  server.close();
});

test('GET /api/brand/asset 404s for a missing file instead of returning HTML', async () => {
  const ctx = { ...tempBrand('/nope.svg'), apiKey: () => 'k' };
  const { server, port } = await start(ctx);
  const res = await fetchRaw(port, '/api/brand/asset');
  assert.equal(res.status, 404);
  assert.match(String(res.headers['content-type']), /application\/json/);
  server.close();
});

test('GET /api/brand/brand.js serves the shared client script', async () => {
  const ctx = { ...tempBrand('/brand-mark.svg'), apiKey: () => 'k' };
  const { server, port } = await start(ctx);
  const res = await fetchRaw(port, '/api/brand/brand.js');
  assert.equal(res.status, 200);
  assert.match(String(res.headers['content-type']), /javascript/);
  assert.match(res.body.toString(), /api\/brand/);
  server.close();
});
