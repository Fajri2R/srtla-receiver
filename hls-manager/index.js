/**
 * srtla-hls-manager — Dynamic multi-stream HLS transcoder
 *
 * Polls the SLS stats API every POLL_INTERVAL seconds.
 * For each active publisher it spawns a dedicated ffmpeg process that
 * pulls the SRT stream and writes HLS segments to:
 *   {HLS_PATH}/{safe_stream_id}/stream.m3u8
 *
 * When a stream goes offline the corresponding ffmpeg process is killed
 * and its HLS directory is cleaned up.
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import fetch from 'node-fetch';

// ── Configuration (from environment) ──────────────────────────────────────────
const SLS_STATS_URL  = process.env.SLS_STATS_URL  || 'http://receiver:8080/stats';
const SRT_HOST       = process.env.SRT_HOST       || 'receiver';
const SRT_PORT       = process.env.SRT_PORT       || '4000';
const HLS_PATH       = process.env.HLS_PATH       || '/hls';
const HLS_TIME       = process.env.HLS_TIME       || '2';
const HLS_LIST_SIZE  = process.env.HLS_LIST_SIZE  || '5';
const POLL_INTERVAL  = parseInt(process.env.POLL_INTERVAL || '5', 10) * 1000;

// ── State: map of stream-id → { proc, dir } ───────────────────────────────────
const activeStreams = new Map(); // id → { proc: ChildProcess, dir: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert a stream ID (e.g. "live/stream_abc123") to a safe filesystem name.
 * Slashes become underscores, everything else stays alphanumeric/dash/underscore.
 */
function safeId(streamId) {
  return streamId.replace(/[^a-zA-Z0-9_\-]/g, '_');
}

function log(level, ...args) {
  const ts = new Date().toISOString();
  console[level](`[${ts}] [hls-manager]`, ...args);
}

// ── Fetch current publishers from SLS stats ───────────────────────────────────
async function fetchPublishers() {
  try {
    const res = await fetch(SLS_STATS_URL, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Normalise: SLS may return publishers or Publishers
    const list = data.publishers || data.Publishers || [];
    return list.filter(p => {
      const br = p.bitrate || p.recv_bitrate || 0;
      return br > 0; // Only truly active (streaming) publishers
    });
  } catch (err) {
    log('warn', 'Failed to fetch stats:', err.message);
    return null; // null = fetch failed, don't remove existing streams
  }
}

// ── Start FFmpeg for one stream ───────────────────────────────────────────────
function startStream(streamId, playKey) {
  const safe = safeId(streamId);
  const dir  = join(HLS_PATH, safe);
  const m3u8 = join(dir, 'stream.m3u8');
  const segPat = join(dir, 'seg_%05d.ts');

  mkdirSync(dir, { recursive: true });

  // Use the play key (output side) if available, else use the raw stream id
  const srtStreamId = playKey || streamId;
  const srtUrl = `srt://${SRT_HOST}:${SRT_PORT}?streamid=${srtStreamId}&mode=caller&latency=200`;

  log('info', `▶ Starting HLS for [${streamId}]`);
  log('info', `  SRT URL  : ${srtUrl}`);
  log('info', `  HLS dir  : ${dir}`);

  const args = [
    '-hide_banner', '-loglevel', 'warning',
    '-re',
    '-i', srtUrl,
    '-c:v', 'copy',
    '-c:a', 'copy',
    '-f', 'hls',
    '-hls_time', HLS_TIME,
    '-hls_list_size', HLS_LIST_SIZE,
    '-hls_flags', 'delete_segments+append_list+independent_segments',
    '-hls_segment_filename', segPat,
    m3u8,
  ];

  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  proc.stdout.on('data', d => log('info', `[${streamId}] ${d.toString().trim()}`));
  proc.stderr.on('data', d => {
    const msg = d.toString().trim();
    if (msg) log('warn', `[${streamId}] ${msg}`);
  });

  proc.on('close', (code, signal) => {
    log('info', `■ FFmpeg for [${streamId}] exited (code=${code}, signal=${signal})`);
    // If it crashed unexpectedly, remove it from the map so next poll restarts it
    if (activeStreams.get(streamId)?.proc === proc) {
      activeStreams.delete(streamId);
    }
  });

  proc.on('error', err => {
    log('error', `Failed to spawn ffmpeg for [${streamId}]:`, err.message);
    activeStreams.delete(streamId);
  });

  activeStreams.set(streamId, { proc, dir });
}

// ── Stop FFmpeg for one stream ────────────────────────────────────────────────
function stopStream(streamId) {
  const entry = activeStreams.get(streamId);
  if (!entry) return;

  log('info', `■ Stopping HLS for [${streamId}]`);
  entry.proc.kill('SIGTERM');

  // Give it 3 seconds, then force-kill
  setTimeout(() => {
    try { entry.proc.kill('SIGKILL'); } catch (_) {}
  }, 3000);

  // Clean up HLS segments
  try {
    rmSync(entry.dir, { recursive: true, force: true });
  } catch (err) {
    log('warn', `Could not clean up dir ${entry.dir}:`, err.message);
  }

  activeStreams.delete(streamId);
}

// ── Main reconciliation loop ──────────────────────────────────────────────────
async function reconcile() {
  const publishers = await fetchPublishers();
  if (publishers === null) return; // Stats API unreachable — keep current state

  const liveIds = new Set(publishers.map(p => {
    return p.id || p.stream_id || `${p.app || 'live'}/${p.stream || p.name || 'stream'}`;
  }));

  // Build a map: streamId → playKey (for SRT pulling)
  const playKeys = {};
  for (const p of publishers) {
    const id = p.id || p.stream_id || `${p.app || 'live'}/${p.stream || p.name || 'stream'}`;
    // SLS sometimes provides a separate play_key; fallback to the stream id itself
    playKeys[id] = p.play_key || p.playKey || id;
  }

  // Stop streams that are no longer active
  for (const id of activeStreams.keys()) {
    if (!liveIds.has(id)) {
      stopStream(id);
    }
  }

  // Start streams that are newly active
  for (const id of liveIds) {
    if (!activeStreams.has(id)) {
      startStream(id, playKeys[id]);
    }
  }

  log('info', `Active: [${[...activeStreams.keys()].join(', ') || 'none'}]`);
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown() {
  log('info', 'Shutting down — stopping all FFmpeg processes...');
  for (const id of [...activeStreams.keys()]) {
    stopStream(id);
  }
  setTimeout(() => process.exit(0), 4000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

// ── Bootstrap ─────────────────────────────────────────────────────────────────
mkdirSync(HLS_PATH, { recursive: true });

log('info', '=== SRTla HLS Manager starting ===');
log('info', `Stats URL    : ${SLS_STATS_URL}`);
log('info', `SRT source   : srt://${SRT_HOST}:${SRT_PORT}`);
log('info', `HLS output   : ${HLS_PATH}`);
log('info', `Poll interval: ${POLL_INTERVAL / 1000}s`);

// Initial run immediately, then on interval
reconcile();
setInterval(reconcile, POLL_INTERVAL);
