/** Writer spell `school` -> legacy spell item `system.type` (the sheet's Magic-tab bucket). */
export const SCHOOL_TO_TYPE = Object.freeze({
  truespeech: "sorcerer", spiritualism: "conjurer", divine: "priest", magitech: "magitech",
  fairy: "fairy", nature: "druid", summoning: "daemon", abyssal: "abyssal", arcane: "bibliomancer",
});
/** Bucket for a spell item: explicit system.type wins, else derived from the Writer school in flags. */
export function spellTypeOf(item) {
  const t = item?.system?.type;
  if (t) return t;
  const school = String(item?.flags?.["sw25-ce"]?.data?.school ?? item?.flags?.["sw25-ce"]?.school ?? "").toLowerCase();
  return SCHOOL_TO_TYPE[school] ?? "";
}
