/** Feats flagged nonCombat (system.nonCombat, fallback flags.sw25-ce.data.nonCombat). Pure. */
export function isNonCombatFeat(item) {
  const s = item?.system?.nonCombat;
  if (s !== undefined && s !== null) return !!s;
  return !!item?.flags?.["sw25-ce"]?.data?.nonCombat;
}
export const nonCombatFeats = (list = []) => list.filter(isNonCombatFeat);
