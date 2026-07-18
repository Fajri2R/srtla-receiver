/**
 * srtla-hls-manager -- Dynamic multi-stream HLS transcoder
 * AUTO-DISCOVERS the correct SLS HTTP stats endpoint by probing candidates.
 */
import { spawn }             from 'child_process';
import { mkdirSync, rmSync } from 'fs';
import { join }              from 'path';
import { createServer }      from 'http';

// -- Configuration ------------------------------------------------------------
const SLS_STATS_URL   = process.env.SLS_STATS_URL   || 'http://receiver:8080/stat';
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

// -- Stat endpoint candidates (probed in order, first JSON winner cached) -----
const STAT_CANDIDATES = [
  SLS_STATS_URL,
  'http://receiver:8080/stat',
  'http://receiver:8080/stats',
  'http://receiver:8080/',
  'http://receiver:8080/publishers',
  'http://receiver:8080/api/stat',
  'http://receiver:8080/api/stats',
  'http://sls-management-ui:3000/api/stat',
  'http://sls-management-ui:3000/api/stats',
];
const STREAM_CANDIDATES = [
  SLS_STREAMS_URL,
  'http://receiver:8080/stream-ids',
  'http://receiver:8080/api/stream-ids',
  'http://receiver:8080/api/streams',
  'http://sls-management-ui:3000/api/stream-ids',
  'http://sls-management-ui:3000/api/streams',
];

// -- Discovered working URLs (cached) -----------------------------------------
let discoveredStatUrl   = null;
let discoveredStreamUrl = null;

// -- State --------------------------------------------------------------------
const activeStreams  = new Map();
let   isShuttingDown = false;
let   lastDebugLog   = 0;

function safeId(id) { return id.replace(/[^a-zA-Z0-9_-]/g, '_'); }
function log(level, ...a) { console[level](`[${new Date().toISOString()}] [hls-manager]`, ...a); }

// -- Parse any SLS stats JSON into a publisher list ---------------------------
function parsePublishers(data) {
  if (Array.isArray(data)) {
    return data.filter(p => (p.role || '').toLowerCase().includes('publish'));
  }
  if (data && typeof data === 'object') {
    const c = [data.publishers, data.Publishers,
               data.data && data.data.publishers,
               data.result && data.result.publishers].filter(Boolean);
    if (c.length) return Array.isArray(c[0]) ? c[0] : Object.values(c[0]);
    return Object.values(data).flatMap(v => Array.isArray(v) ? v : [])
      .filter(p => (p.role || '').toLowerCase().includes('publish'));
  }
  return [];
}

// -- Fetch publishers (auto-discovers endpoint) --------------------------------
async function fetchPublishers() {
  const urls = discoveredStatUrl ? [discoveredStatUrl] : STAT_CANDIDATES;
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) {
        if (!discoveredStatUrl) log('info', `  [probe] ${url} -> HTTP ${res.status}`);
        continue;
      }
      const raw = await res.text();
      let data;
      try { data = JSON.parse(raw); } catch { continue; }

      if (!discoveredStatUrl) {
        log('info', `OK Stats endpoint: ${url}`);
        log('info', `   Sample: ${raw.slice(0, 250)}`);
        discoveredStatUrl = url;
      }
      const now = Date.now();
      if (now - lastDebugLog > 30000) { lastDebugLog = now; log('info', `[debug] ${raw.slice(0, 300)}`); }

      const list = parsePublishers(data);
      if (list.length > 0) {
        log('info', `  Publishers: ${list.length}`);
        list.forEach(p => log('info', `    * ${p.stream_name || p.id || '?'} kbr=${p.kbitrate || 0}`));
      }
      return list;
    } catch (err) {
      if (!discoveredStatUrl) log('info', `  [probe] ${url} -> ${err.message}`);
    }
  }
  if (discoveredStatUrl) { log('warn', 'Stats URL failed, re-probing...'); discoveredStatUrl = null; }
  return null;
}

