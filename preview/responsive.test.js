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

test('light mode faint token meets WCAG AA 4.5:1 on light backgrounds', () => {
  const light = /\[data-theme="light"\]\s*\{([^}]*)\}/s.exec(style)?.[1] ?? '';
  assert.ok(light, 'expected a [data-theme="light"] token block');
  // #708078 is 3.65:1 on #eef1ed (fails AA). Ashveil canonical is #596960 (>=4.8:1).
  const m = /--faint:\s*(#[0-9a-fA-F]{6})/.exec(light);
  assert.ok(m, 'expected --faint definition in light theme');
  assert.notEqual(m[1].toLowerCase(), '#708078',
    '#708078 fails WCAG AA on light backgrounds; use #596960 or darker');
});

test('empty state card uses theme surface instead of hardcoded dark background', () => {
  // Hard-coded rgba(23,25,24,.5) leaves a black box in light theme with 1.1:1 text.
  const emptyBlock = /\.empty-state\s*\{([^}]*)\}/s.exec(style)?.[1] ?? '';
  assert.ok(emptyBlock, 'expected an .empty-state rule');
  assert.doesNotMatch(emptyBlock, /rgba\(23,\s*25,\s*24/,
    'empty state must use theme variables so light theme does not render dark-on-dark');
  assert.match(emptyBlock, /background:\s*var\(--surface/,
    'empty state should inherit the themed surface token');
});

test('the last-updated stamp uses a 24-hour clock in both languages', () => {
  const m = /getElementById\('stat-updated'\)\.textContent\s*=\s*([^;]+);/.exec(html);
  assert.ok(m, 'stat-updated assignment must exist');
  assert.ok(/hour12:\s*false/.test(m[1]), `the stamp must not render an AM/PM suffix: ${m[1]}`);
});

test('compact header icons expose a 44px hit area on touch layouts', () => {
  // Visual rhythm stays 38px, but thumbs need 44px. A transparent ::after grows
  // the target without pushing the row wider.
  const touch = /@media\s*\(max-width:\s*768px\),\s*\(pointer:\s*coarse\)\s*\{([\s\S]*?)\n    \}/.exec(style)?.[1] ?? '';
  assert.ok(touch, 'expected a touch-target media block');
  assert.match(touch, /width:\s*44px;\s*height:\s*44px/,
    'the hit area must be 44x44');
  for (const sel of ['#lang-toggle', '#btn-theme', '#btn-refresh', '#btn-mgmt', '#btn-srt-monitor']) {
    assert.ok(touch.includes(sel), `${sel} must get the 44px hit area`);
  }
});

test('primary interactive surfaces meet a 44px touch height', () => {
  assert.match(style, /\.logo\s*\{[^}]*min-height:\s*44px/, 'the brand link is a tap target');
  assert.match(style, /\.btn-action\s*\{[^}]*min-height:\s*44px/, 'stream card actions are tap targets');
});

test('text over the black media surface never follows the page theme', () => {
  // The video overlay and its badges sit on a permanently dark canvas, so theme
  // tokens like --faint/--muted turn dark-on-dark in light mode.
  for (const sel of ['.overlay-text', '.badge-live', '.badge-bitrate']) {
    const blocks = [...style.matchAll(new RegExp(`\\n\\s*${sel.replace('.','\\.')}\\s*\\{([^}]*)\\}`, 'g'))]
      .map(m => m[1]);
    assert.ok(blocks.length, `${sel} rule must exist`);
    const themed = blocks.find(b => /color\s*:/.test(b)) ?? blocks[0];
    assert.doesNotMatch(themed, /var\(--(faint|muted|text)\b/,
      `${sel} sits on black media; light-theme tokens vanish there`);
    assert.match(themed, /var\(--on-media-[a-z0-9-]+\)/,
      `${sel} must use fixed on-media tokens`);
  }
  const overlay = /\.video-overlay\s*\{([^}]*)\}/s.exec(style)?.[1] ?? '';
  assert.doesNotMatch(overlay, /var\(--(surface|border)\b/,
    '.video-overlay keeps a fixed dark canvas so its content stays readable');
});

test('network health changes the visible status label, not just its colour', () => {
  // A red/yellow chip that still reads "Live" is invisible to colour-blind users
  // and to anyone on a touch device who cannot hover the tooltip.
  const critical = /statusTheme\s*=\s*'error'[\s\S]{0,240}?statusText\s*=/.test(html);
  const degraded = /statusTheme\s*=\s*'warning'[\s\S]{0,240}?statusText\s*=/.test(html);
  assert.ok(critical, 'critical health must relabel the chip, not only recolour it');
  assert.ok(degraded, 'degraded health must relabel the chip, not only recolour it');
});

test('the stream area shows a persistent error state with a retry action', () => {
  // A 3.5s toast leaves an empty grid with no explanation and no way back.
  assert.match(html, /id="btn-retry"/, 'the error state needs a retry button');
  assert.match(html, /aria-busy/, 'the grid must expose its loading state');
  assert.match(html, /function renderLoadError|function renderStreamError/,
    'fetch failures need their own persistent render path');
});

test('a first load renders a skeleton instead of an unexplained empty grid', () => {
  assert.match(html, /skeleton/, 'a first paint needs skeleton placeholders');
  assert.match(html, /hasLoadedOnce|firstLoad/, 'loading state must be tracked separately from empty');
});

test('the first successful render clears skeleton placeholders', () => {
  // Placeholders carry .skeleton-card, not .stream-card, so the stale-card sweep
  // would leave them stacked above real data forever.
  assert.match(html, /querySelectorAll\('\.skeleton-card'\)\.forEach/,
    'renderDashboard must remove skeleton cards when real data arrives');
});

test('page has a single h1 inside main for screen-reader navigation', () => {
  assert.match(html, /<main[^>]*>[\s\S]{0,300}<h1[^>]*class="sr-only"[^>]*data-i18n="page.title"/,
    'main needs one translated screen-reader-only h1');
});
