/**
 * Stat-block resistance values for monster/NPC resist and dodge rolls (pure).
 * Replaces the legacy default "Resist"/"Attack" monsterability items that the old monster sheet relied on.
 */
/** key: "Dodge" | "Vitres" | "Mndres". Returns { value, fixed, label } from actor.system.sbView, or null when the stat block has no data. */
export function sbResistFor(view, key) {
  if (!view || !Array.isArray(view.parts) || !view.parts.length) return null;
  const ok = (p) => (p && Number.isFinite(Number(p.value)) ? { value: Number(p.value), fixed: Number.isFinite(Number(p.fixed)) ? Number(p.fixed) : Number(p.value) + 7 } : null);
  if (key === "Dodge") {
    const part = view.parts.find((p) => p.isCore) ?? view.parts[0];
    return ok(part?.evasion);
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