// -- Fetch stream-ids map (auto-discovers endpoint) ---------------------------
async function fetchStreamMap() {
  const urls = discoveredStreamUrl ? [discoveredStreamUrl] : STREAM_CANDIDATES;
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) {
        if (!discoveredStreamUrl) log('info', `  [probe-ids] ${url} -> HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (!discoveredStreamUrl) { log('info', `OK Stream-IDs endpoint: ${url}`); discoveredStreamUrl = url; }
      const list = Array.isArray(data) ? data : (data.streams || data.stream_ids || data.data || []);
      const map = {};
      for (const s of list) {
        const pub = s.publisher || s.pub_stream_id || s.publisherId;
        const plr = s.player    || s.play_stream_id || s.playerId;
        if (pub && plr) { map[pub] = plr; log('info', `  Map: "${pub}" -> "${plr}"`); }
      }
      return map;
    } catch (err) {
      if (!discoveredStreamUrl) log('info', `  [probe-ids] ${url} -> ${err.message}`);
    }
  }
  if (discoveredStreamUrl) { discoveredStreamUrl = null; }
  log('warn', 'stream-ids not found -- using stream_name as player key');
  return {};
}

// -- Start FFmpeg HLS transcoder ----------------------------------------------
function startStream(streamId, playerKey, retryCount = 0) {
  if (isShuttingDown) return;
  const safe   = safeId(streamId);
  const dir    = join(HLS_PATH, safe);
  const m3u8   = join(dir, 'stream.m3u8');
  const segPat = join(dir, 'seg_%05d.ts');
  mkdirSync(dir, { recursive: true });

  const srtUrl = `srt://${SRT_HOST}:${SRT_PORT}?streamid=${encodeURIComponent(playerKey)}&mode=caller&latency=${SRT_LATENCY}`;
  log('info', `PLAY [${streamId}]${retryCount > 0 ? ` retry#${retryCount}` : ''} key=${playerKey}`);
  log('info', `     ${srtUrl}`);

  const args = ['-hide_banner','-loglevel','warning',
    '-fflags','+nobuffer+genpts','-flags','low_delay',
    '-i', srtUrl,
    '-c:v','copy','-c:a','copy',
    '-f','hls',
    '-hls_time', HLS_TIME,
    '-hls_list_size', HLS_LIST_SIZE,
    '-hls_flags','delete_segments+append_list+independent_segments',
    '-hls_segment_filename', segPat,
    m3u8];

  const proc = spawn('ffmpeg', args, { stdio: ['ignore','pipe','pipe'] });
  proc.stdout.on('data', d => { const m = d.toString().trim(); if (m) log('info',  `[${streamId}] ${m}`); });
  proc.stderr.on('data', d => { const m = d.toString().trim(); if (m) log('warn',  `[${streamId}] ${m}`); });

  proc.on('close', (code, signal) => {
    log('info', `STOP [${streamId}] code=${code} signal=${signal}`);
    const entry = activeStreams.get(streamId);
    if (!entry || entry.proc !== proc) return;
    try { rmSync(entry.dir, { recursive: true, force: true }); } catch (_) {}
    activeStreams.delete(streamId);
    const ours = signal === 'SIGTERM' || signal === 'SIGKILL';
    if (!isShuttingDown && !ours && code !== 0 && retryCount < MAX_RETRIES) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      log('info', `  Retry in ${(delay/1000).toFixed(0)}s (${retryCount+1}/${MAX_RETRIES})`);
      const timer = setTimeout(() => { if (!activeStreams.has(streamId)) startStream(streamId, playerKey, retryCount+1); }, delay);
      activeStreams.set(streamId, { proc: null, dir, retryCount, retryTimer: timer });
    }
  });
  proc.on('error', err => { log('error', `spawn [${streamId}]:`, err.message); activeStreams.delete(streamId); });
  activeStreams.set(streamId, { proc, dir, retryCount, retryTimer: null });
}

// -- Stop stream --------------------------------------------------------------
function stopStream(id) {
  const e = activeStreams.get(id);
  if (!e) return;
  log('info', `STOP [${id}]`);
  if (e.retryTimer) clearTimeout(e.retryTimer);
  if (e.proc) {
    e.proc.kill('SIGTERM');
    setTimeout(() => { try { e.proc && e.proc.kill('SIGKILL'); } catch (_) {} }, 3000);
  } else {
    try { rmSync(e.dir, { recursive: true, force: true }); } catch (_) {}
    activeStreams.delete(id);
  }
}

// -- Reconcile loop -----------------------------------------------------------
async function reconcile() {
  if (isShuttingDown) return;
  try {
    const [publishers, streamMap] = await Promise.all([fetchPublishers(), fetchStreamMap()]);
    if (publishers !== null) {
      const liveIds = new Set();
      const playerKeys = {};
      for (const p of publishers) {
        const pubId = p.stream_name || p.id || p.stream_id
          || ((p.app || 'live') + '/' + (p.stream || p.name || 'stream'));
        liveIds.add(pubId);
        playerKeys[pubId] = streamMap[pubId] || p.play_key || pubId;
      }
      for (const [id, e] of activeStreams) if (!liveIds.has(id) && e.proc !== null) stopStream(id);
      for (const id of liveIds)            if (!activeStreams.has(id))             startStream(id, playerKeys[id]);
      const running = [...activeStreams.entries()].filter(([,e]) => e.proc).map(([id]) => id);
      log('info', `Live:${publishers.length} HLS:${running.length} Maps:${Object.keys(streamMap).length}`);
    }
  } catch (err) { log('error', 'reconcile:', err.message); }
  setTimeout(reconcile, POLL_INTERVAL);
}

// -- Health server ------------------------------------------------------------
function startHealth() {
  createServer((req, res) => {
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok', uptime: Math.floor(process.uptime()),
        discoveredStatUrl, discoveredStreamUrl,
        streams: [...activeStreams.entries()].map(([id, e]) => ({
          id, status: e.proc ? 'running' : 'retrying', retryCount: e.retryCount || 0
        }))
      }, null, 2));
    } else { res.writeHead(404); res.end('GET /health'); }
  }).listen(HEALTH_PORT, '0.0.0.0', () => log('info', `Health: http://0.0.0.0:${HEALTH_PORT}/health`));
}

// -- Shutdown -----------------------------------------------------------------
function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log('info', 'Shutting down...');
  for (const id of [...activeStreams.keys()]) stopStream(id);
  setTimeout(() => process.exit(0), 4000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

// -- Start --------------------------------------------------------------------
mkdirSync(HLS_PATH, { recursive: true });
log('info', '=== SRTla HLS Manager starting (endpoint auto-discovery) ===');
log('info', `Probing: ${STAT_CANDIDATES.join(' | ')}`);
startHealth();
reconcile();
