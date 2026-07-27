import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, normalize } from "path";

const PORT = Number(process.env.PORT || 9091);
const SLS_BASE = (process.env.SLS_STATS_URL || "http://receiver:8080/stats").replace(/\/stats\/?$/, "");
const SLS_STREAMS_URL = process.env.SLS_STREAMS_URL || (SLS_BASE + "/api/stream-ids");
const HLS_STATUS_URL = process.env.HLS_STATUS_URL || "http://hls-manager:9090/health";
let SLS_API_KEY = process.env.SLS_API_KEY || "";
function refreshApiKey() {
  try { SLS_API_KEY = readFileSync("/apikey", "utf8").trim(); } catch {}
  return SLS_API_KEY;
}
const POLL_MS = Math.max(1000, Number(process.env.POLL_MS || 1000));
const GRACE_PERIOD = Math.max(1000, Number(process.env.OFFLINE_GRACE_MS || 15000));
const HISTORY_SIZE = Math.max(300, Number(process.env.HISTORY_SIZE || 600));
const STREAM_IDS_REFRESH_MS = Math.max(POLL_MS, Number(process.env.STREAM_IDS_REFRESH_MS || 2500));
const publicDir = join(process.cwd(), "public");
const streams = new Map();
let lastPoll = null;
let lastError = null;
let cachedStreamIds = { time: 0, list: [] };

const aliases = {
  recvBitrate: ["bitrate", "recv_bitrate", "recv_rate", "receive_bitrate", "input_bitrate"],
  sendBitrate: ["send_bitrate", "send_rate", "out_bitrate", "output_bitrate"],
  rtt: ["rtt", "srtt", "round_trip_time"],
  packetLoss: ["packet_loss", "loss_pct", "loss_rate", "pkt_loss_rate"],
  retransmissions: ["retransmissions", "retransmitted_pkts", "retransmit_rate", "pkt_retrans"],
  jitter: ["jitter", "jitter_ms", "rtt_variance"],
  recvBuffer: ["recv_buffer", "rcvbuf", "recv_buffer_level", "buffer_level"],
  sendBuffer: ["send_buffer", "sndbuf", "send_buffer_level"],
  linkCapacity: ["link_capacity", "estimated_bandwidth", "bandwidth", "mbps_bandwidth"],
  droppedPackets: ["dropped_pkts", "packet_drop", "dropped_packets", "pkt_drop"],
  uptime: ["uptime", "duration", "alive_time"],
  viewers: ["viewers", "connections", "client_counts"],
  transcoderFps: ["transcoder_fps"],
  transcoderSpeed: ["transcoder_speed"],
  transcoderFrames: ["transcoder_frames"],
  transcoderDroppedFrames: ["transcoder_dropped_frames"],
  transcoderDuplicatedFrames: ["transcoder_duplicated_frames"],
};

function getValue(source, names) {
  for (const name of names) {
    const value = source?.[name];
    if (value !== undefined && value !== null && value !== "") return Number(value);
  }
  return null;
}

function normalizePublishers(body) {
  const candidates = body?.publishers || body?.Publishers || body?.publisher || body?.streams || [];
  if (Array.isArray(candidates)) return candidates;
  if (candidates && typeof candidates === "object") return Object.values(candidates);
  return [];
}

function streamId(item) {
  return String(item.id || item.publisher_id || item.stream_id || item.name || item.stream || "");
}

function snapshot(item) {
  const raw = item || {};
  const metrics = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, getValue(raw, names)]));
  if (metrics.recvBitrate !== null) metrics.recvBitrate *= 1000;
  if (metrics.sendBitrate !== null) metrics.sendBitrate *= 1000;
  if (metrics.linkCapacity !== null) metrics.linkCapacity *= 1000;
  return { at: Date.now(), ...metrics, raw };
}

