/* sw25-ce: Magic Power shown on a school header.
 * The actor adds the linked class skill's base to the school's modifiers. With no class picked in the school's
 * drop-down the actor uses its class that casts the school (`${school}skillUsed`, see school-class.mjs); only an
 * actor with no class for the school has no base.
 */
export const SCHOOLS = ["sc", "cn", "wz", "pr", "mt", "fr", "dr", "dm", "ab", "bm"];

/** "—" when the school has no class (picked or automatic), else the computed Magic Power as text. */
export function magicPowerText(sys = {}, school = "") {
  const base = Number(sys?.[`${school}base`]);
  const skill = sys?.[`${school}skillUsed`] ?? sys?.[`${school}skill`];
  if (!skill || sys[`${school}base`] == null || !Number.isFinite(base)) return "—";
  const p = Number(sys?.attributes?.[`${school}power`]);
  return String(Number.isFinite(p) ? p : 0);
}

/** Blank entry of a school's class drop-down: "Auto (Artificer)" when a class is used automatically, else "-". */
export function schoolBlankLabel(sys = {}, school = "") {
  const used = sys?.[`${school}skillUsed`];
  return used && used !== sys?.[`${school}skill`] ? `Auto (${used})` : "-";
}
