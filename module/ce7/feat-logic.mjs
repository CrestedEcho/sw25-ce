/** Pure combat-feat slot logic (no Foundry globals) — unit-tested. */
export const FEAT_LEVELS = [1, 3, 5, 7, 9, 11, 13, 15];

/** How many level slots are open at this adventurer level (Lv1 -> 1, Lv3 -> 2, ...). */
export const unlockedSlots = (adv) => { const a = Number(adv) || 0; return a >= 1 ? Math.min(FEAT_LEVELS.length, 1 + Math.floor((a - 1) / 2)) : 0; };

/** First open, empty feat level, or null. `feats` = combat feat items. */
export function firstFreeFeatLevel(feats, adv) {
  const taken = new Set((feats ?? []).filter((f) => f.system?.featSource === "slot").map((f) => Number(f.system.featLevel)));
  return FEAT_LEVELS.slice(0, unlockedSlots(adv)).find((l) => !taken.has(l)) ?? null;
}

/** What ticking/unticking "Activate" on a feat should do: { patch } | { warn } | null. */
export function activatePlan(feat, on, feats, adv) {
  const src = feat?.system?.featSource ?? "";
  if (on) {
    if (src) return null; // already in a slot or automatic
    const level = firstFreeFeatLevel(feats, adv);
    return level == null ? { warn: "noSlot" } : { patch: { "system.featSource": "slot", "system.featLevel": level } };
  }
  if (src === "slot") return { patch: { "system.featSource": "", "system.featLevel": 0 } };
  return null;
}
