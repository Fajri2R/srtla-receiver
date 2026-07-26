import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, normalize } from "path";

const PORT = Number(process.env.PORT || 9091);
const STATS_URL = process.env.SLS_STATS_URL || "http://receiver:8080/stats";
const POLL_MS = Math.max(1000, Number(process.env.POLL_MS || 1000));
const HISTORY_SIZE = Math.max(60, Number(process.env.HISTORY_SIZE || 900));
const publicDir = join(process.cwd(), "public");
const streams = new Map();
let lastPoll = null;
let lastError = null;

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
  return { at: Date.now(), ...metrics, raw };
}

async function poll() {
  try {
    const response = await fetch(STATS_URL, { signal: AbortSignal.timeout(3500) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    const present = new Set();
    for (const publisher of normalizePublishers(body)) {
      const id = streamId(publisher);
      if (!id) continue;
      present.add(id);
      const entry = streams.get(id) || { id, latest: null, history: [] };
      const point = snapshot(publisher);
      entry.latest = point;
      entry.history.push(point);
      if (entry.history.length > HISTORY_SIZE) entry.history.splice(0, entry.history.length - HISTORY_SIZE);
      streams.set(id, entry);
    }
    for (const [id, entry] of streams) if (!present.has(id) && entry.history.length > HISTORY_SIZE / 2) streams.delete(id);
    lastPoll = Date.now();
    lastError = null;
  } catch (error) {
    lastError = error.message;
  } finally {
    setTimeout(poll, POLL_MS);
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
  if (url.pathname === "/api/status") return json(res, 200, { lastPoll, lastError, source: STATS_URL, pollMs: POLL_MS, streams: streams.size });
  if (url.pathname === "/api/streams") return json(res, 200, { streams: [...streams.values()].map(({ id, latest }) => ({ id, latest })) });
  if (url.pathname.startsWith("/api/streams/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/streams/".length));
    const entry = streams.get(id);
    return entry ? json(res, 200, entry) : json(res, 404, { error: "Stream not found" });
  }
  if (url.pathname === "/" || url.pathname === "/index.html") return serveFile(res, "index.html", "text/html; charset=utf-8");
  return json(res, 404, { error: "Not found" });
}).listen(PORT, "0.0.0.0", () => console.log(`SRT Monitoring listening on ${PORT}`));

poll();
