/* sw25-ce: Magic Power shown on a school header.
 * The actor adds the linked class skill's base to the school's modifiers. With no class picked in the school's
 * drop-down (or a class that was renamed/removed) there is no base, and the old sum was NaN.
 */
export const SCHOOLS = ["sc", "cn", "wz", "pr", "mt", "fr", "dr", "dm", "ab", "bm"];

/** "—" when the school has no linked class skill, else the computed Magic Power as text. */
export function magicPowerText(sys = {}, school = "") {
  const base = Number(sys?.[`${school}base`]);
  if (!sys?.[`${school}skill`] || sys[`${school}base`] == null || !Number.isFinite(base)) return "—";
  const p = Number(sys?.attributes?.[`${school}power`]);
  return String(Number.isFinite(p) ? p : 0);
}
