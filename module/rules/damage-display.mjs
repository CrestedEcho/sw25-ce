/* sw25-ce: display-only damage text "Power / Crit / Bonus" (e.g. "17 / 10 / +4"). PURE.
 * Roll formulas still use the k-notation (k17@10+4); this only formats what players see. */
const DASH = "—";
const blank = (v) => v === undefined || v === null || v === "" || (typeof v === "number" && Number.isNaN(v));
function fmtBonus(b) {
  if (blank(b)) return "+0";
  const s = String(b).trim();
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) { const n = Number(s); return n >= 0 ? `+${n}` : `${n}`; }
  return /^[+-]/.test(s) ? s : `+${s}`;
}
/** formatDamage(17, 10, 4) -> "17 / 10 / +4"; no crit (spells) -> "17 / — / +4". */
export function formatDamage(power, crit, bonus) {
  const p = blank(power) ? DASH : String(power);
  const c = blank(crit) || crit === false ? DASH : String(crit);
  return `${p} / ${c} / ${fmtBonus(bonus)}`;
}
/** Parse a k-formula ("k17@10+4", "k20+3+1", "k10@13-1") for display; non-k input returns null. */
export function parseKFormula(f) {
  const m = /^\s*k(\d+)(?:@(\d+))?\s*(.*)$/i.exec(String(f ?? ""));
  if (!m) return null;
  const rest = m[3].replace(/\s+/g, "");
  let bonus = rest || 0;
  if (/^([+-]\d+)+$/.test(rest)) bonus = rest.match(/[+-]\d+/g).reduce((a, x) => a + Number(x), 0);
  return { power: Number(m[1]), crit: m[2] === undefined ? null : Number(m[2]), bonus };
}
/** Display text for a k-formula, or the original string if it isn't one. */
export function formatDamageFormula(f) {
  const p = parseKFormula(f);
  return p ? formatDamage(p.power, p.crit, p.bonus) : String(f ?? "");
}
