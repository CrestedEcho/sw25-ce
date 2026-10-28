/* sw25-ce: which class casts a magic school when the school's drop-down on the Magic tab is empty.
 * PURE (no Foundry globals). The link comes from the class item's own data, not from class names:
 *   class item flags.sw25-ce.data.classSkills = [{ check: "spellcasting", limit: ["magitech"] }]
 * The school word ("magitech") is turned into the sheet's school code ("mt") with the engine's existing
 * SCHOOL_NAMES config. A class item without that data (hand-made) falls back to its sw25-ce slug or name
 * through the same config, so a renamed compendium class still links through its slug.
 */
import { SCHOOL_NAMES } from "./engine.mjs";

export const SCHOOLS = ["sc", "cn", "wz", "pr", "mt", "fr", "dr", "dm", "ab", "bm"];
/** Wizardry (wz) is cast with the lower of the Truespeech and Spiritualism classes, and needs both (SW2.5). */
const COMPOSITE = { wz: ["sc", "cn"] };

const code = (w) => SCHOOL_NAMES[String(w ?? "").trim().toLowerCase()] ?? null;
const lvl = (it) => Number(it?.system?.skilllevel) || 0;
const isClass = (it) => it?.type === "skill";

/** School codes a class item casts: from classSkills spellcasting limits, else its slug/name via config. */
export function classSchools(item) {
  if (!isClass(item)) return [];
  const data = item.flags?.["sw25-ce"]?.data ?? {};
  const cs = Array.isArray(data.classSkills) ? data.classSkills : [];
  const fromData = cs.filter((x) => x?.check === "spellcasting").flatMap((x) => x.limit ?? []).map(code).filter(Boolean);
  if (cs.length) return [...new Set(fromData)];
  const byId = code(item.flags?.["sw25-ce"]?.slug) ?? code(item.name);
  return byId && byId !== "wz" ? [byId] : [];
}

/** The actor's class item that casts `school` (highest level), or null. Wizardry: the lower of its two parts. */
export function schoolClass(items, school) {
  const list = [...(items ?? [])];
  if (COMPOSITE[school]) {
    const parts = COMPOSITE[school].map((s) => schoolClass(list, s));
    if (parts.some((p) => !p)) return null;
    return parts.reduce((a, b) => (lvl(b) < lvl(a) ? b : a));
  }
  let best = null;
  for (const it of list) if (classSchools(it).includes(school) && (!best || lvl(it) > lvl(best))) best = it;
  return best;
}

/** Class name a school uses: the explicit drop-down choice when it names a class the actor has, else the auto class, else "". */
export function schoolSkillName(sys, items, school) {
  const list = [...(items ?? [])];
  const pick = String(sys?.[`${school}skill`] ?? "").trim();
  if (pick && list.some((it) => isClass(it) && it.name === pick)) return pick;
  return schoolClass(list, school)?.name ?? "";
}
