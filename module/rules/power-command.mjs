/**
 * sw25-ce: native power-roll chat command (no Chat Commander needed). Pure parser, no Foundry globals.
 *
 *   /rp k10@9+3 Fire sword          (also /powerroll /powroll /powr /rollpower /rollpow /rpow /pow)
 *   /r p10 @9 +3 -2 Fire sword      (/r and /roll only when the first word is p<N> or k<N>; /r 2d6 is left to core)
 *   /gmr k20, /br k20, /sr k20      (GM-only / blind / self roll mode)
 *
 * Modifiers, glued or space-separated, any order:
 *   k<N> or p<N>  power (required)        @<N>  crit threshold (default 10; 13+ = no crit)
 *   +N / -N       bonus (summed)          h / h+N / h-N  half power (+ bonus after halving)
 *   #N lethal tech · $+N / $-N / $fN critical ray · tfN pharmacist tool · rN power up per crit
 * The first word that is not a modifier starts the comment (shown as the card label).
 */
export const POWER_ALIASES = ["/powerroll", "/powroll", "/powr", "/rollpower", "/rollpow", "/rpow", "/rp", "/pow"];
const ROLL_CMDS = { "/r": null, "/roll": null, "/gmr": "gmroll", "/gmroll": "gmroll", "/br": "blindroll", "/broll": "blindroll", "/blindroll": "blindroll", "/sr": "selfroll", "/selfroll": "selfroll", "/pr": "publicroll", "/publicroll": "publicroll" };

const MOD_TOKEN = /^(?:[kp]\d+|@\d+|h(?:[+-]\d+)?|#[+-]?\d+|\$(?:[+-]|f\+?)\d+|tf\d+|r\d+|[+-]\d+)+$/i;
const PIECE = /([kp])(\d+)|@(\d+)|h([+-]\d+)?|#([+-]?\d+)|\$([+-]\d+|f\+?\d+)|tf(\d+)|r(\d+)|([+-]\d+)/gi;

/** Parse the modifier string (e.g. "k10@9+3-2"). Returns null when there is no power or something is left over. */
export function parsePowerFormula(text) {
  const s = String(text ?? "").replace(/\s+/g, "").toLowerCase();
  if (!s || !MOD_TOKEN.test(s)) return null;
  const out = { power: null, crit: 10, bonus: 0, half: false, halfBonus: 0, lethalTech: 0, criticalRay: 0, pharmTool: 0, powup: 0 };
  let used = 0;
  for (const m of s.matchAll(PIECE)) {
    used += m[0].length;
    if (m[1]) { if (out.power != null) return null; out.power = Number(m[2]); }
    else if (m[3] != null) out.crit = Number(m[3]);
    else if (m[0][0] === "h") { out.half = true; out.halfBonus += Number(m[4] ?? 0); }
    else if (m[5] != null) out.lethalTech = Number(m[5]);
    else if (m[6] != null) out.criticalRay = m[6].replace(/^\+|(?<=f)\+/g, "");
    else if (m[7] != null) out.pharmTool = Number(m[7]);
    else if (m[8] != null) out.powup = Number(m[8]);
    else if (m[9] != null) out.bonus += Number(m[9]);
  }
  if (used !== s.length || out.power == null || out.power > 100) return null;
  return out;
}

/**
 * Parse a whole chat line. Returns null for anything that is not a power roll (so core handles it),
 * else { command, mode (roll mode or null = current), formula (parsed), text (normalized), comment }.
 */
export function parsePowerCommand(line) {
  const m = String(line ?? "").trim().match(/^(\/\S+)(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  const cmd = m[1].toLowerCase(); const rest = (m[2] ?? "").trim();
  const isAlias = POWER_ALIASES.includes(cmd);
  if (!isAlias && !(cmd in ROLL_CMDS)) return null;
  const words = rest ? rest.split(/\s+/) : [];
  // /r & co only take over when the first word is clearly a power (p10 / k10...), never for dice formulas.
  if (!isAlias && !/^[kp]\d+/i.test(words[0] ?? "")) return null;
  const mods = []; let i = 0;
  while (i < words.length && MOD_TOKEN.test(words[i])) mods.push(words[i++]);
  const formula = parsePowerFormula(mods.join(""));
  if (!formula) return isAlias || mods.length || /^[kp]\d+/i.test(words[0] ?? "") ? { command: cmd, error: `Power roll needs a power, e.g. "${cmd} k10@9+3 Sword".` } : null;
  return { command: cmd, mode: isAlias ? null : ROLL_CMDS[cmd], formula, text: powerFormulaText(formula), comment: words.slice(i).join(" ") };
}

/** Old 20-slot powertable for powerRoll(); table rows 2..12 blank -> values come from the Reference Power Table. */
export function powerTableFor(f) {
  const pt = new Array(20).fill(0);
  pt[0] = f.power; pt[1] = f.crit;
  for (let i = 2; i <= 12; i++) pt[i] = null;
  pt[13] = f.bonus; pt[14] = f.half ? 1 : 0; pt[15] = f.halfBonus; pt[16] = f.lethalTech;
  pt[17] = f.criticalRay || 0; pt[18] = f.pharmTool; pt[19] = f.powup;
  return pt;
}

export function powerFormulaText(f) {
  const sg = (n) => (n < 0 ? `${n}` : `+${n}`);
  return `k${f.power}@${f.crit}${f.bonus ? sg(f.bonus) : ""}${f.half ? `h${f.halfBonus ? sg(f.halfBonus) : ""}` : ""}`
    + `${f.lethalTech ? `#${f.lethalTech}` : ""}${f.criticalRay ? `$${/^f/.test(f.criticalRay) ? "" : Number(f.criticalRay) >= 0 ? "+" : ""}${f.criticalRay}` : ""}`
    + `${f.pharmTool ? `tf${f.pharmTool}` : ""}${f.powup ? `r${f.powup}` : ""}`;
}
