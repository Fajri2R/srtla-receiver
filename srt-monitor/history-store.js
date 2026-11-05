/**
 * Persistent telemetry history for the SRT Monitor.
 *
 * Samples arrive once per second; they are folded into one-minute buckets and
 * appended to a JSONL file per stream per UTC day. Sessions (one publisher
 * going live until it disappears) are tracked separately so the UI can list
 * "riwayat live" without scanning every bucket.
 *
 * Layout inside `dir`:
 *   config.json                     → { retentionDays }
 *   <stream>/agg/<YYYY-MM-DD>.jsonl  → one JSON object per minute
 *   <stream>/sessions.json           → { sessions: [...] }
 *
 * No third-party dependencies: plain fs + JSON keeps the container image small
 * and the files readable/exportable with standard tools.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_RETENTION_DAYS = 90;
export const MAX_RETENTION_DAYS = 3650;
const MAX_SESSIONS_PER_STREAM = 2000;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** Metrics persisted for analysis, in export/display order. */
export const METRICS = [
  'recvBitrate',
  'sendBitrate',
  'rtt',
  'packetLoss',
  'retransmissions',
  'jitter',
  'recvBuffer',
  'sendBuffer',
  'linkCapacity',
  'droppedPackets',
  'uptime',
  'viewers',
  'transcoderFps',
  'transcoderSpeed',
  'transcoderDroppedFrames',
  'transcoderDuplicatedFrames',
  'throughput',
  'latency',
];

const CSV_METRICS = ['rtt', ...METRICS.filter((m) => m !== 'rtt')];

function round(v) {
  if (!Number.isFinite(v)) return 0;
  if (Number.isInteger(v)) return v;
  return Number(v.toPrecision(6));
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function safeId(stream) {
  return String(stream).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 96) || 'unknown';
}

