/**
 * Deterministic network-quality analysis over persisted one-minute buckets.
 *
 * This module deliberately has no storage/HTTP dependency: the same function
 * is used by the route, tests, CSV/JSON consumers, and future offline tools.
 */

export const DEFAULT_THRESHOLDS = Object.freeze({
  rttWarnMs: 100,
  rttBadMs: 250,
  dropsWarn: 50,
  dropsBad: 100,
  bufferWarn: 800,
  bufferBad: 1_800,
  bitrateCollapseRatio: 0.50,
  bitrateCriticalRatio: 0.20,
  minBitrateBaseline: 300_000,
  warningPenalty: 12,
  criticalPenalty: 25,
});

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function upperMedian(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
}

function grade(score) {
  if (score == null) return null;
  if (score >= 95) return 'excellent';
  if (score >= 80) return 'good';
  if (score >= 60) return 'fair';
  return 'bad';
}

function incident(t, type, severity, value, threshold, unit, detail) {
  return { t, type, severity, value, threshold, unit, detail };
}

/**
 * Analyse ordered or unordered persisted buckets.
 *
 * @returns {{score:number|null, grade:string|null, incidents:Array,
 *   baseline:{recvBitrate:number|null}, thresholds:object,
 *   minutes:number, healthyMinutes:number}}
 */
export function scoreFromBuckets(input, overrides = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(overrides || {}) };
  const buckets = (Array.isArray(input) ? input : [])
    .filter((row) => row && finite(row.t) !== null && row.m && Object.keys(row.m).length)
    .sort((a, b) => a.t - b.t);

  if (!buckets.length) {
    return {
      score: null,
      grade: null,
      incidents: [],
      baseline: { recvBitrate: null },
      thresholds,
      minutes: 0,
      healthyMinutes: 0,
    };
  }

  const bitrateBaseline = upperMedian(buckets.map((b) => finite(b.m?.recvBitrate?.avg)));
  const incidents = [];
  const damagedMinutes = new Set();
  let penalty = 0;

  const add = (row, item) => {
    incidents.push(item);
    damagedMinutes.add(row.t);
    penalty += item.severity === 'critical'
      ? thresholds.criticalPenalty
      : thresholds.warningPenalty;
  };

  for (const row of buckets) {
    const rtt = finite(row.m?.rtt?.p95 ?? row.m?.rtt?.max ?? row.m?.rtt?.avg);
    if (rtt !== null && rtt >= thresholds.rttBadMs) {
      add(row, incident(row.t, 'rtt', 'critical', rtt, thresholds.rttBadMs, 'ms',
        `RTT p95 ${rtt} ms exceeded critical threshold ${thresholds.rttBadMs} ms`));
    } else if (rtt !== null && rtt >= thresholds.rttWarnMs) {
      add(row, incident(row.t, 'rtt', 'warning', rtt, thresholds.rttWarnMs, 'ms',
        `RTT p95 ${rtt} ms exceeded warning threshold ${thresholds.rttWarnMs} ms`));
    }

    const drops = finite(row.m?.droppedPackets?.max ?? row.m?.droppedPackets?.p95 ?? row.m?.droppedPackets?.avg);
    if (drops !== null && drops >= thresholds.dropsBad) {
      add(row, incident(row.t, 'drops', 'critical', drops, thresholds.dropsBad, 'packets',
        `Packet drops peaked at ${drops} in this minute`));
    } else if (drops !== null && drops >= thresholds.dropsWarn) {
      add(row, incident(row.t, 'drops', 'warning', drops, thresholds.dropsWarn, 'packets',
        `Packet drops peaked at ${drops} in this minute`));
    }

    const buffer = finite(row.m?.recvBuffer?.p95 ?? row.m?.recvBuffer?.max ?? row.m?.recvBuffer?.avg);
    if (buffer !== null && buffer >= thresholds.bufferBad) {
      add(row, incident(row.t, 'buffer', 'critical', buffer, thresholds.bufferBad, 'packets',
        `Receive buffer p95 reached ${buffer}; sustained backlog suggests buffer bloat`));
    } else if (buffer !== null && buffer >= thresholds.bufferWarn) {
      add(row, incident(row.t, 'buffer', 'warning', buffer, thresholds.bufferWarn, 'packets',
        `Receive buffer p95 reached ${buffer}; queue is building`));
    }

    const bitrate = finite(row.m?.recvBitrate?.avg);
    if (bitrate !== null && bitrateBaseline !== null && bitrateBaseline >= thresholds.minBitrateBaseline) {
      const ratio = bitrate / bitrateBaseline;
      if (ratio < thresholds.bitrateCriticalRatio) {
        add(row, incident(row.t, 'bitrate', 'critical', bitrate, bitrateBaseline * thresholds.bitrateCriticalRatio, 'bps',
          `Receive bitrate fell to ${Math.round(ratio * 100)}% of the session baseline`));
      } else if (ratio < thresholds.bitrateCollapseRatio) {
        add(row, incident(row.t, 'bitrate', 'warning', bitrate, bitrateBaseline * thresholds.bitrateCollapseRatio, 'bps',
          `Receive bitrate fell to ${Math.round(ratio * 100)}% of the session baseline`));
      }
    }
  }

  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  return {
    score,
    grade: grade(score),
    incidents,
    baseline: { recvBitrate: bitrateBaseline },
    thresholds,
    minutes: buckets.length,
    healthyMinutes: Math.max(0, buckets.length - damagedMinutes.size),
  };
}
