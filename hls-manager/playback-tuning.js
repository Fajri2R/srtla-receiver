// Playback tuning shared by the FFmpeg writer and the browser player.
//
// The failure this file guards against: with 2s segments and a 5-segment list
// the live window is 10s. One network hiccup pushes the live edge past the
// fragment a viewer still needs, that segment is already deleted, and the
// player freezes on a 404 while it re-buffers from scratch. Every value here
// exists to keep the window and the player's buffer from meeting at the edge.

export const DEFAULT_HLS_TIME = 2;
// 12 x 2s = 24s of live window: enough for a stalled viewer to catch up
// without keeping so much history that a late joiner starts far behind.
export const DEFAULT_HLS_LIST_SIZE = 12;
export const DEFAULT_OFFLINE_GRACE_SECONDS = 30;

export const PLAYER_TUNING = {
  // Depth of media held ahead of the playhead. Below ~3 segments every
  // playlist refresh at the live edge drains the buffer and stalls.
  maxBufferLength: 30,
  maxMaxBufferLength: 60,
  backBufferLength: 15,
  // Start two segments behind the edge, keeping one segment of catch-up room
  // instead of sitting exactly on the edge where every refresh outruns us.
  liveSyncDurationCount: 2,
  liveMaxLatencyDurationCount: 6,
  maxLiveSyncPlaybackRate: 1.5,
  fragLoadingMaxRetry: 8,
  fragLoadingRetryDelay: 500,
  fragLoadingMaxRetryTimeout: 8000,
  manifestLoadingMaxRetry: 8,
  manifestLoadingRetryDelay: 1000,
  levelLoadingMaxRetry: 8,
};

export function buildFfmpegArgs({
  srtUrl,
  segPat,
  m3u8,
  hlsTime = DEFAULT_HLS_TIME,
  hlsListSize = DEFAULT_HLS_LIST_SIZE,
  videoArgs,
  audioArgs,
}) {
  return [
    '-hide_banner', '-loglevel', 'warning',
    // No +genpts: regenerating timestamps on a stream copy rewrites DTS and
    // produces "DTS out of order" plus corrupt packets on every reconnect.
    '-fflags', '+nobuffer', '-flags', 'low_delay',
    '-progress', 'pipe:3', '-stats_period', '1', '-nostats',
    '-i', srtUrl,
    ...videoArgs, ...audioArgs,
    '-f', 'hls',
    '-hls_time', String(hlsTime),
    '-hls_list_size', String(hlsListSize),
    // omit_endlist keeps the playlist live: with EXT-X-ENDLIST players treat
    // the stream as finished and stop fetching new segments.
    '-hls_flags', 'delete_segments+append_list+independent_segments+omit_endlist',
    '-hls_delete_threshold', '2',
    '-hls_allow_cache', '0',
    '-hls_segment_filename', segPat,
    m3u8,
  ];
}

// Deleting the directory resets the media sequence to 0 while browsers still
// hold the previous playlist, so every follower 404s until it reloads from
// scratch. Only an explicit stop or a fatal exit may wipe the segments.
export function purgeOnExit({ explicitStop = false, willRetry = false } = {}) {
  if (willRetry) return false;
  return true;
}