async function fetchHlsStreams() {
  try {
    const response = await fetch(HLS_STATUS_URL, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return new Map();
    const body = await response.json();
    return new Map((body.streams || []).map((stream) => [stream.id, stream]));
  } catch {
    return new Map();
  }
}

async function poll() {
  const pollStartMs = Date.now();
  try {
    const apiKey = refreshApiKey();
    const headers = apiKey ? { "Authorization": `Bearer ${apiKey}` } : {};
    let streamList = cachedStreamIds.list;
    const now = Date.now();

    if (!streamList.length || now - cachedStreamIds.time >= STREAM_IDS_REFRESH_MS) {
      const streamResponse = await fetch(SLS_STREAMS_URL, { headers, signal: AbortSignal.timeout(4000) });
      if (!streamResponse.ok) {
        if (streamResponse.status !== 429 || !streamList.length) {
          throw new Error(`HTTP ${streamResponse.status} from stream-ids`);
        }
      } else {
        const streamBody = await streamResponse.json();
        streamList = Array.isArray(streamBody)
          ? streamBody
          : (streamBody.data || streamBody.streams || streamBody.stream_ids || []);
        cachedStreamIds = { time: now, list: streamList };
      }
    }
    const hlsStreams = await fetchHlsStreams();
    const present = new Set();
    const candidateIds = new Set();
    streamList.forEach(s => {
      if (typeof s === "string") candidateIds.add(s);
      else if (s && (s.publisher || s.pub_stream_id || s.publisherId || s.id)) {
        candidateIds.add(String(s.publisher || s.pub_stream_id || s.publisherId || s.id));
      }
    });
    if (hlsStreams && hlsStreams.keys) {
      for (const id of hlsStreams.keys()) candidateIds.add(id);
    }

    await Promise.all([...candidateIds].map(async (publisherId) => {

      try {
        const statsResponse = await fetch(`${SLS_BASE}/stats/${encodeURIComponent(publisherId)}`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!statsResponse.ok) return;

        const statsBody = await statsResponse.json();
        const publisher = statsBody.status === "ok" ? statsBody.publisher : null;
        if (!publisher) return;

        const hls = hlsStreams.get(publisherId);
        const source = {
          ...publisher,
          viewers: hls?.viewers ?? publisher.viewers,
          media: hls?.media ?? null,
          transcoder: hls?.transcoder ?? null,
          transcoder_fps: hls?.transcoder?.realtimeFps ?? null,
          transcoder_speed: hls?.transcoder?.speed ?? null,
          transcoder_frames: hls?.transcoder?.frames ?? null,
          transcoder_dropped_frames: hls?.transcoder?.droppedFrames ?? null,
          transcoder_duplicated_frames: hls?.transcoder?.duplicatedFrames ?? null,
        };

        const entry = streams.get(publisherId) || { id: publisherId, latest: null, history: [] };
        const point = snapshot(source);
        entry.latest = point;
        entry.history.push(point);
        if (HISTORY_SIZE > 0 && entry.history.length > HISTORY_SIZE) entry.history.splice(0, entry.history.length - HISTORY_SIZE);
        streams.set(publisherId, entry);
        present.add(publisherId);
      } catch {}
    }));

    for (const [id, entry] of streams.entries()) {
      if (present.has(id)) {
        entry.offlineSince = null;
      } else {
        if (!entry.offlineSince) {
          entry.offlineSince = Date.now();
        } else if (Date.now() - entry.offlineSince > GRACE_PERIOD) {
          streams.delete(id);
          console.log(`[srt-monitor] Stream ${id} offline grace period expired. Resetting graph history.`);
          continue;
        }
        const point = { ...entry.latest, at: Date.now(), recvBitrate: 0, sendBitrate: 0 };
        entry.latest = point;
        entry.history.push(point);
        if (HISTORY_SIZE > 0 && entry.history.length > HISTORY_SIZE) entry.history.splice(0, entry.history.length - HISTORY_SIZE);
      }
    }

    lastPoll = Date.now();
    lastError = null;
  } catch (error) {
    lastError = error.message;
  } finally {
    const elapsed = Date.now() - pollStartMs;
    const nextWait = Math.max(50, POLL_MS - elapsed);
    setTimeout(poll, nextWait);
  }
}

function json(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}

function serveFile(res, file, type) {
  const path = join(publicDir, normalize(file));
  if (!path.startsWith(publicDir) || !existsSync(path)) return json(res, 404, { error: "Not found" });
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
  res.end(readFileSync(path));
}

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/status") return json(res, 200, { lastPoll, lastError, source: SLS_STREAMS_URL, pollMs: POLL_MS, streams: streams.size });
  if (url.pathname === "/api/streams") return json(res, 200, { streams: [...streams.values()].map(({ id, latest }) => ({ id, latest })) });
  if (url.pathname.startsWith("/api/streams/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/streams/".length));
    const entry = streams.get(id);
    if (!entry) return json(res, 404, { error: "Stream not found" });
    const since = Number(url.searchParams.get("since"));
    if (since > 0) {
      return json(res, 200, { id: entry.id, latest: entry.latest, offlineSince: entry.offlineSince, history: entry.history.filter(p => p.at > since) });
    }
    const limit = Math.max(1, Number(url.searchParams.get("limit") || 300));
    const initialHistory = entry.history.length > limit ? entry.history.slice(-limit) : entry.history;
    return json(res, 200, { id: entry.id, latest: entry.latest, offlineSince: entry.offlineSince, history: initialHistory });
  }
  if (url.pathname === "/" || url.pathname === "/index.html") return serveFile(res, "index.html", "text/html; charset=utf-8");
  return json(res, 404, { error: "Not found" });
}).listen(PORT, "0.0.0.0", () => console.log(`SRT Monitoring listening on ${PORT}`));

poll();
