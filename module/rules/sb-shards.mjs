/**
 * Sword Shard enhancement for monster stat blocks (CRB I p.384).
 * N shards: every part +5×N max HP and +N max MP (parts with MP only),
 * Fortitude / Willpower +1 (1–5), +2 (6–10), +3 (11–15), +4 (16+) to value and fixed.
 * Derived only: applied to the prepared view, never to system.sb. Locked (hand-edited) values are left alone.
 * Pure module (no Foundry globals).
 */

const n0 = (x) => { const v = Math.trunc(Number(x)); return Number.isFinite(v) && v > 0 ? v : 0; };

/** Resistance bonus for N shards: 0, then +1 per started block of 5, max +4. */
export const shardResistBonus = (n) => { const k = n0(n); return k ? Math.min(4, Math.ceil(k / 5)) : 0; };

/** {n, hp, mp, res} for N shards. */
export const shardBonus = (n) => { const k = n0(n); return { n: k, hp: 5 * k, mp: k, res: shardResistBonus(k) }; };

/** Tooltip text: "Base 30 +10 from 2 Sword Shards". */
export const shardTip = (base, add, n) => `Base ${base} +${add} from ${n} Sword Shard${n === 1 ? "" : "s"}`;

/**
 * Apply shards to a prepared view in place (after overrides). `locked` = list of locked paths.
 * Parts must carry `_hpAuto` / `_mpAuto` (current was empty, so it follows max).
 * Records view.shards = {n, hp, mp, res, parts:[{hp:{base,add}|null, mp:…}], fortitude:{value,fixed}|null, willpower:…}.
 */
export function applyShards(view, n, locked = []) {
  const b = shardBonus(n); const lk = new Set(locked);
  const info = { ...b, parts: [], fortitude: null, willpower: null };
  view.shards = info;
  (view.parts ?? []).forEach((q, i) => {
    const row = { hp: null, mp: null };
    if (b.n) {
      if (q.hp != null && !lk.has(`parts.${i}.hp`)) { row.hp = { base: q.hp, add: b.hp }; q.hp += b.hp; }
      if (q.mp != null && q.mp > 0 && !lk.has(`parts.${i}.mp`)) { row.mp = { base: q.mp, add: b.mp }; q.mp += b.mp; }
    }
    if (q._hpAuto) q.hpValue = q.hp; if (q._mpAuto) q.mpValue = q.mp;
    delete q._hpAuto; delete q._mpAuto;
    info.parts.push(row);
  });
  if (b.res) for (const k of ["fortitude", "willpower"]) {
    const p = view[k]; if (!p) continue;
    const r = {};
    if (!lk.has(`${k}.value`)) { r.value = { base: p.value, add: b.res }; p.value += b.res; }
    if (!lk.has(`${k}.fixed`) && p.fixed != null) { r.fixed = { base: p.fixed, add: b.res }; p.fixed += b.res; }
    info[k] = r;
  }
  return view;
}

/**
 * Current HP/MP follows max when the shard count changes: for each part whose stored current equals the
 * old (boosted) max, return the new max. oldView/newView = prepared views, rawParts = parts about to be saved.
 * Returns a new parts array, or null when nothing changes. Empty currents already follow on their own.
 */
export function shardFollowParts(oldView, newView, rawParts) {
  if ((oldView?.shards?.n ?? 0) === (newView?.shards?.n ?? 0)) return null;
  const parts = (Array.isArray(rawParts) ? rawParts : Object.values(rawParts ?? {})).map((p) => ({ ...p }));
  let changed = false;
  parts.forEach((p, i) => {
    const o = oldView.parts?.[i]; const nw = newView.parts?.[i]; if (!o || !nw) return;
    for (const [cur, max] of [["hpValue", "hp"], ["mpValue", "mp"]]) {
      if (p[cur] == null || p[cur] === "") continue;
      if (Number(p[cur]) === Number(o[max]) && nw[max] != null && Number(nw[max]) !== Number(o[max])) { p[cur] = nw[max]; changed = true; }
    }
  });
  return changed ? parts : null;
}

const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
/** Deep merge for a stat-block update preview (arrays replace; index-keyed objects patch arrays). */
export function mergeSbPreview(base, patch) {
  if (patch === undefined) return base;
  if (Array.isArray(base) && isObj(patch)) { const out = base.map((x) => x); for (const [k, v] of Object.entries(patch)) out[Number(k)] = mergeSbPreview(out[Number(k)], v); return out; }
  if (!isObj(patch) || !isObj(base)) return patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (k.startsWith("-=")) { delete out[k.slice(2)]; continue; }
    out[k] = mergeSbPreview(base[k], v);
  }
  return out;
}

/**
 * For a pending update to system.sb (patch), return the parts array to save so current HP/MP follow
 * max when the shard count changes (current == old max -> new max), or null. prepare = prepareStatBlock.
 */
export function shardFollowUpdate(oldSb, patch, prepare, legacy = {}, type = "monster") {
  if (type === "npc" || !isObj(patch)) return null;
  const newSb = mergeSbPreview(oldSb ?? {}, patch);
  const oldView = prepare(oldSb ?? {}, legacy, type); const newView = prepare(newSb, legacy, type);
  return shardFollowParts(oldView, newView, newSb.parts ?? []);
}
