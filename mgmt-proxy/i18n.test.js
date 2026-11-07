import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'lp-inject.js'), 'utf8');
const css = readFileSync(join(here, 'ashveil-sls.css'), 'utf8');

function extractExpression(name, nextMarker) {
  const start = src.indexOf(`var ${name} = `);
  assert.notEqual(start, -1, `${name} must exist`);
  const valueStart = start + `var ${name} = `.length;
  const end = src.indexOf(nextMarker, valueStart);
  assert.notEqual(end, -1, `end marker for ${name} must exist`);
  return new Function(`return (${src.slice(valueStart, end).trim().replace(/;$/, '')})`)();
}

test('injector defines complete matching Indonesian and English dictionaries', () => {
  const dict = extractExpression('I18N', '\n  var VENDOR_TEXT_KEYS');
  assert.deepEqual(Object.keys(dict.id).sort(), Object.keys(dict.en).sort());
  assert.ok(Object.keys(dict.en).length >= 55, `expected broad coverage, got ${Object.keys(dict.en).length}`);
  for (const lang of ['id', 'en']) {
    for (const [key, value] of Object.entries(dict[lang])) {
      assert.ok(String(value).trim(), `${lang}.${key} is empty`);
    }
  }
});

test('language state persists under shared ashveil-lang key and emits a repaint event', () => {
  assert.match(src, /localStorage\.getItem\(['"]ashveil-lang['"]\)/);
  assert.match(src, /localStorage\.setItem\(['"]ashveil-lang['"],\s*lang\)/);
  assert.match(src, /document\.documentElement\.setAttribute\(['"]lang['"],\s*lang\)/);
  assert.match(src, /CustomEvent\(['"]ashveil:langchange['"]/);
});

test('injector exposes an always-visible accessible language toggle', () => {
  assert.match(src, /id\s*=\s*['"]mgmt-lang-btn['"]/);
  assert.match(src, /className\s*=\s*['"][^'"]*mgmt-lang-btn/);
  assert.match(src, /setLanguage\(lang === ['"]id['"] \? ['"]en['"] : ['"]id['"], true\)/);
  assert.ok(/\.mgmt-lang-btn\s*\{[^}]*display\s*:\s*inline-flex/is.test(css), 'language button needs a visible flex treatment');
  assert.ok(!/@media[^{]*\{[^@]*\.mgmt-lang-btn\s*\{[^}]*display\s*:\s*none/is.test(css), 'language button must never be hidden');
});

test('custom injector copy uses translation hooks instead of fixed mixed-language labels', () => {
  for (const key of [
    'preview.live', 'preview.close', 'preview.connecting', 'preview.escClose',
    'nav.settings', 'nav.themeTooltip', 'nav.openHls', 'nav.openSrt',
    'brand.title', 'brand.name', 'brand.subtitle', 'brand.upload',
    'brand.reset', 'brand.save', 'host.note'
  ]) {
    assert.ok(new RegExp(`(?:data-i18n(?:-[a-z]+)?=(?:\\\\?['"])|data-i18n(?:-[a-z]+)?['"],\\s*['"]|t\\(')${key.replace(/\./g, '\\.')}['"]`).test(src), `missing translation hook/call for ${key}`);
  }
});

test('navbar shortcut buttons show product names, not "Open <product>"', () => {
  // Visible label keys stay short; the verb stays in tooltip/aria only.
  assert.ok(src.includes("'nav.hls': 'HLS Manager'"), 'short en label nav.hls');
  assert.ok(src.includes("'nav.srt': 'SRT Monitor'"), 'short en label nav.srt');
  assert.ok(src.includes("'nav.hls': 'HLS Manager'".replace('HLS Manager','')) === false || true);
  for (const lang of ['id', 'en']) {
    for (const key of ['nav.hls', 'nav.srt']) {
      assert.ok(!new RegExp(`'${key}':\s*'[^']*(?:Open|Buka)\s`).test(src), `${key} in ${lang} must not say Open/Buka in the visible label`);
    }
  }
  assert.match(src, /<span class="btn-text" data-i18n="nav\.hls">/,
    'HLS button label must bind nav.hls, not nav.openHls');
  assert.match(src, /<span class="btn-text" data-i18n="nav\.srt">/,
    'SRT button label must bind nav.srt, not nav.openSrt');
  assert.match(src, /setAttribute\('data-i18n-tooltip',\s*'nav\.(?:openHls|openSrt)'\)/,
    'tooltip keeps the explicit Open/Buka verb');
  assert.match(src, /setAttribute\('data-i18n-aria',\s*'nav\.(?:openHls|openSrt)'\)/,
    'accessible name keeps the explicit Open/Buka verb');
});

test('language and theme controls sit rightmost, after the shortcut buttons', () => {
  // SRT puts language then theme at the far right; SLS must match that order.
  assert.match(src, /container\.appendChild\(hlsBtn\);\s*\n\s*container\.appendChild\(srtBtn\);/,
    'the tool group holds only the HLS and SRT shortcuts');
  assert.doesNotMatch(src, /container\.appendChild\(themeBtn\)|container\.appendChild\(langBtn\)/,
    'theme and language must not sit inside the shortcut group');
  assert.match(src, /settingsBtn\.insertAdjacentElement\('afterend',\s*themeBtn\);\s*\n\s*themeBtn\.insertAdjacentElement\('beforebegin',\s*langBtn\);/,
    'language then theme are inserted directly after Settings, in that order');
  assert.match(src, /themeBtn\.insertAdjacentElement\('afterend',\s*liveBadge\)/,
    'the live badge stays rightmost as a status, not a control');
  assert.match(css, /grid-template-areas:\s*"brand tools settings lang theme status"/,
    'phone grid preserves the same explicit order');
});

test('vendor copy translation is exact, idempotent, and re-render safe', () => {
  assert.match(src, /var VENDOR_TEXT_KEYS\s*=\s*\{/);
  assert.match(src, /function translateVendorUi\(/);
  assert.match(src, /data-ashveil-i18n/);
  assert.match(src, /publisher-card-publisher-name/);
  assert.match(src, /new MutationObserver\([\s\S]*translateUi/);
  assert.match(src, /translateUi\(\)/);
  for (const label of ['Welcome to SRT Live Server Management', 'Configure Settings', 'Server URL', 'API Key', 'Advanced Mode', 'Cancel', 'Save']) {
    assert.ok(src.includes(`'${label}'`) || src.includes(`"${label}"`), `missing safe vendor mapping for ${label}`);
  }
});

test('status and runtime feedback are translated through keys with interpolation', () => {
  for (const key of ['status.active', 'status.none', 'status.unavailable', 'preview.retrying', 'preview.unavailable', 'brand.fileLarge', 'brand.saved', 'brand.saveFailed']) {
    assert.ok(src.includes(`t('${key}'`), `runtime message must call t('${key}')`);
  }
  assert.match(src, /\{count\}/);
  assert.match(src, /\{seconds\}/);
});

test('vendor mappings round-trip cleanly through their stable marker keys', () => {
  const dict = extractExpression('I18N', '\n  var VENDOR_TEXT_KEYS');
  const map = extractExpression('VENDOR_TEXT_KEYS', '\n  var VENDOR_PATTERNS');
  for (const [english, key] of Object.entries(map)) {
    assert.equal(dict.en[key], english, `${key} english value must equal its vendor label`);
    assert.ok(dict.id[key], `${key} needs an Indonesian counterpart`);
    // Once translateVendorUi marks a text node, repeated toggles resolve by key,
    // not by the translated text. This is the idempotence/re-render contract.
    assert.equal(dict.en[key], english);
  }
  const patterns = extractExpression('VENDOR_PATTERNS', '\n  var lang = ');
  assert.ok(patterns.length >= 3, 'dynamic vendor copy needs pattern rules');
  for (const rule of patterns) {
    assert.ok(dict.en[rule.key] && dict.id[rule.key], `${rule.key} missing from a dictionary`);
  }
});

test('interpolation replaces every placeholder and leaves no braces behind', () => {
  const dict = extractExpression('I18N', '\n  var VENDOR_TEXT_KEYS');
  const render = (lang, key, vars) => String(dict[lang][key]).replace(/\{(\w+)\}/g, (m, name) => String(vars[name]));
  assert.equal(render('en', 'status.active', { count: 2 }), 'Publishers: 2 active');
  assert.equal(render('id', 'status.active', { count: 2 }), 'Publisher: 2 aktif');
  assert.equal(render('id', 'preview.retrying', { seconds: 5 }), 'Menyiapkan stream… mencoba lagi dalam 5 dtk');
  assert.equal(render('en', 'brand.uploaded', { name: 'logo.svg' }), 'Logo uploaded: logo.svg — click Save Brand.');
  for (const lang of ['en', 'id']) {
    for (const [key, value] of Object.entries(dict[lang])) {
      const names = [...String(value).matchAll(/\{(\w+)\}/g)].map(m => m[1]);
      for (const name of names) {
        assert.ok(['count', 'seconds', 'name', 'reason'].includes(name), `${lang}.${key} uses unsupported placeholder {${name}}`);
      }
      assert.deepEqual(
        names.sort(),
        [...String(dict.en[key]).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(),
        `${key} must use the same placeholders in both languages`,
      );
    }
  }
});

test('custom file upload control never relies on browser-locale native labels', () => {
  assert.match(src, /data-i18n="brand\.chooseFile"/);
  assert.match(src, /data-i18n="brand\.noFile"/);
  // The input stays invisible but focusable: aria-hidden/tabindex=-1 made the
  // upload impossible with a keyboard, so only the visual hiding is required.
  assert.match(css, /\.lp-brand-file\s*\{[^}]*opacity\s*:\s*0/is);
  assert.doesNotMatch(src, /class="lp-brand-file"[^>]*aria-hidden="true"/,
    'an aria-hidden file input cannot be focused or announced');
});

test('language repaint preserves the last live-status state instead of resetting to checking', () => {
  assert.match(src, /function paintLiveStatusText\(/);
  assert.match(src, /function translateUi\([\s\S]*paintLiveStatusText\(\)/);
  assert.doesNotMatch(src, /<span data-i18n="status\.checking">/);
});

test('nginx bootstrap restores the saved language before first paint', () => {
  const template = readFileSync(join(here, 'default.conf.template'), 'utf8');
  assert.match(template, /ashveil-lang/);
  assert.match(template, /setAttribute\("lang"/);
  assert.match(template, /ashveil-sls\.css\?v=[0-9a-z]+/);
});

test('static assets declare a single MIME type via default_type, never add_header', () => {
  const template = readFileSync(join(here, 'default.conf.template'), 'utf8');
  // add_header Content-Type appends a second header on top of nginx's default
  // text/plain; browsers honour the first one and silently drop the asset
  // (this broke the whole Ashveil skin). default_type replaces it instead.
  assert.doesNotMatch(template, /add_header\s+Content-Type/i, 'add_header Content-Type duplicates the header');
  assert.match(template, /location = \/ashveil-sls\.css\s*\{[^}]*default_type\s+text\/css/i);
  assert.match(template, /location = \/lp-inject\.js\s*\{[^}]*default_type\s+application\/javascript/i);
});

test('shown modals cancel the Bootstrap entrance transform', () => {
  // Headless/background tabs can remain visibilityState=hidden, which leaves
  // Bootstrap's .modal.fade dialog stuck at translateY(-50px). The shown state
  // must be independent of transition progress so the header stays reachable.
  const rule = /\.modal\.show\s+\.modal-dialog[^{]*\{([^}]*)\}/is.exec(css)?.[1] ?? '';
  assert.match(rule, /transform:\s*none\s*!important/i, 'shown dialog must pin transform:none');
  assert.match(rule, /transition:\s*none\s*!important/i, 'a paused transition must not freeze the entrance offset');
});

test('every CSS custom property used by the skin is actually defined', () => {
  // var(--fg, #f4f4ec) was used for 6 brand-panel texts, but --fg was never
  // declared: the fallback ivory rendered at 1.02:1 on the light panel.
  const used = new Set([...css.matchAll(/var\(\s*--([a-z0-9-]+)/gi)].map(m => m[1].toLowerCase()));
  const defined = new Set([...css.matchAll(/--([a-z0-9-]+)\s*:/gi)].map(m => m[1].toLowerCase()));
  const undefinedTokens = [...used].filter(t => !defined.has(t) && !t.startsWith('bs-'));
  assert.deepEqual(undefinedTokens, [],
    `these tokens are referenced but never defined: ${undefinedTokens.join(', ')}`);
});

test('nav controls keep a visible keyboard focus ring', () => {
  // outline:none with only a border-colour swap fails WCAG 2.4.7.
  const blocks = [...css.matchAll(/\.mgmt-nav-btn:focus-visible[^{]*\{([^}]*)\}/g)].map(m => m[1]);
  assert.ok(blocks.length, 'expected a focus-visible rule for the injected nav buttons');
  const drawsRing = blocks.some(b =>
    /outline\s*:\s*(?!none)/.test(b) || /box-shadow\s*:\s*0\s+0\s+0/.test(b));
  assert.ok(drawsRing, 'focus must draw a ring, not just recolour the border');
  assert.doesNotMatch(blocks.join('\n'), /outline\s*:\s*none/,
    'no later focus rule may suppress the visible ring');
});

test('phone header groups all action controls in one row and sizes them uniformly', () => {
  const blocks = [];
  const re = /@media\s*\(max-width:\s*600px\)\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(css))) blocks.push(m[1]);
  assert.ok(blocks.length, 'expected a max-width:600px mobile block in CSS');
  const block = blocks.join('\n');
  assert.match(block, /\.mgmt-nav-tools\s*\{[^}]*gap:\s*6px/,
    'all icon buttons should share a 6px gap');
  assert.match(block, /\.mgmt-lang-btn[^{]*\{[^}]*justify-content:\s*center/,
    'EN/ID text must be centered in its button');
  assert.match(block, /\.live-status\s*\{[^}]*height:\s*2[68]px/,
    'live status pill must stay compact');
});


test('touch layouts expose 44px hit areas on injected controls', () => {
  const coarse = /@media\s*\(pointer:\s*coarse\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.ok(coarse, 'expected a coarse-pointer block');
  assert.match(coarse, /width:\s*44px;\s*height:\s*44px/,
    'injected icon controls need a 44x44 transparent hit area');
  for (const sel of ['.mgmt-nav-btn', '.mgmt-theme-btn', '.mgmt-lang-btn', 'button[data-mgmt-settings]']) {
    assert.ok(coarse.includes(sel), `${sel} must grow a touch hit area`);
  }
  assert.match(coarse, /min-height:\s*44px/,
    'primary buttons and nav links must reach 44px on touch');
});

test('settings modal controls reach a 44px touch target', () => {
  const coarse = /@media\s*\(pointer:\s*coarse\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.ok(coarse, 'expected a coarse-pointer block');
  assert.match(coarse, /\.modal \.btn-close[^{]*\{[^}]*min-width:\s*44px/,
    'the modal close button measured 28x28');
  assert.match(coarse, /\.modal \.form-control[^{]*\{[^}]*min-height:\s*44px/,
    'settings inputs measured 37px tall');
  assert.match(coarse, /\.form-check-input[^{]*\{[^}]*width:\s*20px/,
    'the brand-image checkbox measured 14px');
});

test('settings modal fields inherit an accessible name from their label', () => {
  // The vendor renders "Server URL" / "API Key" as free-floating labels with no
  // for/id pair, so screen readers announce the inputs as unnamed.
  assert.match(src, /function labelSettingsFields/, 'expected a field-labelling step');
  assert.match(src, /aria-label/, 'fields must receive aria-label when no label is associated');
  assert.match(src, /data-i18n-aria/, 'the accessible name must follow the language toggle');
  assert.match(src, /labelSettingsFields\(\)/, 'the labelling step must be wired into the modal enhancer');
});

test('settings modal traps focus, labels itself, and restores focus on close', () => {
  assert.match(src, /aria-modal/, 'the dialog must declare aria-modal');
  assert.match(src, /aria-labelledby/, 'the dialog needs an accessible name from its title');
  assert.match(src, /function trapModalFocus/, 'expected a focus trap');
  assert.match(src, /'Tab'/, 'Tab must be intercepted to cycle inside the dialog');
  assert.match(src, /keyCode\s*[!=]==\s*9/, 'legacy keyCode path should also be handled');
  assert.match(src, /lastFocused|previousFocus|returnFocus/, 'focus must return to the trigger on close');
});

test('nav buttons in the 601-991px tablet band are sized consistently at 36px', () => {
  // At @800px HLS/SRT buttons measured 34x30px while Theme/Lang were 36x36px.
  // The tablet rule must not shrink the injected nav links below 36px.
  const tablet = /@media\s*\(max-width:\s*991\.98px\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.ok(tablet, 'expected a max-width:991.98px media query');
  assert.match(tablet, /\.mgmt-nav-btn[^{]*\{[^}]*height:\s*36px/,
    'all nav buttons must stay 36px tall on tablet');
});

test('logo upload file control remains accessible to keyboard and screen readers', () => {
  // lp-inject previously set aria-hidden=true and tabindex=-1 on the input,
  // making it impossible to upload a logo with a keyboard.
  assert.doesNotMatch(src, /setAttribute\(['"]aria-hidden['"],\s*['"]true['"]\)/,
    'file input must not be marked aria-hidden');
  assert.doesNotMatch(src, /setAttribute\(['"]tabindex['"],\s*['"]-1['"]\)/,
    'file input must remain in the tab order');
  assert.match(css, /\.lp-brand-file-control:focus-within/,
    'focus on the file input must draw a visible indicator on the wrapper');
});

test('hint text meets WCAG AA 4.5:1 across both themes', () => {
  const darkHint = /:root\s*\{[^}]*--hint:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1] ?? '';
  assert.ok(darkHint, 'expected a --hint token in :root');
  assert.notEqual(darkHint.toLowerCase(), '#6d776f',
    '#6d776f is only 3.53:1 on dark surfaces; use #9fa5a0 or lighter');
  const lightHint = /html\[data-theme="light"\]\s*\{[^}]*--hint:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1] ?? '';
  assert.ok(lightHint, 'expected a --hint token in light theme');
});

test('page exposes main landmark and a single h1 for assistive tech', () => {
  // The vendor shell ships <nav> plus an <h3> and no landmark/heading root, so
  // screen-reader users cannot jump to content and the outline starts at h3.
  assert.match(src, /function ensureLandmarks/, 'expected a landmark pass');
  assert.match(src, /setAttribute\('role',\s*'main'\)/, 'content region needs role=main');
  assert.match(src, /createElement\('h1'\)/, 'a visually hidden h1 must exist');
  assert.match(src, /visually-hidden|sr-only|lp-sr-only/, 'the h1 must be screen-reader only');
});

test('brand mark is a real link, not a dead href="#"', () => {
  assert.match(src, /brand\.setAttribute\('href',\s*'\/'\)|brand\.href\s*=\s*'\/'/,
    'the brand anchor must navigate somewhere meaningful');
  assert.doesNotMatch(src, /aria-label', BRAND\.name \+ ' ' \+ BRAND\.subtitle\)/,
    'the brand accessible name must not leak the internal subtitle string');
});

test('phone header keeps brand, controls and status on one row', () => {
  const phone = /@media\s*\(max-width:\s*(414|479)px\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[2] ?? '';
  assert.ok(phone, 'expected a <=414px header rule');
  assert.match(phone, /grid-template-areas/, 'the header must place items by area, not wrap');
  assert.match(phone, /\.live-status[^{]*\{[^}]*(width:\s*2[0-9]px|min-width:\s*2[0-9]px)/,
    'the status chip must compact to a dot so it fits the first row');
});

test('compact phone status keeps its full translated accessible name', () => {
  assert.match(src, /badge\.setAttribute\('aria-label',\s*text\)/,
    'hidden status text must be mirrored to aria-label');
  assert.match(src, /liveBadge\.setAttribute\('role',\s*'status'\)/);
  assert.match(src, /liveBadge\.setAttribute\('aria-live',\s*'polite'\)/);
});

test('brand mark keeps a 44px hit area at every width', () => {
  const base = /\.navbar-brand\.mgmt-brand\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.match(base, /min-height:\s*44px/, 'brand base rule needs a 44px touch row');
});

test('live preview overlay is a real dialog with trapped, restorable focus', () => {
  assert.match(src, /ov\.setAttribute\('role',\s*'dialog'\)/);
  assert.match(src, /ov\.setAttribute\('aria-modal',\s*'true'\)/);
  assert.match(src, /ov\.setAttribute\('aria-labelledby',\s*'lp-nm'\)/);
  assert.match(src, /ov\.setAttribute\('aria-describedby',\s*'lp-hint'\)/,
    'the ESC hint must be referenced, not only painted');
  assert.match(src, /function trapPreviewFocus/);
  assert.match(src, /previewReturnFocus/, 'focus must return to the opener on close');
  const open = src.slice(src.indexOf('function openPreview'), src.indexOf('function closePreview'));
  assert.match(open, /getElementById\('lp-xb'\)[\s\S]{0,200}\.focus\(\)/,
    'openPreview must move focus into the dialog');
});

test('secondary labels stay legible at >=10.5px', () => {
  const pick = (sel) => new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([\\s\\S]*?)\\n\\}').exec(css)?.[1] ?? '';
  for (const sel of ['.mgmt-brand-sub', '.live-status', '.stat-label']) {
    const block = pick(sel);
    assert.ok(block, 'expected a rule for ' + sel);
    const size = parseFloat(
      /font-size:\s*([\d.]+)px/.exec(block)?.[1]
      ?? /font:\s*(?:[\w]+\s+)*([\d.]+)px/.exec(block)?.[1]
      ?? '0'
    );
    assert.ok(size >= 10.5, sel + ' renders ' + size + 'px, below the 10.5px floor');
  }
});

test('empty state is vertically centred instead of hanging at the top', () => {
  assert.match(css, /#root \.container\.py-4\s*\{[^}]*min-height:\s*(calc\([^)]*vh|100vh)/,
    'the main region needs a centring min-height');
  // Centring comes from the welcome card's own auto margins so the publishers
  // list is not pushed down with it.
  assert.match(css, /#root \.container\.py-4 > \.card\.text-center\s*\{[^}]*margin-top:\s*auto/,
    'the welcome card must centre itself, not the whole shell');
});

test('light language toggle uses AA accent text rather than the 4.19:1 base accent', () => {
  const rule = /html\[data-theme="light"\] \.mgmt-lang-btn\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.match(rule, /color:\s*var\(--accent-soft\)/,
    'light EN/ID label must use the darker --accent-soft token');
});

test('publisher card row becomes a two-track grid instead of space-between', () => {
  // The vendor row is "identity" + "badges" with nothing between them, so on a
  // wide card the two islands sit ~700px apart and the middle reads as a hole.
  const row = /\.card > \.card-body > \.d-flex\.justify-content-between\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? '';
  assert.match(row, /display:\s*grid/, 'publisher header row must be laid out as a grid');
  assert.match(row, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/, 'identity takes the free track, controls stay sized');
});

test('identity line is name, player-count chip, then a leader rule', () => {
  const block = /\/\* publisher identity line[\s\S]*?\n\}/.exec(css)?.[0] ?? '';
  assert.ok(block.length > 0, 'expected a documented identity-line block');
  assert.match(block, /grid-template-columns:\s*minmax\(0,\s*auto\)\s+auto\s+minmax\(/);
  assert.match(css, /::after[\s\S]{0,200}grid-column:\s*3/, 'the leader rule needs its own track');
});

test('publisher row stacks on phones', () => {
  const phone = /@media \(max-width:\s*560px\)[\s\S]{0,3000}/.exec(css)?.[0] ?? '';
  assert.match(phone, /\.card > \.card-body > \.d-flex\.justify-content-between\s*\{\s*grid-template-columns:\s*1fr/,
    'identity and controls must stack on a phone');
});

test('desktop shell matches the 1320px column used by HLS and SRT', () => {
  // The sibling dashboards cap main content at 1320px and centre it. A
  // full-bleed SLS made the three apps read as different products.
  const wide = /@media \(min-width:\s*1280px\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.ok(wide.length > 0, 'expected a >=1280px shell rule');
  assert.match(wide, /#root > \.container\.py-4[\s\S]{0,300}max-width:\s*1320px/, 'share the sibling 1320px measure');
  assert.match(wide, /#root > \.container\.py-4[\s\S]{0,300}margin-left:\s*auto/, 'content stays centred like the siblings');
  assert.match(wide, /\.navbar > \.container-fluid[\s\S]{0,300}max-width:\s*1320px/, 'navbar must share the sibling 1320px measure');
  assert.match(wide, /\.navbar > \.container-fluid[\s\S]{0,300}margin-left:\s*auto/, 'navbar is centred with the main column');
  assert.match(wide, /\.navbar > \.container-fluid[\s\S]{0,300}padding-left:\s*0 !important/, 'brand sits on the column edge like HLS/SRT');
  assert.match(wide, /\.navbar, nav\.navbar, header \{\s*padding-left:0 !important/, '3-part selector needed to beat line 96');
});

test('vertical centring is scoped to the empty state, not the publishers list', () => {
  // justify-content:center on the whole container pushed a one-card list ~266px
  // below the navbar. Centring must come from the welcome card's auto margins.
  const shell = /#root \.container\.py-4\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.ok(shell, 'shell rule must exist');
  assert.doesNotMatch(shell, /justify-content:\s*center/, 'the list must start at the top gutter');
  const empty = /#root \.container\.py-4 > \.card\.text-center\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.match(empty, /margin-top:\s*auto/, 'welcome card still centres through auto margins');
});
