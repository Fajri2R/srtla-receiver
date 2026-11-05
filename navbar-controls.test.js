import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

function normalize(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

function cssBlock(source, selectorFragment) {
  const escaped = selectorFragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}[^\\{]*\\{([^}]*)\\}`, 'i'));
  assert.ok(match, `missing CSS block containing: ${selectorFragment}`);
  const declarations = {};
  for (const item of match[1].split(';')) {
    const colon = item.indexOf(':');
    if (colon < 0) continue;
    declarations[item.slice(0, colon).trim()] = item.slice(colon + 1).trim();
  }
  // Expand shorthand so the contract can assert border-color regardless of
  // whether the rule was authored as `border: 1px solid <color>`.
  const border = declarations.border;
  if (border && !declarations['border-color']) {
    const parts = border.replace(/\s+/g, ' ').trim().split(' ');
    const color = parts.slice(2).join(' ');
    if (color) declarations['border-color'] = color;
  }
  return declarations;
}

function navActionTag(source, id) {
  const tag = source.match(new RegExp(String.raw`<(?:a|button)\b[^>]*\bid="${id}"[^>]*>`));
  assert.ok(tag, `missing element with id=${id}`);
  return tag[0];
}

const darkContract = {
  background: 'transparent',
  borderColor: 'var(--border-default)',
  color: 'var(--text-secondary)',
  radius: '8px',
  hoverBackground: 'var(--bg-elevated)',
  hoverBorder: '#3b443f',
  hoverColor: 'var(--text-primary)',
};

const lightContract = {
  border: '#b8c5bc',
  color: '#36463e',
  hoverBackground: '#ffffff',
  hoverBorder: '#a9b8af',
  hoverColor: '#18231d',
};

function assertSrtNavbarContract(source) {
  const base = cssBlock(source, '.header .nav-action');
  const hover = cssBlock(source, '.header .nav-action:hover');
  const lightRest = cssBlock(source, '[data-theme="light"] .header .nav-action');
  const light = cssBlock(source, '[data-theme="light"] .header .nav-action:hover');
  assert.equal(normalize(base.background), normalize(darkContract.background));
  assert.equal(normalize(base['border-color']), normalize(darkContract.borderColor));
  assert.equal(normalize(base.color), normalize(darkContract.color));
  assert.equal(normalize(base['border-radius']), normalize(darkContract.radius));
  assert.equal(normalize(hover.background), normalize(darkContract.hoverBackground));
  assert.equal(normalize(hover['border-color']), normalize(darkContract.hoverBorder));
  assert.equal(normalize(hover.color), normalize(darkContract.hoverColor));
  assert.equal(normalize(lightRest['border-color']), normalize(lightContract.border));
  assert.equal(normalize(lightRest.color), normalize(lightContract.color));
  assert.equal(normalize(light.background), normalize(lightContract.hoverBackground));
  assert.equal(normalize(light['border-color']), normalize(lightContract.hoverBorder));
  assert.equal(normalize(light.color), normalize(lightContract.hoverColor));
}

function assertHlsNavbarContract(source) {
  const base = cssBlock(source, '.header .nav-action');
  const hover = cssBlock(source, '.header .nav-action:hover');
  const lightRest = cssBlock(source, '[data-theme="light"] .header .nav-action');
  const light = cssBlock(source, '[data-theme="light"] .header .nav-action:hover');
  assert.equal(normalize(base.background), normalize('transparent'));
  assert.equal(normalize(base['border-color']), normalize('var(--border)'));
  assert.equal(normalize(base.color), normalize('var(--muted)'));
  assert.equal(normalize(base['border-radius']), normalize('8px'));
  assert.equal(normalize(hover.background), normalize('var(--surface-2)'));
  assert.equal(normalize(hover['border-color']), normalize('#3b443f'));
  assert.equal(normalize(hover.color), normalize('var(--text)'));
  assert.equal(normalize(lightRest['border-color']), normalize(lightContract.border));
  assert.equal(normalize(lightRest.color), normalize(lightContract.color));
  assert.equal(normalize(light.background), normalize(lightContract.hoverBackground));
  assert.equal(normalize(light['border-color']), normalize(lightContract.hoverBorder));
  assert.equal(normalize(light.color), normalize(lightContract.hoverColor));
}

test('SRT navbar controls follow the neutral SLS button palette', () => {
  const source = read('./srt-monitor/public/index.html');
  assertSrtNavbarContract(source);
  for (const id of ['btn-hls', 'btn-mgmt']) {
    assert.match(navActionTag(source, id), /class="[^"]*nav-action/, `${id} must use the navbar-only class`);
  }
});

test('HLS navbar controls follow the neutral SLS button palette', () => {
  const source = read('./preview/index.html');
  assertHlsNavbarContract(source);
  for (const id of ['btn-refresh', 'btn-mgmt', 'btn-srt-monitor']) {
    assert.match(navActionTag(source, id), /class="[^"]*nav-action/, `${id} must use the navbar-only class`);
  }
});
