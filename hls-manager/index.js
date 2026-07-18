/**
 * srtla-hls-manager
 * Correct SLS API usage:
 *   GET /api/stream-ids  (Bearer auth)  -> list of {publisher, player} pairs
 *   GET /stats/{pubId}   (no auth)      -> check if publisher is active
 *   GET /health          (no auth)      -> SLS health
 */
import { spawn }             from "child_process";
import { mkdirSync, rmSync, readFileSync } from "fs";
import { join }              from "path";
import { createServer }      from "http";

// Config
const SRT_HOST      = process.env.SRT_HOST      || "receiver";
const SRT_PORT      = process.env.SRT_PORT      || "4000";
const HLS_PATH      = process.env.HLS_PATH      || "/hls";
const HLS_TIME      = process.env.HLS_TIME      || "2";
const HLS_LIST_SIZE = process.env.HLS_LIST_SIZE || "5";
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "5", 10) * 1000;
const HEALTH_PORT   = parseInt(process.env.HEALTH_PORT   || "9090", 10);
const MAX_RETRIES   = parseInt(process.env.MAX_RETRIES   || "10", 10);
const SRT_LATENCY   = process.env.SRT_LATENCY   || "200";
const SLS_BASE_URL  = process.env.SLS_STATS_URL
  ? process.env.SLS_STATS_URL.replace(/\/[^/]+$/, "")
  : "http://receiver:8080";

// Read API key: from file (mounted from host) or env var
let SLS_API_KEY = process.env.SLS_API_KEY || "";
try { SLS_API_KEY = readFileSync("/apikey", "utf8").trim(); } catch {}

const activeStreams  = new Map();
let   isShuttingDown = false;
let   lastDebug      = 0;

function safeId(id) { return id.replace(/[^a-zA-Z0-9_-]/g, "_"); }
function log(l, ...a) { console[l](`[${new Date().toISOString()}] [hls-manager]`, ...a); }

function authHeaders() {
  return SLS_API_KEY ? { "Authorization": `Bearer ${SLS_API_KEY}` } : {};
}

// Fetch configured stream pairs from /api/stream-ids
async function fetchStreamMap() {
  try {
    const res = await fetch(`${SLS_BASE_URL}/api/stream-ids`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      log("warn", `stream-ids: HTTP ${res.status} (check API key)`);
      return {};
    }
    const body = await res.json();
    // Response: {"data":[{"publisher":"ltest","player":"ptest"}],"status":"success"}
    const list = Array.isArray(body) ? body : (body.data || body.streams || body.stream_ids || []);
    const map = {};
    for (const s of list) {
      const pub = s.publisher || s.pub_stream_id || s.publisherId;
      const plr = s.player    || s.play_stream_id || s.playerId;
      if (pub && plr) { map[pub] = plr; log("info", `  Configured: "${pub}" -> "${plr}"`); }
    }
    return map;
  } catch (e) {
    log("warn", "fetchStreamMap:", e.message);
    return {};
  }
}

