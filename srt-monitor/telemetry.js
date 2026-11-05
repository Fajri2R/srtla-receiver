/**
 * Derived telemetry counters.
 *
 * SLS reports cumulative counters (e.g. dropped_pkts) which only ever grow
 * during a live session. Charting or alerting on the raw total makes a session
 * look permanently degraded after one bad moment, and a publisher restart
 * resets the counter to zero which naive deltas report as a negative number.
 * This module converts counters into per-interval deltas and per-second rates.
 */

const COUNTERS = [{ field: 'droppedPackets', delta: 'droppedDelta', rate: 'droppedRate' }];

function positiveFinite(n) {
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * @param {object|null} prev previous poll point ({at, droppedPackets, ...})
 * @param {object} next current poll point
 * @returns {{droppedDelta: number|null, droppedRate: number|null}} deltas &
 *   rates named per counter (`<field>Delta`, `<field>Rate`); null when a
 *   baseline or the counter itself is unavailable, or after a counter reset.
 */
export function deriveCounters(prev, next) {
  const out = {};
  for (const { field, delta: deltaKey, rate: rateKey } of COUNTERS) {
    const before = positiveFinite(prev?.[field]);
    const now = positiveFinite(next?.[field]);
    let delta = null;
    if (now !== null) {
      if (before === null) {
        delta = null; // no baseline yet: claiming zero or now would both lie
      } else if (now < before) {
        delta = 0; // counter reset (publisher restart): ignore this interval
      } else {
        delta = now - before;
      }
    }
    out[deltaKey] = delta;
    let rate = null;
    if (delta !== null) {
      const spanMs = Number(next?.at) - Number(prev?.at);
      const spanS = Number.isFinite(spanMs) ? spanMs / 1000 : null;
      rate = spanS && spanS > 0 ? delta / spanS : 0;
    }
    out[rateKey] = rate;
  }
  return out;
}
