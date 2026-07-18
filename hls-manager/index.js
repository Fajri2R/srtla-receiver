/**
 * srtla-hls-manager — Dynamic multi-stream HLS transcoder
 *
 * Polls the SLS stats API every POLL_INTERVAL seconds.
 * Detects active publishers and spawns a dedicated FFmpeg process per stream.
 * Uses the SLS stream-ids API to resolve publisher→player stream ID mapping.
 *
 * SLS-specific field notes (confirmed from source):
 *   - Bitrate field : "kbitrate" (kb/s) — NOT "bitrate"
 *   - Stream ID     : "stream_name"     — NOT "id"
 *   - Player key    : fetched from GET /stream-ids (publisher ≠ player in DB)
 */

import { spawn }              from 'child_process';
import { mkdirSync, rmSync }  from 'fs';
import { join }               from 'path';
import { createServer }       from 'http';

// ── Configuration ─────────────────────────────────────────────────────────────
const SLS_STATS_URL   = process.env.SLS_STATS_URL   || 'http://receiver:8080/stats';
const SLS_STREAMS_URL = process.env.SLS_STREAMS_URL || 'http://receiver:8080/stream-ids';
const SRT_HOST        = process.env.SRT_HOST        || 'receiver';
const SRT_PORT        = process.env.SRT_PORT        || '4000';
const HLS_PATH        = process.env.HLS_PATH        || '/hls';
const HLS_TIME        = process.env.HLS_TIME        || '2';
const HLS_LIST_SIZE   = process.env.HLS_LIST_SIZE   || '5';
const POLL_INTERVAL   = parseInt(process.env.POLL_INTERVAL || '5', 10) * 1000;
const HEALTH_PORT     = parseInt(process.env.HEALTH_PORT   || '9090', 10);
const MAX_RETRIES     = parseInt(process.env.MAX_RETRIES   || '10', 10);
const SRT_LATENCY     = process.env.SRT_LATENCY     || '200';

// ── State: id → { proc, dir, retryCount, retryTimer } ────────────────────────
const activeStreams  = new Map();
let   isShuttingDown = false;

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeId(streamId) {
  return streamId.replace(/[^a-zA-Z0-9_\-]/g, '_');
}

function log(level, ...args) {
  const ts = new Date().toISOString();
  console[level](`[${ts}] [hls-manager]`, ...args);
}

