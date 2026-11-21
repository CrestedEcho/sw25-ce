/* sw25-ce: Sleep / rest recovery (PURE, unit-tested). Game-mechanic numbers only.
 * Sleep 3h: HP + ceil(10% max HP), MP + ceil(50% max MP). Sleep 6h: HP + ceil(20% max HP), MP back to max.
 * Never above max; a value already above max is left alone (gain 0). Not fed / sheltered / bedded: no recovery. */
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export const REST_HOURS = [3, 6];
export const REST_RATES = { 3: { hp: 0.1, mp: 0.5 }, 6: { hp: 0.2, mp: 1 } };

/** Gain toward max, rounded up, clamped so value never exceeds max (and never goes down). */
export function clampGain(value, max, gain) {
  const v = num(value), m = num(max), g = Math.max(0, Math.ceil(num(gain) - 1e-9));
  if (v >= m) return 0;
  return Math.min(g, m - v);
}

/**
 * restResult({ hours: 3|6, ok: boolean, hp: {value,max}, mp: {value,max} })
 * -> { hours, ok, hp: {before, after, gain, max}, mp: {before, after, gain, max} }
 */
export function restResult({ hours = 6, ok = true, hp = {}, mp = {} } = {}) {
  const h = REST_RATES[hours] ? Number(hours) : 6;
  const rate = REST_RATES[h];
  const one = (pool, r) => {
    const before = num(pool.value), max = num(pool.max);
    const gain = ok ? clampGain(before, max, r >= 1 ? max - before : Math.ceil(max * r - 1e-9)) : 0;
    return { before, after: before + gain, gain, max };
  };
  return { hours: h, ok: !!ok, hp: one(hp, rate.hp), mp: one(mp, rate.mp) };
}
