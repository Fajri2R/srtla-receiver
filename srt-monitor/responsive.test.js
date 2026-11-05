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