// ── Fetch active publishers from SLS stats ─────────────────────────────────────
// SLS JSON fields confirmed from source (SLSListener.cpp):
//   stream_name, url, remote_ip, remote_port, start_time, kbitrate, port, role
async function fetchPublishers() {
  try {
    const res = await fetch(SLS_STATS_URL, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Support both wrapper styles
    const list = data.publishers || data.Publishers || [];

    // ✅ BUG FIX #1: SLS uses "kbitrate" (kb/s), NOT "bitrate" or "recv_bitrate"
    // Previously all streams were filtered out because p.bitrate === undefined → 0
    return list.filter(p => {
      const kbr = p.kbitrate || p.bitrate || p.recv_bitrate || 0;
      const num  = typeof kbr === 'string' ? parseFloat(kbr) : kbr;
      return num > 0;
    });
  } catch (err) {
    log('warn', 'fetchPublishers failed:', err.message);
    return null; // null = skip this cycle, don't stop existing streams
  }
}

// ── Fetch publisher → player stream ID mapping from SLS database API ──────────
// SLS stores separate publisher (ingest) and player (playback) stream IDs.
// FFmpeg must connect as a player using the player key, not the publisher key.
async function fetchStreamMap() {
  try {
    const res = await fetch(SLS_STREAMS_URL, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      log('warn', `fetchStreamMap: HTTP ${res.status} — will use stream_name as player key`);
      return {};
    }
    const data = await res.json();

    // Handle both array and wrapped response
    const list = Array.isArray(data) ? data
      : (data.streams || data.stream_ids || data.data || []);

    const map = {};
    for (const s of list) {
      // publisher key → player key
      const pub = s.publisher || s.pub_stream_id || s.publisherId;
      const plr = s.player    || s.play_stream_id || s.playerId;
      if (pub && plr) {
        map[pub] = plr;
        log('info', `  Stream map: "${pub}" → "${plr}"`);
      }
    }
    return map;
  } catch (err) {
    log('warn', 'fetchStreamMap failed:', err.message, '— using stream_name directly');
    return {};
  }
}

// ── Start FFmpeg HLS transcoder for one stream ────────────────────────────────
function startStream(streamId, playerKey, retryCount = 0) {
  if (isShuttingDown) return;

  const safe   = safeId(streamId);
  const dir    = join(HLS_PATH, safe);
  const m3u8   = join(dir, 'stream.m3u8');
  const segPat = join(dir, 'seg_%05d.ts');

  mkdirSync(dir, { recursive: true });

  // FFmpeg connects as a SRT PLAYER to port 4000 using the player stream ID
  const srtUrl = `srt://${SRT_HOST}:${SRT_PORT}?streamid=${encodeURIComponent(playerKey)}&mode=caller&latency=${SRT_LATENCY}`;

  log('info', `▶ Starting HLS for [${streamId}]${retryCount > 0 ? ` (retry #${retryCount})` : ''}`);
  log('info', `  Publisher key : ${streamId}`);
  log('info', `  Player key    : ${playerKey}`);
  log('info', `  SRT URL       : ${srtUrl}`);
  log('info', `  HLS dir       : ${dir}`);

  const args = [
    '-hide_banner', '-loglevel', 'warning',
    // ✅ NO -re flag (was throttling live input to real-time rate → latency/drops)
    '-fflags', '+nobuffer+genpts',
    '-flags',  'low_delay',
    '-i', srtUrl,
    '-c:v', 'copy',
    '-c:a', 'copy',
    '-f', 'hls',
    '-hls_time',      HLS_TIME,
    '-hls_list_size', HLS_LIST_SIZE,
    '-hls_flags',     'delete_segments+append_list+independent_segments',
    '-hls_segment_filename', segPat,
    m3u8,
  ];

  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  proc.stdout.on('data', d => {
    const msg = d.toString().trim();
    if (msg) log('info', `[${streamId}] ${msg}`);
  });
  proc.stderr.on('data', d => {
    const msg = d.toString().trim();
    if (msg) log('warn', `[${streamId}] ${msg}`);
  });

  // ✅ rmSync moved here — runs AFTER process fully exits, prevents corrupt HLS writes
  proc.on('close', (code, signal) => {
    log('info', `■ FFmpeg [${streamId}] exited (code=${code}, signal=${signal})`);
    const entry = activeStreams.get(streamId);
    if (!entry || entry.proc !== proc) return;

    try {
      rmSync(entry.dir, { recursive: true, force: true });
      log('info', `  Cleaned up: ${entry.dir}`);
    } catch (err) {
      log('warn', `  Cleanup failed ${entry.dir}:`, err.message);
    }

    activeStreams.delete(streamId);

    // Retry on unexpected crash (not on our own SIGTERM/SIGKILL)
    const isOurKill = signal === 'SIGTERM' || signal === 'SIGKILL';
    if (!isShuttingDown && !isOurKill && code !== 0 && retryCount < MAX_RETRIES) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      log('info', `  Retry [${streamId}] in ${(delay/1000).toFixed(0)}s (${retryCount+1}/${MAX_RETRIES})`);
      const timer = setTimeout(() => {
        if (!activeStreams.has(streamId)) startStream(streamId, playerKey, retryCount + 1);
      }, delay);
      activeStreams.set(streamId, { proc: null, dir, retryCount, retryTimer: timer });
    }
  });

  proc.on('error', err => {
    log('error', `Failed to spawn ffmpeg for [${streamId}]:`, err.message);
    activeStreams.delete(streamId);
  });

  activeStreams.set(streamId, { proc, dir, retryCount, retryTimer: null });
}

// ── Stop FFmpeg for one stream ────────────────────────────────────────────────
function stopStream(streamId) {
  const entry = activeStreams.get(streamId);
  if (!entry) return;
  log('info', `■ Stopping [${streamId}]`);
  if (entry.retryTimer) clearTimeout(entry.retryTimer);
  if (entry.proc) {
    entry.proc.kill('SIGTERM');
    setTimeout(() => { try { entry.proc?.kill('SIGKILL'); } catch (_) {} }, 3000);
  } else {
    try { rmSync(entry.dir, { recursive: true, force: true }); } catch (_) {}
    activeStreams.delete(streamId);
  }
}

// ── Main reconciliation loop — self-scheduling to prevent overlap ─────────────
async function reconcile() {
  if (!isShuttingDown) {
    try {
      // Fetch both in parallel
      const [publishers, streamMap] = await Promise.all([
        fetchPublishers(),
        fetchStreamMap(),
      ]);

      if (publishers !== null) {
        const liveIds    = new Set();
        const playerKeys = {};

        for (const p of publishers) {
          // ✅ BUG FIX #2: SLS uses "stream_name", not "id"
          const pubId = p.stream_name || p.id || p.stream_id
            || `${p.app || 'live'}/${p.stream || p.name || 'stream'}`;

          liveIds.add(pubId);

          // ✅ BUG FIX #3: Use player key from DB mapping (publisher ≠ player key)
          // Fallback to publisher key if no mapping found (simplest SLS config)
          playerKeys[pubId] = streamMap[pubId] || p.play_key || p.playKey || pubId;
        }

        // Stop streams that went offline (skip retrying ones)
        for (const [id, entry] of activeStreams.entries()) {
          if (!liveIds.has(id) && entry.proc !== null) {
            stopStream(id);
          }
        }

        // Start newly detected streams
        for (const id of liveIds) {
          if (!activeStreams.has(id)) {
            startStream(id, playerKeys[id]);
          }
        }

        const running = [...activeStreams.entries()]
          .filter(([, e]) => e.proc !== null)
          .map(([id]) => id);

        log('info', `Live publishers: ${publishers.length} | HLS active: ${running.length} | Stream map: ${Object.keys(streamMap).length} entries`);
        if (running.length > 0) log('info', `  Transcoding: [${running.join(', ')}]`);
      }
    } catch (err) {
      log('error', 'Reconcile error:', err.message);
    }

    setTimeout(reconcile, POLL_INTERVAL);
  }
}

// ── HTTP Health / Status Endpoint ─────────────────────────────────────────────
function startHealthServer() {
  const server = createServer((req, res) => {
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }

    if (req.url === '/health') {
      const streams = [...activeStreams.entries()].map(([id, e]) => ({
        id,
        safeId:     safeId(id),
        status:     e.proc !== null ? 'running' : 'retrying',
        retryCount: e.retryCount || 0,
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status:        'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        running:       streams.filter(s => s.status === 'running').length,
        retrying:      streams.filter(s => s.status === 'retrying').length,
        streams,
      }, null, 2));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Available: GET /health');
    }
  });

  server.listen(HEALTH_PORT, '0.0.0.0', () => {
    log('info', `Health endpoint : http://0.0.0.0:${HEALTH_PORT}/health`);
  });
  server.on('error', err => log('warn', `Health server error: ${err.message}`));
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log('info', 'Shutting down...');
  for (const id of [...activeStreams.keys()]) stopStream(id);
  setTimeout(() => process.exit(0), 4000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

// ── Bootstrap ─────────────────────────────────────────────────────────────────
mkdirSync(HLS_PATH, { recursive: true });

log('info', '=== SRTla HLS Manager v2 starting ===');
log('info', `Stats URL     : ${SLS_STATS_URL}`);
log('info', `Stream IDs URL: ${SLS_STREAMS_URL}`);
log('info', `SRT player    : srt://${SRT_HOST}:${SRT_PORT}`);
log('info', `HLS output    : ${HLS_PATH}`);
log('info', `Poll interval : ${POLL_INTERVAL/1000}s`);

startHealthServer();
reconcile();
