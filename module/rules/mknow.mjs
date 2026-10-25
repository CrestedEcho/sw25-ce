/* sw25-ce Monster Knowledge -> weakness reveal. PURE helpers.
 * GM ruling: a monster's weak point applies only once a Monster Knowledge check meets/beats its Weakness number. */
export const isMonsterKnowledge = (name) => /monster\s*knowledge|魔物知識/i.test(String(name ?? ""));
/** For one target sb, what a Monster Knowledge total reveals. Returns updates (empty object = nothing new). */
export function knowledgeUpdates(total, sb) {
  const t = Number(total); const out = {};
  if (!sb || !Number.isFinite(t)) return out;
  const rep = Number(sb.reputation) || 0; const weak = Number(sb.weakness) || 0;
  if (rep > 0 && t >= rep && !sb.reputationReached) out["system.sb.reputationReached"] = true;
  if (weak > 0 && t >= weak && !sb.weaknessRevealed) out["system.sb.weaknessRevealed"] = true;
  return out;
}
