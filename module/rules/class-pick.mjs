/**
 * Pure helpers: pick the class level a PC check/weapon/evasion uses when none is chosen (sw25-ce).
 * Driven by class data, never by class names in code: each class item lists what it rolls in
 * flags.sw25-ce.data.classSkills (or system.classSkills), e.g. [{check:"accuracy", limit:["melee","thrown"]}, {check:"evasion"}],
 * [{package:"movement", checks:["initiative", ...]}], [{package:"initiative"}].
 * Class items made before that data existed (no classSkills at all) fall back to CORE_CLASS_SKILLS below, which is the
 * same data as the core class compendium (gen/data/classes/*.json), kept only for those old items.
 */
export const CORE_CLASS_SKILLS = Object.freeze({
  fighter: [{ check: "accuracy", limit: ["melee", "thrown"] }, { check: "evasion" }],
  grappler: [{ check: "accuracy", limit: ["wrestling"] }, { check: "evasion" }],
  fencer: [{ check: "accuracy", limit: ["melee", "thrown"] }, { check: "evasion" }],
  "battle-dancer": [{ check: "accuracy", limit: ["melee", "wrestling", "thrown"] }, { check: "evasion" }],
  marksman: [{ check: "accuracy", limit: ["thrown", "ranged"] }],
  scout: [{ package: "movement", checks: ["initiative"] }],
  tactician: [{ package: "initiative" }],
  sage: [{ package: "knowledge", checks: ["monster-knowledge"] }],
});
const RANGED_CATEGORIES = /bow|crossbow|gun/i;
const THROWN_CATEGORIES = /throw/i;
const WRESTLING_CATEGORIES = /wrestl|grappl/i;
const slugOf = (it) => String(it?.flags?.["sw25-ce"]?.slug ?? "").toLowerCase();

/** The classSkills list of a class item (data first, then the core fallback for old items). */
export function classSkillsOf(item) {
  const d = item?.flags?.["sw25-ce"]?.data?.classSkills ?? item?.system?.classSkills;
  if (Array.isArray(d)) return d;
  return CORE_CLASS_SKILLS[slugOf(item)] ?? CORE_CLASS_SKILLS[String(item?.name ?? "").toLowerCase().replace(/\s+/g, "-")] ?? [];
}
/** Does this class roll `check` (optionally for a weapon `limit` such as "melee")? Limited packages (e.g. vs daemons only) do not count. */
export function classGivesCheck(item, check, limit = null) {
  return classSkillsOf(item).some((e) => {
    if (!e || typeof e !== "object") return false;
    if (e.check === check) return !limit || !Array.isArray(e.limit) || e.limit.includes(limit);
    if (e.package === check && !e.limit) return true;
    return Array.isArray(e.checks) && e.checks.includes(check);
  });
}
/** Highest-level class item matching `want`: an array of slugs/names (legacy) or a check id ("evasion"). */
export function bestClass(items, want, limit = null) {
  let best = null;
  for (const it of items ?? []) {
    if (it.type !== "skill") continue;
    const ok = Array.isArray(want) ? classMatches(it, want) : classGivesCheck(it, want, limit);
    if (!ok) continue;
    if (!best || Number(it.system.skilllevel) > Number(best.system.skilllevel)) best = it;
  }
  return best;
}
/** Kept for callers/tests: the check id used for the Evasion default. */
export const EVASION_CLASSES = "evasion";
/** Weapon category -> accuracy limit used in class data. */
export function weaponLimit(weapon) {
  const cat = String(weapon?.system?.type ?? weapon?.system?.category ?? "");
  if (RANGED_CATEGORIES.test(cat)) return "ranged";
  if (THROWN_CATEGORIES.test(cat)) return "thrown";
  if (WRESTLING_CATEGORIES.test(cat)) return "wrestling";
  return "melee";
}
/** Accuracy/damage class for a weapon with no class chosen: the best class whose data rolls Accuracy for this weapon kind. */
export function defaultWeaponClass(items, weapon) {
  return bestClass(items, "accuracy", weaponLimit(weapon)) || bestClass(items, "accuracy");
}

/** Default class + ability for the auto-created PC checks (core rule): Initiative + Agi, Monster Knowledge + Int; classes come from data. */
export function defaultCheckFor(name, { init, mknow } = {}) {
  if (name && name === init) return { checkskill: "@initiative", checkabi: "agi" };
  if (name && name === mknow) return { checkskill: "@monster-knowledge", checkabi: "int" };
  return null;
}
/** "a|b" -> ["a","b"] (lowercase class slugs/names); "@check" -> {check} (classes whose data rolls it); null for "", "adv" or an exact name. */
export function checkClassList(v) {
  const s = String(v ?? "");
  if (s.startsWith("@")) return { check: s.slice(1) };
  if (s.includes("|")) return s.toLowerCase().split("|").map((x) => x.trim()).filter(Boolean);
  // a single lowercase slug ("sage") from older saved checks; an exact class name ("Fighter") is matched by name instead
  return /^[a-z][a-z0-9-]*$/.test(s) && s !== "adv" ? [s] : null;
}
export function classMatches(item, list) {
  if (list && !Array.isArray(list) && list.check) return classGivesCheck(item, list.check);
  const slug = slugOf(item);
  return list.includes(slug) || list.includes(String(item.name ?? "").toLowerCase());
}