function readJson(file, fallback) {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export class HistoryStore {
  constructor({ dir, offlineGapMs = 45_000, flushIntervalMs = 20_000, retentionDays } = {}) {
    if (!dir) throw new Error('HistoryStore requires a dir');
    this.dir = dir;
    this.offlineGapMs = offlineGapMs;
    this.flushIntervalMs = flushIntervalMs;
    mkdirSync(this.dir, { recursive: true });

    /** @type {Map<string, {start:number, lastAt:number, samples:number, sums:Map<string,{sum:number,count:number,min:number,max:number}>}>} */
    this.active = new Map();
    /** @type {Map<string, {t:number, values:Map<string, number[]>, n:number, off:number}>} */
    this.buckets = new Map();

    this.timer = null;
    if (retentionDays != null && !existsSync(this.configPath())) {
      // The env var seeds the FIRST boot only; after that the persisted
      // config is authoritative so runtime changes survive restarts.
      this.saveConfig({ retentionDays }).catch(() => {});
    }
    if (flushIntervalMs > 0 && flushIntervalMs < 86_400_000) {
      // Do not flush an in-progress minute: appending partial buckets every
      // interval creates duplicate timestamps and corrupts later analysis.
      this.timer = setInterval(() => { this.flush(false).catch(() => {}); }, flushIntervalMs);
      this.timer.unref?.();
    }
  }

  /* ── config ──────────────────────────────────────────────────────────── */

  configPath() {
    return join(this.dir, 'config.json');
  }

  async getConfig() {
    const cfg = readJson(this.configPath(), {});
    const days = Number(cfg.retentionDays);
    return {
      retentionDays: Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), MAX_RETENTION_DAYS) : DEFAULT_RETENTION_DAYS,
      maxRetentionDays: MAX_RETENTION_DAYS,
      metrics: METRICS,
    };
  }

  async saveConfig(patch) {
    const current = await this.getConfig();
    const days = Math.floor(Number(patch?.retentionDays ?? current.retentionDays));
    if (!Number.isFinite(days) || days < 1 || days > MAX_RETENTION_DAYS) {
      throw new Error(`retentionDays must be between 1 and ${MAX_RETENTION_DAYS}`);
    }
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.configPath(), JSON.stringify({ retentionDays: days }, null, 2));
    return this.getConfig();
  }

  /* ── ingest ──────────────────────────────────────────────────────────── */

  record(stream, sample) {
    if (!stream || !sample) return;
    const at = Number(sample.at) || Date.now();
    const state = this.active.get(stream);
    if (!state || at - state.lastAt > this.offlineGapMs) {
      if (state) this.closeSession(stream, state.lastAt);
      this.active.set(stream, { start: at, lastAt: at, samples: 0, sums: new Map() });
    }
    const cur = this.active.get(stream);
    if (at > cur.lastAt) cur.lastAt = at;
    cur.samples += 1;

    // One bucket per sample, not one per metric: `n` must count samples.
    const bucket = this.bucketFor(stream, at);

    for (const metric of METRICS) {
      const raw = sample[metric];
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
      const agg = cur.sums.get(metric) || { sum: 0, count: 0, min: Infinity, max: -Infinity };
      agg.sum += raw;
      agg.count += 1;
      if (raw < agg.min) agg.min = raw;
      if (raw > agg.max) agg.max = raw;
      cur.sums.set(metric, agg);

      const list = bucket.values.get(metric) || [];
      list.push(raw);
      bucket.values.set(metric, list);
    }
  }

  bucketFor(stream, at) {
    const t = Math.floor(at / MINUTE_MS) * MINUTE_MS;
    let bucket = this.buckets.get(stream);
    if (bucket && bucket.t !== t) {
      this.writeBucket(stream, bucket);
      bucket = null;
    }
    if (!bucket) {
      bucket = { t, values: new Map(), n: 0, off: 0 };
      this.buckets.set(stream, bucket);
    }
    bucket.n += 1;
    return bucket;
  }

  writeBucket(stream, bucket) {
    if (!bucket || !bucket.n) return;
    const metrics = {};
    for (const [metric, values] of bucket.values) {
      const sorted = [...values].sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      metrics[metric] = {
        avg: round(sum / sorted.length),
        min: round(sorted[0]),
        max: round(sorted[sorted.length - 1]),
        p95: round(percentile(sorted, 95)),
      };
    }
    const line = JSON.stringify({ t: bucket.t, n: bucket.n, off: bucket.off || undefined, m: metrics });
    const day = dayKey(bucket.t);
    const aggDir = join(this.dir, safeId(stream), 'agg');
    mkdirSync(aggDir, { recursive: true });
    appendFileSync(join(aggDir, `${day}.jsonl`), `${line}\n`);
  }

  /**
   * @param {boolean} includePartial When true, the minute still collecting
   *   samples is written too (shutdown, markOffline, explicit tests). The
   *   periodic timer passes false so a minute is only ever persisted once.
   */
  async flush(includePartial = true) {
    const now = Date.now();
    const currentMinute = Math.floor(now / MINUTE_MS) * MINUTE_MS;
    for (const [stream, bucket] of [...this.buckets]) {
      if (!includePartial && bucket.t >= currentMinute) continue;
      this.writeBucket(stream, bucket);
      this.buckets.delete(stream);
    }
  }

  async markOffline(stream, at = Date.now()) {
    const state = this.active.get(stream);
    if (!state) return null;
    const bucket = this.buckets.get(stream);
    if (bucket) {
      this.writeBucket(stream, bucket);
      this.buckets.delete(stream);
    }
    return this.closeSession(stream, Math.max(at, state.lastAt));
  }

  closeSession(stream, end) {
    const state = this.active.get(stream);
    if (!state) return null;
    this.active.delete(stream);
    const summary = {};
    for (const [metric, agg] of state.sums) {
      summary[metric] = { avg: agg.sum / agg.count, min: agg.min, max: agg.max };
    }
    const session = {
      sid: `${safeId(stream)}@${state.start}`,
      stream,
      start: state.start,
      end,
      durationMs: Math.max(0, end - state.start),
      samples: state.samples,
      summary,
    };
    const file = this.sessionsPath(stream);
    const data = readJson(file, { sessions: [] });
    data.sessions.push(session);
    if (data.sessions.length > MAX_SESSIONS_PER_STREAM) {
      data.sessions = data.sessions.slice(-MAX_SESSIONS_PER_STREAM);
    }
    mkdirSync(join(this.dir, safeId(stream)), { recursive: true });
    writeFileSync(file, JSON.stringify(data));
    return session;
  }

  /* ── read ────────────────────────────────────────────────────────────── */

  sessionsPath(stream) {
    return join(this.dir, safeId(stream), 'sessions.json');
  }

  async readSessions(stream) {
    const data = readJson(this.sessionsPath(stream), { sessions: [] });
    return Array.isArray(data.sessions) ? data.sessions : [];
  }

  async listSessions({ stream, from, to, limit = 100 } = {}) {
    const streams = stream && stream !== 'all' ? [stream] : await this.streamIds();
    const out = [];
    for (const id of streams) {
      for (const s of await this.readSessions(id)) {
        if (from != null && s.end < from) continue;
        if (to != null && s.start > to) continue;
        out.push(s);
      }
    }
    out.sort((a, b) => b.start - a.start);
    return out.slice(0, Math.max(1, Math.min(limit, 1000)));
  }

  async streamIds() {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(this.dir, e.name, 'sessions.json')))
      .map((e) => {
        const sessions = readJson(join(this.dir, e.name, 'sessions.json'), { sessions: [] }).sessions || [];
        const last = sessions[sessions.length - 1];
        return last?.stream || e.name;
      });
  }

  async readStreams() {
    const out = [];
    if (!existsSync(this.dir)) return out;
    for (const entry of readdirSync(this.dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const base = join(this.dir, entry.name);
      const aggDir = join(base, 'agg');
      const days = {};
      if (existsSync(aggDir)) {
        for (const file of readdirSync(aggDir)) {
          if (!file.endsWith('.jsonl')) continue;
          const day = file.slice(0, -'.jsonl'.length);
          const full = join(aggDir, file);
          const stat = statSync(full);
          days[day] = { bytes: stat.size, modified: stat.mtimeMs };
        }
      }
      const sessions = readJson(join(base, 'sessions.json'), { sessions: [] }).sessions || [];
      out.push({
        stream: sessions[sessions.length - 1]?.stream || entry.name,
        days,
        sessions: sessions.length,
        bytes: Object.values(days).reduce((a, d) => a + d.bytes, 0),
        lastSession: sessions[sessions.length - 1]?.end || null,
      });
    }
    return out.sort((a, b) => (b.lastSession || 0) - (a.lastSession || 0));
  }

  async readSeries(stream, from, to, metrics = METRICS) {
    const aggDir = join(this.dir, safeId(stream), 'agg');
    if (!existsSync(aggDir)) return [];
    const wanted = new Set(metrics);
    const buckets = [];
    const firstDay = dayKey(from);
    const lastDay = dayKey(to);
    for (const file of readdirSync(aggDir).sort()) {
      if (!file.endsWith('.jsonl')) continue;
      const day = file.slice(0, -'.jsonl'.length);
      if (day < firstDay || day > lastDay) continue;
      let body;
      try {
        body = readFileSync(join(aggDir, file), 'utf8');
      } catch {
        continue;
      }
      for (const line of body.split('\n')) {
        if (!line.trim()) continue;
        let row;
        try {
          row = JSON.parse(line);
        } catch {
          continue; // tolerate a torn write; the rest of the day stays readable
        }
        if (typeof row?.t !== 'number' || row.t < from || row.t > to) continue;
        const m = {};
        for (const [key, value] of Object.entries(row.m || {})) {
          if (wanted.has(key)) m[key] = value;
        }
        buckets.push({ t: row.t, n: row.n || 0, off: row.off || 0, m });
      }
    }
    buckets.sort((a, b) => a.t - b.t);
    return buckets;
  }

  async exportCsv(stream, from, to) {
    const rows = await this.readSeries(stream, from, to, CSV_METRICS);
    const header = ['time', 'n', ...CSV_METRICS.flatMap((m) => [`${m}_avg`, `${m}_min`, `${m}_max`, `${m}_p95`])];
    const lines = [header.join(',')];
    for (const row of rows) {
      const cells = [new Date(row.t).toISOString(), String(row.n)];
      for (const metric of CSV_METRICS) {
        const v = row.m[metric];
        cells.push(v ? String(v.avg) : '', v ? String(v.min) : '', v ? String(v.max) : '', v ? String(v.p95) : '');
      }
      lines.push(cells.join(','));
    }
    return `${lines.join('\n')}\n`;
  }

  /* ── delete & retention ──────────────────────────────────────────────── */

  async deleteRange(stream, from, to) {
    const targets = stream && stream !== 'all' ? [stream] : await this.streamIds();
    let series = 0;
    let sessions = 0;
    for (const id of targets) {
      const safe = safeId(id);
      const aggDir = join(this.dir, safe, 'agg');
      if (existsSync(aggDir)) {
        for (const file of readdirSync(aggDir)) {
          if (!file.endsWith('.jsonl')) continue;
          const day = file.slice(0, -'.jsonl'.length);
          const full = join(aggDir, file);
          const body = readFileSync(full, 'utf8');
          const keep = [];
          let removedHere = 0;
          for (const line of body.split('\n')) {
            if (!line.trim()) continue;
            let row;
            try {
              row = JSON.parse(line);
            } catch {
              removedHere += 1; // drop unreadable lines while rewriting
              continue;
            }
            if (row.t >= from && row.t <= to) {
              removedHere += 1;
            } else {
              keep.push(line);
            }
          }
          series += removedHere;
          if (!keep.length) {
            rmSync(full, { force: true });
          } else if (removedHere) {
            writeFileSync(full, `${keep.join('\n')}\n`);
          }
        }
      }

      const file = this.sessionsPath(id);
      if (existsSync(file)) {
        const data = readJson(file, { sessions: [] });
        const kept = (data.sessions || []).filter((s) => s.end < from || s.start > to);
        const removedHere = (data.sessions || []).length - kept.length;
        if (removedHere) {
          sessions += removedHere;
          if (kept.length) {
            writeFileSync(file, JSON.stringify({ sessions: kept }));
          } else {
            rmSync(file, { force: true });
          }
        }
      }
    }
    return { series, sessions, streams: targets.length };
  }

  async pruneNow(now = Date.now()) {
    const { retentionDays } = await this.getConfig();
    const cutoffDay = dayKey(now - retentionDays * DAY_MS);
    const cutoffMs = now - retentionDays * DAY_MS;
    const removed = { days: 0, sessions: 0, bytes: 0 };
    if (!existsSync(this.dir)) return removed;
    for (const entry of readdirSync(this.dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const base = join(this.dir, entry.name);
      const aggDir = join(base, 'agg');
      if (existsSync(aggDir)) {
        for (const file of readdirSync(aggDir)) {
          const day = file.slice(0, -'.jsonl'.length);
          if (day >= cutoffDay) continue;
          const full = join(aggDir, file);
          try {
            removed.bytes += statSync(full).size;
            rmSync(full, { force: true });
            removed.days += 1;
          } catch {
            /* ignore */
          }
        }
        if (!readdirSync(aggDir).length) rmSync(aggDir, { recursive: true, force: true });
      }
      const file = join(base, 'sessions.json');
      if (existsSync(file)) {
        const data = readJson(file, { sessions: [] });
        const kept = (data.sessions || []).filter((s) => s.end >= cutoffMs);
        if (kept.length !== (data.sessions || []).length) {
          removed.sessions += (data.sessions || []).length - kept.length;
          if (kept.length) writeFileSync(file, JSON.stringify({ sessions: kept }));
          else rmSync(file, { force: true });
        }
      }
      try {
        if (!readdirSync(base).length) rmSync(base, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    return removed;
  }

  async stats() {
    const streams = await this.readStreams();
    return {
      dir: this.dir,
      streams: streams.length,
      bytes: streams.reduce((a, s) => a + s.bytes, 0),
      days: streams.reduce((a, s) => a + Object.keys(s.days).length, 0),
      active: [...this.active.keys()],
    };
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
