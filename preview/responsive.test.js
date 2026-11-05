import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

// Extract the <style> block so the rules can be reasoned about as CSS contracts.
const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

function mediaBlock(maxWidth) {
  const re = new RegExp(`@media \\(max-width: ${maxWidth}px\\) \\{([\\s\\S]*?)\n    \\}\n`, 'm');
  return re.exec(style)?.[1] ?? '';
}

test('nav button labels collapse to icons below 768px without relying on font-size:0', () => {
  const block = mediaBlock(768);
  assert.ok(block, 'mobile media block must exist');
  // font-size:0 on the button loses to the higher-specificity .header .nav-action
  // font rule, so the label must be hidden on the span itself.
  assert.match(block, /\.btn-mgmt-text\s*\{\s*display:\s*none\s*!important/,
    'the .btn-mgmt-text span must be display:none inside the 768px block');
});

test('every icon-only header control keeps an accessible name', () => {
  for (const id of ['btn-refresh', 'btn-mgmt', 'btn-srt-monitor', 'btn-theme', 'lang-toggle']) {
    const tag = new RegExp(`<(?:button|a)[^>]*id="${id}"[^>]*>`).exec(html)?.[0] ?? '';
    assert.ok(tag, `${id} must exist`);
    assert.ok(/aria-label=/.test(tag), `${id} needs an aria-label once its text is hidden`);
  }
});

test('the eyebrow line may wrap on phones instead of clipping', () => {
  const block = mediaBlock(480);
  assert.match(block, /\.eyebrow\s*\{[^}]*white-space:\s*normal/, 'eyebrow must wrap at 480px and below');
});

test('the last-updated stamp uses a 24-hour clock in both languages', () => {
  const m = /getElementById\('stat-updated'\)\.textContent\s*=\s*([^;]+);/.exec(html);
  assert.ok(m, 'stat-updated assignment must exist');
  assert.ok(/hour12:\s*false/.test(m[1]), `the stamp must not render an AM/PM suffix: ${m[1]}`);
});
