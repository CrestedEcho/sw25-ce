/* sw25-ce spell casting options. PURE (no Foundry globals).
 * spell.mpSurcharge.outOfInfluence: +MP per cast outside the god's area of influence, by god rank
 *   (checkbox per cast in the MP cost dialog).
 * Total = base x targets + surcharge   (surcharge is per cast, not per target).
 */
export const GOD_RANKS = ["ancient", "major", "minor"];

/** Surcharge maps from active rules: [{ source, map:{ancient,major,minor}, choices }]. */
export function surchargeRules(active = []) {
  return active.filter((r) => r.kind === "spell" && r.target === "spell.mpSurcharge")
    .map((r) => ({ source: r.source?.name, map: typeof r.rawValue === "object" && r.rawValue ? r.rawValue : null, value: r.value, choices: r.source?.choices ?? {} }));
}
/** MP surcharge for one rule given the deity rank (a fixed numeric value wins). */
export function influenceSurcharge(rule, rank) {
  if (!rule) return 0;
  if (Number.isFinite(Number(rule.value)) && rule.value !== null && typeof rule.value !== "object") return Number(rule.value);
  const n = Number(rule.map?.[String(rank ?? "").toLowerCase()]);
  return Number.isFinite(n) ? n : 0;
}
export function spellCostTotal({ base = 0, targets = 1, surcharge = 0 } = {}) {
  const b = Math.max(0, Number(base) || 0);
  const t = Math.max(1, Math.floor(Number(targets) || 1));
  return b * t + Math.max(0, Number(surcharge) || 0);
}
export function costLabel({ base = 0, targets = 1, surcharge = 0 } = {}) {
  const t = Math.max(1, Math.floor(Number(targets) || 1));
  const parts = [`${base}${t > 1 ? ` x${t}` : ""}`];
  if (surcharge) parts.push(`+${surcharge} outside influence`);
  return `${parts.join(" ")} = ${spellCostTotal({ base, targets, surcharge })}`;
}
