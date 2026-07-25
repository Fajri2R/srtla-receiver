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
const SLS_STREAMS_URL = process.env.SLS_STREAMS_URL || (SLS_BASE_URL + "/api/stream-ids");

// The mounted file is the source of truth because receiver.sh writes it after
// SLS creates the initial key. Re-read it during reconciliation so no restart is needed.
let SLS_API_KEY = process.env.SLS_API_KEY || "";
function refreshApiKey() {
  try {
    SLS_API_KEY = readFileSync("/apikey", "utf8").trim();
  } catch {}
  return SLS_API_KEY;
}

const activeStreams  = new Map();
let   isShuttingDown = false;
let   lastDebug      = 0;

function safeId(id) { return id.replace(/[^a-zA-Z0-9_-]/g, "_"); }
function log(l, ...a) { console[l](`[${new Date().toISOString()}] [hls-manager]`, ...a); }
function parseFrameRate(rate) {
  const [numerator, denominator] = String(rate || "0/0").split("/").map(Number);
  if (!numerator || !denominator) return 0;
  return Math.round((numerator / denominator) * 100) / 100;
}

function probeStream(streamId, playlist, expectedProc, attempt = 0) {
  const entry = activeStreams.get(streamId);
  if (!entry || entry.proc !== expectedProc || isShuttingDown) return;

  const probe = spawn("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_type,codec_name,profile,width,height,avg_frame_rate,r_frame_rate,pix_fmt,sample_rate,channels",
    "-of", "json", playlist,
  ], { stdio: ["ignore", "pipe", "ignore"] });
  let output = "";
  probe.stdout.on("data", data => { output += data; });
  probe.on("close", code => {
    const current = activeStreams.get(streamId);
    if (!current || current.proc !== expectedProc || isShuttingDown) return;
    try {
      const streams = code === 0 ? (JSON.parse(output).streams || []) : [];
      const video = streams.find(stream => stream.codec_type === "video");
      const audio = streams.find(stream => stream.codec_type === "audio");
      if (video) {
        current.media = {
          video: {
            codec: video.codec_name || null, profile: video.profile || null,
            width: video.width || null, height: video.height || null,
            fps: parseFrameRate(video.avg_frame_rate || video.r_frame_rate),
            pixelFormat: video.pix_fmt || null,
          },
          audio: audio ? {
            codec: audio.codec_name || null, profile: audio.profile || null,
            sampleRate: Number(audio.sample_rate) || null, channels: audio.channels || null,
          } : null,
        };
        current.ready = true;
        log("info", `  Media [${streamId}]: ${video.width}x${video.height} ${current.media.video.fps}fps ${video.codec_name}`);
        return;
      }
    } catch {}
    if (attempt < 5) setTimeout(() => probeStream(streamId, playlist, expectedProc, attempt + 1), 2000);
  });
}

