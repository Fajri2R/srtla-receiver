import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(root, p), 'utf8');

test('both dashboards load the shared brand script served by the HLS manager', () => {
  for (const page of ['preview/index.html', 'srt-monitor/public/index.html']) {
    const html = read(page);
    assert.match(html, /<script src="\/api\/brand\/brand\.js"><\/script>/, `${page} must load the shared brand client`);
    assert.match(html, /\[data-brand-custom\]\s*\{\s*filter:\s*none;?\s*\}/, `${page} must not invert a custom logo in light mode`);
  }
});

test('every origin proxies /api/brand to the HLS manager', () => {
  assert.match(read('preview/nginx.conf'), /location \/api\/brand \{[\s\S]*?proxy_pass\s+\$hls_manager;/, 'live-preview must proxy brand reads');
  assert.match(read('mgmt-proxy/default.conf.template'), /location \/api\/brand \{[\s\S]*?proxy_pass\s+http:\/\/hls-manager:9090;/, 'SLS must proxy the whole /api/brand subtree');
  const monitor = read('srt-monitor/index.js');
  assert.match(monitor, /import \{ handleBrandProxy \} from "\.\/brand-proxy\.js";/, 'srt-monitor must import its proxy handler');
  assert.ok(monitor.indexOf('import { handleBrandProxy') < monitor.indexOf('handleBrandProxy(req'), 'the proxy import must precede its use');
  assert.match(monitor, /handleBrandProxy\(req, res, \{ baseUrl: BRAND_URL \}\)/, 'srt-monitor must proxy brand reads');
});

test('the brand owner serves the logo asset and the shared script', () => {
  const routes = read('hls-manager/brand-routes.js');
  assert.match(routes, /\/api\/brand\/asset/);
  assert.match(routes, /\/api\/brand\/brand\.js/);
  assert.match(read('hls-manager/Dockerfile'), /brand-client\.js/, 'the client script must ship in the image');
  assert.match(read('docker-compose.yml'), /\.\/mgmt-proxy:\/assets:ro/, 'stock logos live in the mgmt-proxy assets dir');
});

test('the shared client never hardcodes a deployment identity', () => {
  const client = read('hls-manager/brand-client.js');
  assert.doesNotMatch(client, /ASHVEIL|ashveil\.my\.id|srtla/i, 'brand strings must come from /api/brand');
});
