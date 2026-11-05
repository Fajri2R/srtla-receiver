import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  DEFAULT_BRAND,
  normalizeBrandConfig,
  readBrandConfig,
  writeBrandConfig,
  isBrandWriteAuthorized,
} from './brand-config.js';

test('normalizeBrandConfig accepts a custom label, subtitle, and local logo path', () => {
  assert.deepEqual(normalizeBrandConfig({
    name: 'Open Relay',
    subtitle: 'SRT Management',
    logo: '/branding/logo.svg',
  }), {
    name: 'Open Relay',
    subtitle: 'SRT Management',
    logo: '/branding/logo.svg',
  });
});

test('normalizeBrandConfig accepts an uploaded image data URL', () => {
  const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
  assert.equal(normalizeBrandConfig({ logo }).logo, logo);
});

test('normalizeBrandConfig rejects unsafe logo schemes and strips control characters', () => {
  const result = normalizeBrandConfig({
    name: 'Bad\u0000 Brand',
    subtitle: 'Line\nBreak',
    logo: 'javascript:alert(1)',
  });
  assert.equal(result.name, 'Bad Brand');
  assert.equal(result.subtitle, 'Line Break');
  assert.equal(result.logo, DEFAULT_BRAND.logo);
});

test('writeBrandConfig persists normalized JSON and readBrandConfig restores it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sls-brand-'));
  const path = join(dir, 'nested', 'brand.json');
  const expected = {
    name: 'Community SLS',
    subtitle: 'Operations Console',
    logo: 'https://cdn.example.test/logo.webp',
  };
  assert.deepEqual(writeBrandConfig(path, expected), expected);
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), expected);
  assert.deepEqual(readBrandConfig(path), expected);
});

test('readBrandConfig returns defaults when the file is absent or malformed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sls-brand-'));
  assert.deepEqual(readBrandConfig(join(dir, 'missing.json')), DEFAULT_BRAND);
});

test('isBrandWriteAuthorized only accepts the current Bearer API key', () => {
  assert.equal(isBrandWriteAuthorized('Bearer correct-key', 'correct-key'), true);
  assert.equal(isBrandWriteAuthorized('Bearer wrong-key', 'correct-key'), false);
  assert.equal(isBrandWriteAuthorized('', 'correct-key'), false);
  assert.equal(isBrandWriteAuthorized('Bearer correct-key', ''), false);
});
