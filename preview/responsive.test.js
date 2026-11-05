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

test('the language toggle centers its two-letter label', () => {
  const block = mediaBlock(768);
  const langRule = /#lang-toggle[^{]*\{([^}]*)\}/.exec(block)?.[1]
    ?? /\.btn-lang[^{]*\{([^}]*)\}/.exec(block)?.[1]
    ?? '';
  assert.match(langRule, /justify-content:\s*center/,
    'the EN/ID label sits off-center because a min-width wider than the glyphs is left-aligned');
  const inline = /id="lang-toggle"[^>]*style="([^"]*)"/.exec(html)?.[1] ?? '';
  assert.ok(!/justify-content/.test(inline),
    'centering must live in CSS, not an inline declaration that a media query cannot override');
});

test('phone header controls share one size and an even gap', () => {
  const block = mediaBlock(768);
  assert.match(block, /\.header-actions\s*\{[^}]*gap:\s*8px/,
    'the icon row needs a consistent 8px rhythm');
  assert.match(block, /\.header\s+\.header-actions\s*>\s*\.nav-action\s*\{[^}]*height:\s*38px/,
    'every icon control must be 38px tall so the row reads as one group');
  assert.match(block, /\.header\s+\.header-actions\s*>\s*\.nav-action\s*\{[^}]*justify-content:\s*center/,
    'icons must center inside their square');
});

test('the HLS status pill stays compact instead of stretching to the row width', () => {
  const block = mediaBlock(560);
  assert.match(block, /\.header-badge[^{]*\{[^}]*justify-self:\s*(start|center|end)/,
    'the badge must size to its content via the grid track, not flex-grow');
  assert.ok(!/\.header-badge\s*\{[^}]*flex:\s*1\s+1\s+100%/.test(style),
    'flex:1 1 100% is what inflates the pill to a full-width bar');
});

test('the last-updated stamp uses a 24-hour clock in both languages', () => {
  const m = /getElementById\('stat-updated'\)\.textContent\s*=\s*([^;]+);/.exec(html);
  assert.ok(m, 'stat-updated assignment must exist');
  assert.ok(/hour12:\s*false/.test(m[1]), `the stamp must not render an AM/PM suffix: ${m[1]}`);
});
