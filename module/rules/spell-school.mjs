/** Writer spell `school` -> legacy spell item `system.type` (the sheet's Magic-tab bucket). Class names and
 * school names both work, so "Deep Magic"/"wizard" and "Arcane"/"bibliomancer" land in the right section. */
export const SPELL_TYPES = Object.freeze(["sorcerer", "conjurer", "wizard", "priest", "magitech", "fairy", "druid", "daemon", "abyssal", "bibliomancer"]);
export const SCHOOL_TO_TYPE = Object.freeze({
  truespeech: "sorcerer", spiritualism: "conjurer", divine: "priest", magitech: "magitech",
  fairy: "fairy", nature: "druid", summoning: "daemon", abyssal: "abyssal", arcane: "bibliomancer",
  "deep-magic": "wizard", deepmagic: "wizard",
  sorcerer: "sorcerer", conjurer: "conjurer", wizard: "wizard", priest: "priest", "fairy-tamer": "fairy", fairytamer: "fairy",
  druid: "druid", daemon: "daemon", daemonologist: "daemon", abyssal: "abyssal", bibliomancer: "bibliomancer", bibliomancy: "bibliomancer",
});
const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
/** Bucket name for a school/type string ("" when unknown). */
export const schoolType = (s) => SCHOOL_TO_TYPE[norm(s)] ?? "";
/** Bucket for a spell item: explicit system.type wins (aliases allowed), else derived from the Writer school in flags.
 * Unknown values are returned as-is so the sheet's catch-all "Other spells" section can show them. */
export function spellTypeOf(item) {
  const t = item?.system?.type;
  if (t) return schoolType(t) || String(t);
  const school = item?.flags?.["sw25-ce"]?.data?.school ?? item?.flags?.["sw25-ce"]?.school ?? "";
  return schoolType(school);
}
/** True when a spell has no known Magic-tab section (shown under "Other spells"). */
export const isOtherSpell = (item) => !SPELL_TYPES.includes(spellTypeOf(item));