// Check if a specific publisher is currently streaming via /stats/{id}
// Returns true if active, false if not
async function isPublisherActive(pubId) {
  try {
    const res = await fetch(`${SLS_BASE_URL}/stats/${encodeURIComponent(pubId)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;  // 404 = not streaming
    const body = await res.json();
    // Response: {"publisher":{...},"status":"ok"}
    const active = body.status === "ok" && !!body.publisher;
    if (active) {
      const kbr = body.publisher.bitrate || 0;
      if (Date.now() - lastDebug > 30000) {
        lastDebug = Date.now();
        log("info", `  [debug] ${pubId}: bitrate=${kbr} uptime=${body.publisher.uptime}s`);
      }
    }
    return active;
  } catch (e) {
    return false;
  }
}

// FFmpeg: start HLS for one stream
function startStream(streamId, playerKey, retryCount = 0) {
  if (isShuttingDown) return;
  const safe   = safeId(streamId);
  const dir    = join(HLS_PATH, safe);
  const m3u8   = join(dir, "stream.m3u8");
  const segPat = join(dir, "seg_%05d.ts");
  mkdirSync(dir, { recursive: true });
  const srtUrl = `srt://${SRT_HOST}:${SRT_PORT}?streamid=${encodeURIComponent(playerKey)}&mode=caller&latency=${SRT_LATENCY}`;
  log("info", `PLAY [${streamId}]${retryCount > 0 ? ` retry#${retryCount}` : ""} playerKey="${playerKey}"`);
  const args = [
    "-hide_banner", "-loglevel", "warning",
    "-fflags", "+nobuffer+genpts", "-flags", "low_delay",
    "-i", srtUrl,
    "-c:v", "copy", "-c:a", "copy",
    "-f", "hls",
    "-hls_time", HLS_TIME, "-hls_list_size", HLS_LIST_SIZE,
    "-hls_flags", "delete_segments+append_list+independent_segments",
    "-hls_segment_filename", segPat, m3u8,
  ];
  const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
  proc.stdout.on("data", d => { const m = d.toString().trim(); if (m) log("info",  `[${streamId}] ${m}`); });
  proc.stderr.on("data", d => { const m = d.toString().trim(); if (m) log("warn",  `[${streamId}] ${m}`); });
  proc.on("close", (code, signal) => {
    log("info", `STOP [${streamId}] code=${code} sig=${signal}`);
    const e = activeStreams.get(streamId);
    if (!e || e.proc !== proc) return;
    try { rmSync(e.dir, { recursive: true, force: true }); } catch {}
    activeStreams.delete(streamId);
    const ours = signal === "SIGTERM" || signal === "SIGKILL";
    if (!isShuttingDown && !ours && code !== 0 && retryCount < MAX_RETRIES) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      log("info", `  retry in ${(delay/1000).toFixed(0)}s (${retryCount+1}/${MAX_RETRIES})`);
      const t = setTimeout(() => { if (!activeStreams.has(streamId)) startStream(streamId, playerKey, retryCount+1); }, delay);
      activeStreams.set(streamId, { proc: null, dir, retryCount, retryTimer: t });
    }
  });
  proc.on("error", e => { log("error", `spawn [${streamId}]:`, e.message); activeStreams.delete(streamId); });
  activeStreams.set(streamId, { proc, dir, retryCount, retryTimer: null });
}

function stopStream(id) {
  const e = activeStreams.get(id);
  if (!e) return;
  log("info", `STOP [${id}]`);
  if (e.retryTimer) clearTimeout(e.retryTimer);
  if (e.proc) {
    e.proc.kill("SIGTERM");
    setTimeout(() => { try { e.proc && e.proc.kill("SIGKILL"); } catch {} }, 3000);
  } else {
    try { rmSync(e.dir, { recursive: true, force: true }); } catch {}
    activeStreams.delete(id);
  }
}

// Main reconciliation
async function reconcile() {
  if (isShuttingDown) return;
  try {
    const streamMap = await fetchStreamMap();
    const publishers = Object.keys(streamMap);

    if (publishers.length === 0) {
      log("info", "No configured streams in /api/stream-ids");
    } else {
      // Check each configured publisher's live status
      const checks = await Promise.all(
        publishers.map(async pub => ({ pub, active: await isPublisherActive(pub) }))
      );
      const activeSet = new Set(checks.filter(c => c.active).map(c => c.pub));

      // Stop streams that ended
      for (const [id, e] of activeStreams)
        if (!activeSet.has(id) && e.proc !== null) stopStream(id);

      // Start streams that began
      for (const pub of activeSet)
        if (!activeStreams.has(pub)) startStream(pub, streamMap[pub]);

      const running = [...activeStreams.values()].filter(e => e.proc).length;
      log("info", `Configured:${publishers.length} Active:${activeSet.size} HLS:${running}`);
    }
  } catch (e) { log("error", "reconcile:", e.message); }
  setTimeout(reconcile, POLL_INTERVAL);
}

// Health server
createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok", uptime: Math.floor(process.uptime()),
      slsBaseUrl: SLS_BASE_URL,
      apiKeyConfigured: !!SLS_API_KEY,
      streams: [...activeStreams.entries()].map(([id, e]) => ({
        id, status: e.proc ? "running" : "retrying", retry: e.retryCount || 0
      }))
    }, null, 2));
  } else { res.writeHead(404); res.end(); }
}).listen(HEALTH_PORT, "0.0.0.0", () => log("info", `Health: http://0.0.0.0:${HEALTH_PORT}/health`));

function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  for (const id of [...activeStreams.keys()]) stopStream(id);
  setTimeout(() => process.exit(0), 4000);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT",  shutdown);

mkdirSync(HLS_PATH, { recursive: true });
log("info", `=== HLS Manager starting ===`);
log("info", `SLS base: ${SLS_BASE_URL}`);
log("info", `API key: ${SLS_API_KEY ? "configured (" + SLS_API_KEY.slice(0,8) + "...)" : "NOT SET"}`);
reconcile();

