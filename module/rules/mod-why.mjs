/* sw25-ce: "why" notes for the Combat modifier panel (PURE). Stored on the actor as
 * flags.sw25-ce.modWhy.<key>; shown next to the modifier and in roll-card formula tooltips. */
export const MOD_WHY_KEYS = ["hitmod", "dmod", "ltmod", "crmod", "dodgemod", "dreduce", "ppmod", "mppmod", "movemod", "lootmod"];

export function whyOf(flags, key) {
  const w = flags?.["sw25-ce"]?.modWhy?.[key];
  return typeof w === "string" ? w.trim() : "";
}
/** "Accuracy modifier" + "Targeting feat" -> "Accuracy modifier (Targeting feat)". */
export function withWhy(label, why) {
  const w = String(why ?? "").trim();
  return w ? `${label} (${w})` : label;
}
