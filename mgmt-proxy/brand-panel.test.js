import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'lp-inject.js'), 'utf8');

/** Evaluate a top-level function out of the injector (it is a browser IIFE). */
function extract(name) {
  const re = new RegExp(`function ${name}\\(([^)]*)\\) \\{[\\s\\S]*?\\n  \\}`);
  const m = src.match(re);
  assert.ok(m, `${name}() must exist in lp-inject.js`);
  return new Function(`return (${m[0]})`)();
}

const shouldRefillPanel = extract('shouldRefillPanel');

test('never overwrite a panel the user has edited', () => {
  assert.equal(shouldRefillPanel({ dirty: true, focused: false, rendered: 'a', server: 'b' }), false);
});

test('never overwrite while a field inside the panel has focus', () => {
  assert.equal(shouldRefillPanel({ dirty: false, focused: true, rendered: 'a', server: 'b' }), false);
});

test('refill a pristine panel when the server config changed', () => {
  assert.equal(shouldRefillPanel({ dirty: false, focused: false, rendered: 'a', server: 'b' }), true);
});

test('skip the write when nothing changed', () => {
  assert.equal(shouldRefillPanel({ dirty: false, focused: false, rendered: 'a', server: 'a' }), false);
});

test('the poll path must not blindly repaint an existing panel', () => {
  const fn = src.match(/function enhanceSettingsModal\(\) \{[\s\S]*?\n  \}/);
  assert.ok(fn, 'enhanceSettingsModal() must exist');
  assert.doesNotMatch(
    fn[0],
    /if \(existing\) \{ fillBrandPanel\(existing\); return; \}/,
    're-filling on every poll overwrites what the user is typing',
  );
  assert.match(fn[0], /syncBrandPanel\(existing\)/, 'existing panels must go through the guarded sync');
});
