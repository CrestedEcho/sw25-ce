/**
 * Stat-block resistance values for monster/NPC resist and dodge rolls (pure).
 * Replaces the legacy default "Resist"/"Attack" monsterability items that the old monster sheet relied on.
 */
/**
 * key: "Dodge" | "Vitres" | "Mndres". Returns { value, fixed } from actor.system.sbView, or null when the stat block has no data.
 * Dodge uses `part` (index) when given, else the core part (else the first). Fortitude/Willpower come from the
 * prepared view, which already carries the Sword Shard bonus (applyShards in prepareStatBlock; NPCs get none).
 */
export function sbResistFor(view, key, part = null) {
  if (!view || !Array.isArray(view.parts) || !view.parts.length) return null;
  const ok = (p) => (p && Number.isFinite(Number(p.value)) ? { value: Number(p.value), fixed: Number.isFinite(Number(p.fixed)) ? Number(p.fixed) : Number(p.value) + 7 } : null);
  if (key === "Dodge") {
    const p = Number.isInteger(part) && view.parts[part] ? view.parts[part] : (view.parts.find((x) => x.isCore) ?? view.parts[0]);
    return ok(p?.evasion);
  }
  if (key === "Vitres") return ok(view.fortitude);
  if (key === "Mndres") return ok(view.willpower);
  return null;
}
/** Roll formula parts for a stat-block resist: fixed (7 + value, i.e. the fixed value) or 2d6 + value. */
export function sbResistFormula(r, useFixed = true) {
  if (!r) return null;
  return useFixed ? { checkformula: `${r.fixed}`, checkbase: "" } : { checkformula: "2d6", checkbase: r.value >= 0 ? `+ ${r.value}` : `${r.value}` };
}

/** Dodge needs a part choice when the stat block has more than one part (each part has its own Evasion). */
export const needsDodgePart = (view, key) => key === "Dodge" && Array.isArray(view?.parts) && view.parts.length > 1;
