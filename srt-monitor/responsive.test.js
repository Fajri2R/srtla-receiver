'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');

function ruleBlock(selector) {
  const re = new RegExp(escapeRe(selector) + '\\s*\\{([^}]*)\\}', 'is');
  return re.exec(html)?.[1] ?? '';
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mediaBlocks(query) {
  const re = new RegExp('@media\\s*\\(\\s*max-width:\\s*' + query + 'px\\s*\\)\\s*\\{([\\s\\S]*?)\\n    \\}', 'g');
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function phoneRules() {
  const blocks = mediaBlocks(650);
  assert.ok(blocks.length > 0, 'expected at least one max-width:650px block');
  return blocks.join('\n');
}

// Narrow phones must not inherit desktop control sizing. Anything below 32px
// is not reliably tappable and 28px buttons force cramped single-row toolbars.
test('desktop header controls share the 32px SLS chip height and language width', () => {
  const nav = ruleBlock('.header .nav-action');
  assert.match(nav, /height:\s*32px/, 'desktop nav action height matches SLS');
  assert.match(nav, /min-height:\s*0/, 'the generic 44px card-action floor must not inflate desktop navbar controls');
  const lang = ruleBlock('#lang-toggle');
  assert.match(lang, /min-width:\s*38px/, 'language button must match the 38px SLS/HLS width');
  const theme = ruleBlock('.theme-btn');
  assert.match(theme, /width:\s*32px[\s\S]*height:\s*32px/, 'theme chip stays 32px square');
});

test('phone header matches SLS with one 56px row and a compact status dot', () => {
  const block = phoneRules();
  assert.match(block, /grid-template-areas:\s*"brand \. mgmt hls history lang theme live"/,
    'all controls and the status badge must stay on the first row');
  assert.match(block, /\.live\s*\{[^}]*width:\s*26px;[^}]*height:\s*26px/s,
    'phone live state collapses to a 26px status dot');
  assert.match(block, /\.live > span\s*\{[^}]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/s,
    'status text remains available to assistive tech');
  // The stream selector is the one control SLS has no equivalent for, so it
  // keeps a real second row instead of being squeezed or hidden.
  assert.match(block, /"selector selector selector selector selector selector selector selector"/,
    'stream selector keeps its own row so it stays tappable');
  assert.match(block, /\.selector\s*\{[^}]*min-height:\s*44px/s,
    'the selector row still meets the 44px touch floor');
});

test('narrow viewports raise action tap targets to at least 38px', () => {
  const block = phoneRules();
  assert.match(block, /\.hist-actions \.action[^{]*\{[^}]*min-height:\s*(3[89]|4[0-4])px/,
    'history action buttons must grow on phones');
  assert.match(block, /\.hist-key-row \.action[^{]*\{[^}]*min-height:\s*(3[89]|4[0-4])px/,
    'the retention save button must grow on phones');
});

test('very narrow viewports stack the incident description under its metadata', () => {
  const m = /@media\s*\(max-width:\s*480px\)\s*\{([\s\S]*?)\n    \}/.exec(html);
  assert.ok(m, 'expected a max-width:480px block for incident rows');
  const block = m[1];
  assert.match(block, /grid-template-areas:\s*"when type"\s*"why why"/,
    'at 320px the description needs the full row width');
  assert.match(block, /\.hist-incident \.why\s*\{[^}]*grid-area:\s*why/,
    'description must be assigned to the spanning area');
});

test('the history stream filter keeps readable width instead of halving evenly', () => {
  const block = phoneRules();
  assert.match(block, /\.hist-key input\s*\{[^}]*flex:\s*1 1 130px/,
    'the retention input must shrink so the stream filter keeps its width');
  const narrow = mediaBlocks(480).join('\n');
  assert.match(narrow, /\.hist-field:first-of-type\s*\{[^}]*flex:\s*\d+\s+1\s+\d+px/,
    'the stream filter must claim a larger share on very narrow screens');
});

test('light mode faint token meets WCAG AA 4.5:1 on light surfaces', () => {
  const light = /\[data-theme="light"\]\s*\{([^}]*)\}/s.exec(html)?.[1] ?? '';
  assert.ok(light, 'expected a light theme token block');
  const m = /--faint:\s*(#[0-9a-fA-F]{6})/.exec(light);
  assert.ok(m, 'expected --faint definition in light theme');
  assert.notEqual(m[1].toLowerCase(), '#708078',
    '#708078 is only 3.65:1 on #eef1ed; use canonical #596960 or darker');
});

test('icon-only header navigation keeps accessible names on compact layouts', () => {
  for (const id of ['btn-mgmt', 'btn-hls', 'btn-history']) {
    const tag = new RegExp(`<(?:button|a)[^>]*id="${id}"[^>]*>`).exec(html)?.[0] ?? '';
    assert.ok(tag, `${id} must exist`);
    assert.match(tag, /aria-label="[^"]+"/, `${id} needs aria-label when .btn-text is hidden`);
  }
});

test('connection status announces polling updates to assistive technology', () => {
  const tag = /<div[^>]*class="live status-indicator[^>]*>/.exec(html)?.[0] ?? '';
  assert.ok(tag, 'connection status node must exist');
  assert.match(tag, /role="status"/);
  assert.match(tag, /aria-live="polite"/);
});

test('phone header controls keep a uniform 36-38px touch target and centered label', () => {
  const block = phoneRules();
  assert.match(block, /#lang-toggle\s*\{[^}]*justify-content:\s*center/,
    'EN/ID text in SRT header must be centered in its button');
  assert.match(block, /\.theme-btn\s*\{[^}]*width:\s*3[68]px/,
    'theme button must match the sibling nav actions');
  assert.match(block, /\.header-controls\s*>\s*\.action[^{]*\{[^}]*height:\s*3[68]px/,
    'header nav actions on phones must be at least 36px tall');
});

test('SRT status badge on narrow screens does not blow out the header into 4 rows', () => {
  const narrow = mediaBlocks(650).join('\n');
  assert.match(narrow, /\.live\s*\{[^}]*height:\s*2[68]px/,
    'live status pill on phones must stay compact');
});


test('mobile icon controls expose a 44px touch hit area', () => {
  const touch = /@media\s*\(max-width:\s*650px\),\s*\(pointer:\s*coarse\)\s*\{([\s\S]*?)\n\s*\}/.exec(html)?.[1] ?? '';
  assert.ok(touch, 'expected a mobile/coarse-pointer touch block');
  assert.match(touch, /width:\s*44px;\s*height:\s*44px/, 'touch hit area must be 44x44');
  for (const sel of ['#btn-mgmt', '#btn-hls', '#btn-history', '#lang-toggle', '#theme-btn']) {
    assert.ok(touch.includes(sel), `${sel} must get the touch hit area`);
  }
});

test('monitor card actions and selectors meet a 44px touch height', () => {
  assert.match(html, /\.action\s*\{[^}]*min-height:\s*44px/s,
    'Hide/Fullscreen/Ext Window controls must be at least 44px tall');
  assert.match(html, /#stream\s*\{[^}]*min-height:\s*44px;\s*height:\s*44px/,
    'stream selector needs 44px on touch, where it is the primary control');
});

test('chart draws threshold guides for the selected metric instead of only listing them in details', () => {
  // A bare 0-100 axis tells the operator nothing: 120ms RTT reads as "fine"
  // unless the warn/critical bands are visible on the canvas itself.
  assert.match(html, /function drawThresholdGuides/, 'expected threshold guide rendering');
  assert.match(html, /setLineDash/, 'guides must be dashed so they cannot be mistaken for data');
  assert.match(html, /rttWarn|dropsWarn|bufferWarn/, 'guides must come from the API thresholds');
});

test('incidents are marked on the chart timeline', () => {
  assert.match(html, /function drawIncidentMarkers/, 'expected incident markers on the timeline');
  assert.match(html, /data-severity/, 'markers must distinguish warning from critical');
});

test('the incident list can be filtered by severity', () => {
  assert.match(html, /id="hist-incident-filter"/, 'a severity filter chip row is required');
  assert.match(html, /data-filter="critical"/, 'critical filtering must be available');
  assert.match(html, /data-filter="warning"/, 'warning filtering must be available');
});

test('incident markers are deduped per minute and never outshine the data', () => {
  // A session can report several incident types for one minute; one full-height
  // line per event turned a 132-incident chart into noise.
  assert.match(html, /Math\.floor\(incident\.t \/ 60000\) \* 60000/,
    'incidents must be bucketed to whole minutes before drawing');
  assert.match(html, /const byMinute = new Map\(\)/, 'duplicate minutes must collapse into one marker');
  assert.doesNotMatch(html, /c\.moveTo\(x, T\); c\.lineTo\(x, T \+ PH\)/,
    'markers must not draw full-height vertical lines across the data');
});

test('severity filter chips meet a 44px touch target on phones', () => {
  assert.match(html, /\.hist-filter-btn\s*\{[^}]*min-height:\s*28px/,
    'desktop keeps the compact chip height');
  assert.match(html, /@media \(pointer: coarse\), \(max-width: 650px\)\s*\{\s*\.hist-filter-btn\s*\{[^}]*min-height:\s*44px/,
    'phone/coarse layouts must expand chips to 44px');
});

test('status indicator updates data-i18n key dynamically so language switch never reverts to disconnected', () => {
  // A static data-i18n="status.disconnected" caused every language switch to
  // announce a disconnected state even when the stream was Warning or Live.
  assert.match(html, /function setStatus/, 'setStatus exists');
  assert.match(html, /span\.dataset\.i18nKey|span\.setAttribute\('data-i18n'|span\.removeAttribute\('data-i18n'\)/,
    'setStatus must clear or update data-i18n attribute');
  assert.match(html, /ashveil:langchange/, 'monitor must re-render or re-translate status on language change');
});

test('inputs carry programmatic accessible names via aria-label or associated label', () => {
  assert.match(html, /id="stream"[^>]*aria-label=/, 'stream selector must have an aria-label');
  assert.match(html, /id="hist-key"[^>]*aria-label=/, 'API key input must have an aria-label');
});

test('mobile brand mark keeps a 44px hit row', () => {
  assert.match(html, /\.brand\s*\{[^}]*min-height:\s*44px|\.brand::after/,
    'brand anchor must keep a 44px touch row');
});

test('every setStatus call site carries its i18n key', () => {
  const calls = [...html.matchAll(/setStatus\(([^;]*?)\);/gs)].map(m => m[1]);
  const live = calls.filter(args => !args.startsWith('text') && !args.includes("theme = 'normal'"));
  assert.ok(live.length >= 5, 'expected all five status call sites, found ' + live.length);
  for (const args of live) {
    assert.match(args, /('status\.[A-Za-z]+'|statusKey)\s*$/m,
      'setStatus call without a status key will revert to the markup default on language switch: ' + args.slice(0, 90));
  }
});
