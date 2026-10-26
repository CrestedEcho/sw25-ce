/**
 * Play-mode helpers for the NPC / monster stat-block sheet (pure, no Foundry globals; unit-tested).
 * Fixed values vs dice (CR I): a monster check with fixed value F may instead be rolled as 2d6 + (F - 7).
 */

/** Fixed value -> dice modifier and formula ("2d6+5", "2d6-1", "2d6"). */
export function fixedToDice(fixed) {
  const f = Number(fixed);
  if (!Number.isFinite(f)) return null;
  const mod = f - 7;
  return { fixed: f, mod, formula: `2d6${mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : ""}` };
}

/** A check pair {value, fixed} -> fixed number (fixed if set, else value + 7). */
export function pairFixed(p) {
  if (p == null) return null;
  if (typeof p !== "object") return Number.isFinite(Number(p)) ? Number(p) + 7 : null;
  const f = Number(p.fixed); if (p.fixed != null && p.fixed !== "" && Number.isFinite(f)) return f;
  const v = Number(p.value); return Number.isFinite(v) ? v + 7 : null;
}

/**
 * Stat-block damage text ("2d+3", "2d6+3", "3d-1", "2d") -> roll formula and fixed average.
 * The average uses 3.5 per die rounded down, so 2d+X posts 7 + X.
 */
export function parseSbDamage(text) {
  const m = String(text ?? "").replace(/\s+/g, "").match(/^(\d*)d6?([+-]\d+)?$/i);
  if (!m) return null;
  const n = Number(m[1] || 2); const bonus = Number(m[2] || 0);
  return { dice: n, bonus, formula: `${n}d6${bonus > 0 ? `+${bonus}` : bonus < 0 ? `${bonus}` : ""}`, average: Math.floor(n * 3.5) + bonus };
}

/**
 * Apply a damage/heal (HP) or spend/restore (MP) amount to a current value.
 * Increases clamp to max. HP decreases may go below 0 only when death checks are in use
 * (floored at -max); otherwise they stop at 0. MP never goes below 0.
 */
export function applyVital({ current, max, amount, mode, kind = "hp", allowNegative = false }) {
  const a = Math.max(0, Math.floor(Number(amount) || 0));
  const m = Number(max) || 0;
  const cur = current == null || current === "" ? m : Number(current) || 0;
  const up = mode === "heal" || mode === "restore";
  if (up) return Math.min(m, cur + a);
  const floor = kind === "hp" && allowNegative ? -m : 0;
  return Math.max(Math.min(cur, floor), cur - a); // never raise a value already below the floor
}

/** Loot roll text -> { always, min, max }. "Always", "2-6", "2～6", "7~10", "11+", "~6", "12". */
export function parseLootRange(text, row = {}) {
  const s = String(text ?? "").trim().replace(/[～〜~–—]/g, "-").replace(/\s+/g, "");
  if (row.always || /always|自動/i.test(s)) return { always: true, min: null, max: null };
  let m;
  if ((m = s.match(/^(\d+)-(\d+)$/))) return { always: false, min: Number(m[1]), max: Number(m[2]) };
  if ((m = s.match(/^(\d+)(?:\+|-|以上)$/))) return { always: false, min: Number(m[1]), max: Infinity };
  if ((m = s.match(/^-(\d+)$/))) return { always: false, min: -Infinity, max: Number(m[1]) };
  if ((m = s.match(/^(\d+)$/))) return { always: false, min: Number(m[1]), max: Number(m[1]) };
  if (Number.isFinite(Number(row.min)) || Number.isFinite(Number(row.max)))
    return { always: false, min: Number.isFinite(Number(row.min)) ? Number(row.min) : -Infinity, max: Number.isFinite(Number(row.max)) ? Number(row.max) : Infinity };
  return null;
}

/** Rows dropped for a 2d6 total: every "Always" row plus each row whose range contains the total. */
export function lootFor(rows, total) {
  const out = [];
  for (const r of rows ?? []) {
    const rg = parseLootRange(r.roll, r);
    if (!rg) continue;
    if (rg.always || (total >= rg.min && total <= rg.max)) out.push({ ...r, always: rg.always });
  }
  return out;
}

/** Spells with no damage formula whisper to the GM unless the per-spell flag turned GM-only off. */
export function spellGmOnly(flagMap, spellName) {
  const v = flagMap?.[slugKey(spellName)];
  return v === undefined ? true : !!v;
}
/** Flag-safe key (no dots) for a spell name. */
export const slugKey = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "spell";

/** Whisper target for a cast: GM-only when no Power and the toggle is on. */
export function castIsWhisper(meta, flagMap) {
  return !meta?.power && spellGmOnly(flagMap, meta?.name);
}
