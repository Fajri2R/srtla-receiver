/**
 * HTTP surface for the telemetry history.
 *
 * Reads are public (the dashboard is public); every mutation requires the
 * deployment's SLS API key, the same secret already mounted at /apikey.
 */
import { timingSafeEqual } from 'node:crypto';
import { scoreFromBuckets } from './quality.js';

const PREFIX = '/api/history';

function json(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(value));
}

function authorized(req, apiKey) {
  const key = typeof apiKey === 'function' ? apiKey() : apiKey;
  if (!key) return false;
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice(7).trim());
  const expected = Buffer.from(key);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundCsv(v) {
  return Number.isFinite(v) ? (Number.isInteger(v) ? v : Number(v.toPrecision(6))) : '';
}

function csvQuote(s) {
  const text = String(s ?? '');
  return text.includes(',') || text.includes('"') || text.includes('\n')
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('payload too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * @returns {Promise<boolean>} true when the request was handled.
 */
export async function handleHistoryRoutes(req, res, { store, apiKey, now = Date.now } = {}) {
  if (!store) return false;
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;

  const route = url.pathname.slice(PREFIX.length) || '/';
  const q = url.searchParams;

  try {
    if (route === '/config' && req.method === 'GET') {
      return json(res, 200, await store.getConfig()), true;
    }

    if (route === '/config' && (req.method === 'POST' || req.method === 'PUT')) {
      if (!authorized(req, apiKey)) return json(res, 401, { error: 'Unauthorized' }), true;
      const body = await readBody(req);
      try {
        return json(res, 200, await store.saveConfig(body)), true;
      } catch (error) {
        return json(res, 400, { error: error.message }), true;
      }
    }

    if (route === '/streams' && req.method === 'GET') {
      return json(res, 200, { streams: await store.readStreams(), stats: await store.stats() }), true;
    }

    if (route === '/sessions' && req.method === 'GET') {
      const sessions = await store.listSessions({
        stream: q.get('stream') || undefined,
        from: q.has('from') ? num(q.get('from'), 0) : undefined,
        to: q.has('to') ? num(q.get('to'), now()) : undefined,
        limit: num(q.get('limit'), 100),
      });
      return json(res, 200, { sessions }), true;
    }

    if (route === '/series' && req.method === 'GET') {
      const stream = q.get('stream');
      if (!stream) return json(res, 400, { error: 'stream is required' }), true;
      const from = num(q.get('from'), 0);
      const to = num(q.get('to'), now());
      const metrics = (q.get('metrics') || '').split(',').map((m) => m.trim()).filter(Boolean);
      const series = await store.readSeries(stream, from, to, metrics.length ? metrics : undefined);
      return json(res, 200, {
        stream,
        from,
        to,
        points: series.length,
        series,
      }), true;
    }

    if (route === '/quality' && req.method === 'GET') {
      const stream = q.get('stream');
      if (!stream) return json(res, 400, { error: 'stream is required' }), true;
      const from = num(q.get('from'), 0);
      const to = num(q.get('to'), now());
      const series = await store.readSeries(stream, from, to,
        ['rtt', 'recvBitrate', 'droppedRate', 'droppedPackets', 'recvBuffer', 'transcoderFps']);
      const analysis = scoreFromBuckets(series);
      if (q.get('format') === 'csv') {
        const lines = [
          'metric,value',
          `stream,${stream}`,
          `from,${from}`,
          `to,${to}`,
          `score,${analysis.score ?? ''}`,
          `grade,${analysis.grade ?? ''}`,
          `minutes,${analysis.minutes}`,
          `healthy_minutes,${analysis.healthyMinutes}`,
          `bitrate_baseline_bps,${analysis.baseline.recvBitrate ?? ''}`,
          '',
          'incident_time,type,severity,value,threshold,detail',
          ...analysis.incidents.map((i) => [
            new Date(i.t).toISOString(),
            i.type,
            i.severity,
            roundCsv(i.value),
            roundCsv(i.threshold),
            csvQuote(i.detail),
          ].join(',')),
        ];
        const safe = String(stream).replace(/[^A-Za-z0-9._-]/g, '_');
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${safe}-quality.csv"`,
          'Cache-Control': 'no-store',
        });
        res.end(`${lines.join('\n')}\n`);
        return true;
      }
      return json(res, 200, {
        stream,
        from,
        to,
        ...analysis,
      }), true;
    }

    if (route === '/export' && req.method === 'GET') {
      const stream = q.get('stream');
      if (!stream) return json(res, 400, { error: 'stream is required' }), true;
      const from = num(q.get('from'), 0);
      const to = num(q.get('to'), now());
      const csv = await store.exportCsv(stream, from, to);
      const safe = String(stream).replace(/[^A-Za-z0-9._-]/g, '_');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safe}-history.csv"`,
        'Cache-Control': 'no-store',
      });
      res.end(csv);
      return true;
    }

    if (route === '/prune' && req.method === 'POST') {
      if (!authorized(req, apiKey)) return json(res, 401, { error: 'Unauthorized' }), true;
      return json(res, 200, { removed: await store.pruneNow() }), true;
    }

    if (route === '/' && req.method === 'DELETE') {
      if (!authorized(req, apiKey)) return json(res, 401, { error: 'Unauthorized' }), true;
      const stream = q.get('stream') || 'all';
      const from = num(q.get('from'), 0);
      const to = num(q.get('to'), now() + 86_400_000);
      if (to < from) return json(res, 400, { error: 'to must be after from' }), true;
      const removed = await store.deleteRange(stream, from, to);
      return json(res, 200, { removed, stream, from, to }), true;
    }

    if (route === '/' && req.method === 'GET') {
      return json(res, 200, { usage: 'GET /sessions, /series, /streams, /config, /export' }), true;
    }

    return json(res, 405, { error: `Method ${req.method} not allowed for ${route}` }), true;
  } catch (error) {
    return json(res, 500, { error: error.message }), true;
  }
}
