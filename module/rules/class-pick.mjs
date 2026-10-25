/** Pure helpers: pick the class level a PC check/weapon/evasion uses when none is chosen (sw25-ce). */
/** SW2.5 fighter-class slugs that give Evasion / melee Accuracy, and Marksman for ranged weapons. */
export const EVASION_CLASSES = ["fighter", "grappler", "fencer", "battle-dancer"];
const RANGED_CATEGORIES = /bow|crossbow|gun|throw/i;
/** Highest-level matching class item (by sw25-ce slug or name), or null. */
export function bestClass(items, slugs) {
  let best = null;
  for (const it of items ?? []) {
    if (it.type !== "skill" || !classMatches(it, slugs)) continue;
    if (!best || Number(it.system.skilllevel) > Number(best.system.skilllevel)) best = it;
  }
  return best;
}
/** Accuracy/damage class for a weapon with no class chosen: Marksman for ranged categories, else the best fighter class. */
export function defaultWeaponClass(items, weapon) {
  const ranged = RANGED_CATEGORIES.test(String(weapon?.system?.type ?? weapon?.system?.category ?? ""));
  return (ranged && bestClass(items, ["marksman"])) || bestClass(items, ranged ? [...EVASION_CLASSES, "marksman"] : EVASION_CLASSES);
}

/** Default class list + ability for the auto-created PC checks (SW2.5 core): Initiative = Scout/Tactician + Agi, Monster Knowledge = Sage + Int. */
export function defaultCheckFor(name, { init, mknow } = {}) {
  if (name && name === init) return { checkskill: "scout|tactician", checkabi: "agi" };
  if (name && name === mknow) return { checkskill: "sage", checkabi: "int" };
  return null;
}
/** "a|b" -> ["a","b"] (lowercase class slugs/names); null for "", "adv" or a single exact name. */
export function checkClassList(v) {
  const s = String(v ?? "");
  return s.includes("|") || /^(scout|tactician|sage|rider)$/.test(s) ? s.toLowerCase().split("|").map((x) => x.trim()).filter(Boolean) : null;
}
export function classMatches(item, list) {
  const slug = String(item.flags?.["sw25-ce"]?.slug ?? "").toLowerCase();
  return list.includes(slug) || list.includes(String(item.name ?? "").toLowerCase());
}