function parseProgressNumber(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

function updateTranscoderStats(streamId, expectedProc, values) {
  const entry = activeStreams.get(streamId);
  if (!entry || entry.proc !== expectedProc || isShuttingDown) return;

  const previous = entry.transcoder || {};
  const bitrateKbps = parseProgressNumber(values.bitrate?.replace("kbits/s", ""));
  const speed = parseProgressNumber(values.speed?.replace("x", ""));
  entry.transcoder = {
    ...previous,
    frames: Number.parseInt(values.frame, 10) || previous.frames || 0,
    realtimeFps: parseProgressNumber(values.fps) ?? previous.realtimeFps ?? null,
    speed: speed ?? previous.speed ?? null,
    bitrateKbps: bitrateKbps ?? previous.bitrateKbps ?? null,
    droppedFrames: Number.parseInt(values.drop_frames, 10) || 0,
    duplicatedFrames: Number.parseInt(values.dup_frames, 10) || 0,
    updatedAt: new Date().toISOString(),
  };
}
function authHeaders() {
  const apiKey = refreshApiKey();
  return apiKey ? { "Authorization": `Bearer ${apiKey}` } : {};
}

// Fetch configured stream pairs from /api/stream-ids
async function fetchStreamMap() {
  try {
    const res = await fetch(SLS_STREAMS_URL, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      log("warn", `stream-ids: HTTP ${res.status} (check API key)`);
      return null;
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
    return null;
  }
}

// Check if a specific publisher is currently streaming via /stats/{id}
// Returns true if active, false if not
async function getPublisherStats(pubId) {
  try {
    const res = await fetch(`${SLS_BASE_URL}/stats/${encodeURIComponent(pubId)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (body.status === "ok" && body.publisher) {
      return body.publisher;
    }
    return null;
  } catch (e) {
    return null;
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
    "-progress", "pipe:3", "-stats_period", "1", "-nostats",
    "-i", srtUrl,
    "-c:v", "copy", "-c:a", "copy",
    "-f", "hls",
    "-hls_time", HLS_TIME, "-hls_list_size", HLS_LIST_SIZE,
    "-hls_flags", "delete_segments+append_list+independent_segments",
    "-hls_segment_filename", segPat, m3u8,
  ];
  const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe", "pipe"] });
  proc.stdout.on("data", d => { const m = d.toString().trim(); if (m) log("info",  `[${streamId}] ${m}`); });
  proc.stderr.on("data", d => { const m = d.toString().trim(); if (m) log("warn",  `[${streamId}] ${m}`); });
  let progressBuffer = "";
  let progressValues = {};
  proc.stdio[3].on("data", data => {
    progressBuffer += data.toString();
    const lines = progressBuffer.split(/\r?\n/);
    progressBuffer = lines.pop() || "";
    for (const line of lines) {
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const key = line.slice(0, separator);
      progressValues[key] = line.slice(separator + 1);
      if (key === "progress") {
        updateTranscoderStats(streamId, proc, progressValues);
        progressValues = {};
      }
    }
  });
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
      setTimeout(() => {
        if (!activeStreams.has(streamId)) startStream(streamId, playerKey, retryCount + 1);
      }, delay);
    }
  });
  proc.on("error", e => { log("error", `spawn [${streamId}]:`, e.message); activeStreams.delete(streamId); });
  activeStreams.set(streamId, { proc, dir, retryCount, retryTimer: null, media: null, transcoder: null, publisherStats: null, ready: false });
  setTimeout(() => probeStream(streamId, m3u8, proc), 2000);
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
async function pollLiveStats() {
  if (isShuttingDown) return;
  try {
    const activeIds = [...activeStreams.keys()];
    if (activeIds.length > 0) {
      await Promise.all(
        activeIds.map(async id => {
          const stats = await getPublisherStats(id);
          const entry = activeStreams.get(id);
          if (entry && stats) {
            entry.publisherStats = stats;
          }
        })
      );
    }
  } catch (_) {}
  finally {
    setTimeout(pollLiveStats, 1000);
  }
}

async function reconcile() {
  if (isShuttingDown) return;
  try {
    const streamMap = await fetchStreamMap();
    if (streamMap !== null) {
      const publishers = Object.keys(streamMap);
      if (publishers.length === 0) {
        log("info", "No configured streams in /api/stream-ids");
        for (const id of [...activeStreams.keys()]) stopStream(id);
      } else {
        // Check each configured publisher's live status
        const checks = await Promise.all(
          publishers.map(async pub => {
            const stats = await getPublisherStats(pub);
            return { pub, stats, active: !!stats && (stats.bitrate || 0) > 0 };
          })
        );
        const activeSet = new Set(checks.filter(c => c.active).map(c => c.pub));

        // Stop streams that ended
        for (const [id, e] of activeStreams)
          if (!activeSet.has(id) && e.proc !== null) stopStream(id);

        // Start streams that began
        for (const pub of activeSet)
          if (!activeStreams.has(pub)) startStream(pub, streamMap[pub]);

        // Update stats for active streams
        for (const c of checks) {
          if (c.active) {
            const entry = activeStreams.get(c.pub);
            if (entry) {
              entry.publisherStats = c.stats;
            }
          }
        }

        const running = [...activeStreams.values()].filter(e => e.proc).length;
        log("info", `Configured:${publishers.length} Active:${activeSet.size} HLS:${running}`);
      }
    } else {
      log("warn", "Skipping reconciliation because stream mapping is unavailable");
    }
  } catch (e) {
    log("error", "reconcile:", e.message);
  } finally {
    setTimeout(reconcile, POLL_INTERVAL);
  }
}

// Health server
createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok", uptime: Math.floor(process.uptime()),
      slsBaseUrl: SLS_BASE_URL,
      apiKeyConfigured: !!refreshApiKey(),
      running: [...activeStreams.values()].filter(e => e.proc).length,
      streams: [...activeStreams.entries()].map(([id, e]) => ({
        id, status: e.proc ? "running" : "retrying", retry: e.retryCount || 0,
        media: e.media || null, transcoder: e.transcoder || null, publisherStats: e.publisherStats || null, ready: !!e.ready
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
const initialApiKey = refreshApiKey();
log("info", `API key: ${initialApiKey ? "configured (" + initialApiKey.slice(0,8) + "...)" : "NOT SET"}`);
reconcile();
pollLiveStats();

