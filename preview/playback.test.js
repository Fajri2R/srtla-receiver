import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

// The player config must match hls-manager/playback-tuning.js. Duplicating the
// numbers in two languages is how they drifted apart in the first place, so the
// contract is asserted here as well as in the manager suite.
test('player buffers deep enough for a 2s-segment live playlist', () => {
  const cfg = /new Hls\(\{([\s\S]*?)\n\s{4}\}\)/.exec(html)?.[1] ?? '';
  assert.ok(cfg, 'the player must construct an Hls instance with a config block');
  const num = (key) => {
    const m = new RegExp(`${key}\\s*:\\s*(\\d+)`).exec(cfg);
    return m ? Number(m[1]) : null;
  };
  assert.ok(num('maxBufferLength') >= 24,
    'maxBufferLength must cover several segments or every live-edge refresh stalls');
  assert.ok(num('fragLoadingMaxRetry') >= 6,
    'fragment loads must retry through a short network hiccup');
  assert.ok(num('manifestLoadingMaxRetry') >= 6,
    'manifest loads must retry while the transcoder restarts');
  assert.equal(num('liveSyncDurationCount'), 2,
    'sync two segments behind the edge keeps one segment of catch-up headroom');
  assert.ok(num('backBufferLength') >= 10, 'a small back buffer forces a re-seek after stalls');
});

test('a stalled player recovers in place instead of showing a frozen frame', () => {
  // A live stream that stops buffering looks identical to a paused one, so the
  // page must watch for the stall and nudge playback back to the live edge.
  assert.match(html, /addEventListener\(\s*['"]waiting['"]/,
    'the page must react to a stalled video element');
  assert.match(html, /addEventListener\(\s*['"]stalled['"]/,
    'the page must react to a stalled network fetch');
  assert.match(html, /startLoad\(\)|recoverMediaError\(\)/,
    'recovery must reload the stream or recover the media source');
});

test('playback resumes at the live edge after a tab was hidden', () => {
  assert.match(html, /liveSyncPosition/,
    'recovery must seek to the live edge, not to the stale buffer position');
});

test('the retry ladder for a dead transcoder is bounded and user-visible', () => {
  const retry = /retryAttempt\s*<\s*(\d+)/.exec(html);
  assert.ok(retry, 'the player must cap its retries');
  assert.ok(Number(retry[1]) >= 5, 'a transcode restart needs a few attempts before giving up');
  assert.match(html, /retrying in/,
    'the overlay must say a retry is in progress so a stall is not unexplained');
});
