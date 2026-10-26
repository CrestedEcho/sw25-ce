/* sw25-ce: paying for a spell (pure, no Foundry globals, unit-tested).
 * Sources: the caster's own MP ("Spend MP", ticked by default) and Mako Stones (consumables with system.isMako).
 * A stone pays first (all or part of the cost); the caster's MP pays the rest.
 * One stone per cast; a rule { key: "spell.makoStoneLimit", value: 2 } on a feat (e.g. Mako Stones Master) raises it.
 * A stone keeps leftover points. When empty: a stack takes one off quantity and refills (belt consumePlan rule),
 * a daily-refill stone (Charge Crystal) stays at 0, otherwise the stone is used up (deleted).
 * Casting while short is allowed (GM ruling); the plan reports it so the card can show a warning.
 */
import { qtyOf } from "../ce7/belt-logic.mjs";

const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Mako Stone view of an item (or null when it is not a stone). */
export function makoInfo(it) {
  const s = it?.system ?? {};
  if (it?.type !== "consumable" || !s.isMako) return null;
  const max = Math.max(0, n0(s.makoPoints?.max));
  const value = Math.max(0, Math.min(n0(s.makoPoints?.value), max || Infinity));
  return { id: it.id ?? it._id, name: it.name, img: it.img, value, max, daily: !!s.makoDaily, qty: qtyOf(it) };
}
/** Stones the caster can use right now (points left), most points first. */
export function usableStones(items) {
  return [...(items ?? [])].map(makoInfo).filter((m) => m && m.value > 0).sort((a, b) => b.value - a.value || String(a.name).localeCompare(String(b.name)));
}
/** Stones per cast: 1, or the highest spell.makoStoneLimit rule value among active rules. */
export function makoLimit(active = []) {
  let lim = 1;
  for (const r of active ?? []) if (r?.kind === "spell" && r.target === "spell.makoStoneLimit") lim = Math.max(lim, Math.floor(n0(r.value)));
  return lim;
}
/** Final cost from the cast window: base x targets x metamagic + surcharge + hand adjustment (never below 0). */
export function finalCost({ base = 0, targets = 1, meta = 1, surcharge = 0, adjust = 0 } = {}) {
  const t = Math.max(1, Math.floor(n0(targets) || 1)); const m = Math.max(1, Math.floor(n0(meta) || 1));
  return Math.max(0, Math.max(0, n0(base)) * t * m + Math.max(0, n0(surcharge)) + n0(adjust));
}

/**
 * Payment plan. stones = makoInfo[] the player ticked (first `limit` are used).
 * Returns { cost, stones:[{id,name,pay,before,after}], fromStones, fromMP, mpBefore, mpAfter, unpaid, short, spendMP, noMP, nothing }.
 */
export function payPlan({ cost = 0, mp = 0, mpMax = null, spendMP = true, stones = [], limit = 1 } = {}) {
  const c = Math.max(0, n0(cost)); const before = Math.max(0, n0(mp));
  const noMP = mpMax != null && n0(mpMax) <= 0;
  const useMP = !!spendMP && !noMP;
  let rest = c; const used = [];
  for (const s of (stones ?? []).filter(Boolean).slice(0, Math.max(1, Math.floor(n0(limit)) || 1))) {
    if (rest <= 0) break;
    const pay = Math.min(rest, Math.max(0, n0(s.value)));
    if (pay <= 0) continue;
    used.push({ id: s.id, name: s.name, pay, before: n0(s.value), after: n0(s.value) - pay });
    rest -= pay;
  }
  const fromStones = c - rest;
  const fromMP = useMP ? Math.min(rest, before) : 0;
  const unpaid = rest - fromMP;
  const nothing = !useMP && !used.length;
  return { cost: c, stones: used, fromStones, fromMP, mpBefore: before, mpAfter: before - fromMP, unpaid, short: !nothing && unpaid > 0, spendMP: useMP, noMP, nothing };
}

/** What to do with a stone after paying `pay` points: { delete } or { update }. */
export function stoneAfterPay(it, pay) {
  const m = makoInfo(it); if (!m) return { delete: false, update: null };
  const left = m.value - Math.max(0, n0(pay));
  if (left > 0) return { delete: false, update: { "system.makoPoints.value": left } };
  if (m.qty > 1) return { delete: false, update: { "system.quantity": m.qty - 1, "system.makoPoints.value": m.max } };
  if (m.daily) return { delete: false, update: { "system.makoPoints.value": 0 } };
  return { delete: true, update: null };
}

/** The MP line every cast card shows. */
export function mpLine(p) {
  if (!p || p.nothing) return p && p.cost > 0 ? `No MP spent (cost was ${p.cost})` : "No MP spent";
  const parts = [...p.stones.map((s) => `${s.name} ${s.pay}`)];
  if (p.fromMP || !p.stones.length) parts.push(`own MP ${p.fromMP}`);
  const paid = p.fromStones + p.fromMP;
  return `MP paid: ${paid}${parts.length > 1 || p.stones.length ? ` (${parts.join(", ")})` : ""}${p.spendMP ? ` · MP ${p.mpBefore} → ${p.mpAfter}` : ""}`;
}
/** Warning text when cast while short (null otherwise). */
export function shortLine(p) {
  if (!p?.short) return null;
  return `Cast while short: needed ${p.cost} MP, ${p.unpaid} could not be paid${p.noMP ? " (no MP of their own: Mako Stones only)" : ""}.`;
}
