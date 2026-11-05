import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

function overlayTokens(source) {
  const dark = source.match(/:root\s*\{[\s\S]*?--bg-overlay:\s*([^;]+);/);
  const light = source.match(/:root\[data-theme=["']light["']\]\s*\{[\s\S]*?--bg-overlay:\s*([^;]+);/);
  return { dark: dark?.[1].replace(/\s/g, ''), light: light?.[1].replace(/\s/g, '') };
}

test('HLS and SRT navbar overlays exactly follow the SLS palette', () => {
  const expected = {
    dark: 'rgba(15,17,16,.88)',
    light: 'rgba(250,252,250,.90)',
  };

  assert.deepEqual(overlayTokens(read('./preview/index.html')), expected, 'HLS navbar colors drifted from SLS');
  assert.deepEqual(overlayTokens(read('./srt-monitor/public/index.html')), expected, 'SRT navbar colors drifted from SLS');
});

test('both dashboard headers consume the shared overlay token', () => {
  for (const path of ['./preview/index.html', './srt-monitor/public/index.html']) {
    const source = read(path);
    assert.match(source, /\.header\s*\{[\s\S]*?background:\s*var\(--bg-overlay\);/, `${path} header must use --bg-overlay`);
  }
});
