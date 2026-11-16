import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFfmpegArgs, purgeOnExit, PLAYER_TUNING } from './playback-tuning.js';

// A live viewer buffers from a playlist window. With 2s segments and a list
// size of 5 the window is only 10s: one network hiccup moves the live edge
// past the fragment the player still needs, the segment is already deleted,
// and the player freezes on a 404 while it re-buffers from scratch. The
// window must carry enough headroom for a stalled viewer to catch up.
test('live window keeps at least 20 seconds of segments for a stalled viewer', () => {
  const args = buildFfmpegArgs({
    srtUrl: 'srt://receiver:4000?streamid=play_test',
    segPat: '/hls/test/seg_%05d.ts',
    m3u8: '/hls/test/stream.m3u8',
    videoArgs: ['-c:v', 'copy'],
    audioArgs: ['-c:a', 'copy'],
  });
  const listIndex = args.indexOf('-hls_list_size');
  assert.equal(listIndex > -1, true, 'ffmpeg must receive -hls_list_size');
  const listSize = Number(args[listIndex + 1]);
  const segTime = Number(args[args.indexOf('-hls_time') + 1]);
  assert.ok(listSize * segTime >= 20,
    `default window is ${listSize * segTime}s, needs >= 20s so a stalled viewer can recover`);
});

test('playlist marks itself complete-less and prunes old segments', () => {
  const args = buildFfmpegArgs({
    srtUrl: 'srt://receiver:4000?streamid=play_test',
    segPat: '/hls/test/seg_%05d.ts',
    m3u8: '/hls/test/stream.m3u8',
    hlsTime: 2,
    hlsListSize: 12,
    videoArgs: ['-c:v', 'copy'],
    audioArgs: ['-c:a', 'copy'],
  });
  const flags = args[args.indexOf('-hls_flags') + 1];
  assert.match(flags, /delete_segments/, 'old segments must be pruned');
  assert.match(flags, /omit_endlist/,
    'a live playlist must omit EXT-X-ENDLIST or players treat it as ended');
  assert.match(flags, /independent_segments/,
    'segments must declare independent decoding for mid-stream joins');
});

test('timestamps are not regenerated on a stream-copy pipeline', () => {
  const args = buildFfmpegArgs({
    srtUrl: 'srt://receiver:4000?streamid=play_test',
    segPat: '/hls/test/seg_%05d.ts',
    m3u8: '/hls/test/stream.m3u8',
    hlsTime: 2,
    hlsListSize: 12,
    videoArgs: ['-c:v', 'copy'],
    audioArgs: ['-c:a', 'copy'],
  });
  const fflags = args[args.indexOf('-fflags') + 1];
  assert.doesNotMatch(fflags, /\+genpts/,
    '+genpts rewrites DTS on copy and produces "DTS out of order" / corrupt packets');
});

// A publisher blip must not wipe the segment directory: the retry then starts
// at media sequence 0 while browsers still hold the old playlist, so every
// follower 404s until it reloads from scratch.
test('a retry keeps the previous segments instead of resetting the sequence', () => {
  assert.equal(purgeOnExit({ explicitStop: false, willRetry: true }), false,
    'a pending retry must keep the playlist and its segments');
  assert.equal(purgeOnExit({ explicitStop: true, willRetry: false }), true,
    'an explicit stop must clean the stream directory');
  assert.equal(purgeOnExit({ explicitStop: false, willRetry: false }), true,
    'a fatal exit with no retry must clean up');
});

test('player tuning buffers deep enough for a 2s-segment live playlist', () => {
  assert.ok(PLAYER_TUNING.maxBufferLength >= 24,
    'maxBufferLength must cover several segments or every reload stalls');
  assert.ok(PLAYER_TUNING.backBufferLength >= 10,
    'a small back buffer forces a seek after every brief stall');
  assert.equal(PLAYER_TUNING.liveSyncDurationCount, 2,
    'sync two segments behind the edge keeps one segment of catch-up headroom');
  assert.ok(PLAYER_TUNING.fragLoadingMaxRetry >= 6,
    'fragment loads must retry through a short network hiccup');
  assert.ok(PLAYER_TUNING.manifestLoadingMaxRetry >= 6,
    'manifest loads must retry while the transcoder restarts');
});
