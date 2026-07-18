/**
 * srtla-hls-manager — Dynamic multi-stream HLS transcoder
 *
 * Polls the SLS stats API every POLL_INTERVAL seconds.
 * For each active publisher it spawns a dedicated FFmpeg process that
 * pulls the SRT stream and writes HLS segments to:
 *   {HLS_PATH}/{safe_stream_id}/stream.m3u8
 *
 * Fixes applied:
 *  - Removed -re flag (was throttling live stream input)
 *  - rmSync moved to proc.on('close') to avoid corrupt writes
 *  - Self-scheduling reconcile() to prevent overlap
 *  - Exponential backoff retry on FFmpeg crash
 *  - Native fetch (Node 20) — no node-fetch dependency
 *  - HTTP health endpoint at :9090/health
 */

import { spawn }      from 'child_process';
import { mkdirSync, rmSync } from 'fs';
import { join }       from 'path';
import { createServer } from 'http';

// ── Configuration ─────────────────────────────────────────────────────────────
const SLS_STATS_URL = process.env.SLS_STATS_URL || 'http://receiver:8080/stats';
const SRT_HOST      = process.env.SRT_HOST      || 'receiver';
const SRT_PORT      = process.env.SRT_PORT      || '4000';
const HLS_PATH      = process.env.HLS_PATH      || '/hls';
const HLS_TIME      = process.env.HLS_TIME      || '2';
const HLS_LIST_SIZE = process.env.HLS_LIST_SIZE || '5';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '5', 10) * 1000;
const HEALTH_PORT   = parseInt(process.env.HEALTH_PORT   || '9090', 10);
const MAX_RETRIES   = parseInt(process.env.MAX_RETRIES   || '10', 10);

// ── State: id → { proc, dir, retryCount, retryTimer } ────────────────────────
const activeStreams = new Map();
let   isShuttingDown = false;

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeId(streamId) {
  return streamId.replace(/[^a-zA-Z0-9_\-]/g, '_');
}

function log(level, ...args) {
  const ts = new Date().toISOString();
  console[level](`[${ts}] [hls-manager]`, ...args);
}

// ── Fetch publishers from SLS — uses Node 20 native fetch ─────────────────────
async function fetchPublishers() {
  try {
    const res = await fetch(SLS_STATS_URL, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = data.publishers || data.Publishers || [];
    // Only truly active streams (bitrate > 0)
    return list.filter(p => (p.bitrate || p.recv_bitrate || 0) > 0);
  } catch (err) {
    log('warn', 'Failed to fetch stats:', err.message);
    return null; // null = keep current state, don't stop anything
  }
}

// ── Start FFmpeg for one stream ───────────────────────────────────────────────
function startStream(streamId, playKey, retryCount = 0) {
  if (isShuttingDown) return;

  const safe   = safeId(streamId);
  const dir    = join(HLS_PATH, safe);
  const m3u8   = join(dir, 'stream.m3u8');
  const segPat = join(dir, 'seg_%05d.ts');

  mkdirSync(dir, { recursive: true });

  const srtId  = playKey || streamId;
  const srtUrl = `srt://${SRT_HOST}:${SRT_PORT}?streamid=${srtId}&mode=caller&latency=200`;

  log('info', `▶ Starting HLS for [${streamId}]${retryCount > 0 ? ` (retry #${retryCount})` : ''}`);

  const args = [
    '-hide_banner', '-loglevel', 'warning',

    // ✅ FIX #1: NO -re flag for live input (it throttles to real-time → latency/frame-drop)
    // Low-latency live ingest flags instead:
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

  // ✅ FIX #2: rmSync moved here — runs AFTER process fully exits, no corrupt writes
  proc.on('close', (code, signal) => {
    log('info', `■ FFmpeg [${streamId}] exited (code=${code}, signal=${signal})`);

    const entry = activeStreams.get(streamId);
    if (!entry || entry.proc !== proc) return; // stale event, ignore

    // Safe cleanup — process has exited, safe to delete
    try {
      rmSync(entry.dir, { recursive: true, force: true });
      log('info', `  Cleaned up: ${entry.dir}`);
    } catch (err) {
      log('warn', `  Cleanup failed for ${entry.dir}:`, err.message);
    }

    activeStreams.delete(streamId);

    // ✅ FIX #5: Exponential backoff retry on unexpected crash
    // Don't retry if: shutting down, killed by us (SIGTERM/SIGKILL), or max retries reached
    const isOurKill = signal === 'SIGTERM' || signal === 'SIGKILL';
    if (!isShuttingDown && !isOurKill && code !== 0 && retryCount < MAX_RETRIES) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // max 30s
      log('info', `  Will retry [${streamId}] in ${(delay / 1000).toFixed(0)}s (${retryCount + 1}/${MAX_RETRIES})`);
      const timer = setTimeout(() => {
        if (!activeStreams.has(streamId)) {
          startStream(streamId, playKey, retryCount + 1);
        }
      }, delay);
      // Store in map so timer can be cancelled on shutdown
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

  // Cancel any pending retry timer first
  if (entry.retryTimer) {
    clearTimeout(entry.retryTimer);
  }

  if (entry.proc) {
    // SIGTERM → proc.on('close') will handle cleanup
    entry.proc.kill('SIGTERM');
    setTimeout(() => { try { entry.proc?.kill('SIGKILL'); } catch (_) {} }, 3000);
  } else {
    // Waiting to retry, no active proc — clean up manually
    try { rmSync(entry.dir, { recursive: true, force: true }); } catch (_) {}
    activeStreams.delete(streamId);
  }
}

// ── Reconciliation loop ───────────────────────────────────────────────────────
// ✅ FIX #4: self-scheduling (not setInterval) — prevents overlap if fetch is slow
async function reconcile() {
  if (!isShuttingDown) {
    try {
      const publishers = await fetchPublishers();

      if (publishers !== null) {
        const liveIds  = new Set();
        const playKeys = {};

        for (const p of publishers) {
          const id = p.id || p.stream_id
            || `${p.app || 'live'}/${p.stream || p.name || 'stream'}`;
          liveIds.add(id);
          playKeys[id] = p.play_key || p.playKey || id;
        }

        // Stop streams that ended (skip entries currently in retry-wait state)
        for (const [id, entry] of activeStreams.entries()) {
          if (!liveIds.has(id) && entry.proc !== null) {
            stopStream(id);
          }
        }

        // Start newly active streams
        for (const id of liveIds) {
          if (!activeStreams.has(id)) {
            startStream(id, playKeys[id]);
          }
        }

        const running = [...activeStreams.entries()]
          .filter(([, e]) => e.proc !== null)
          .map(([id]) => id);
        log('info', `Active: [${running.join(', ') || 'none'}]`);
      }
    } catch (err) {
      log('error', 'Reconcile error:', err.message);
    }

    // Schedule next run after this one completes (not concurrent)
    setTimeout(reconcile, POLL_INTERVAL);
  }
}

// ── HTTP Health Server ────────────────────────────────────────────────────────
// ✅ FIX #15: Expose /health endpoint for monitoring and nginx proxy
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
      const body = JSON.stringify({
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        totalManaged:  activeStreams.size,
        running:       streams.filter(s => s.status === 'running').length,
        retrying:      streams.filter(s => s.status === 'retrying').length,
        streams,
      }, null, 2);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found. Available: GET /health');
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
log('info', `Max retries  : ${MAX_RETRIES}`);

startHealthServer();
reconcile(); // self-scheduling — no setInterval
