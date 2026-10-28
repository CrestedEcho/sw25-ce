/* sw25-ce spell damage from the power table. PURE (no Foundry globals).
 * Book rule: roll 2d6, read the spell's Power N column (data: power.table = values for 3..12, or the global
 * rating table), add Magic Power. 2 (1+1) = automatic failure, 0 damage. Roll >= crit -> roll again and add
 * (repeat). Magic damage ignores Defense. Resisted ("Half") = half, rounded UP.
 */
import { spellMpValue } from "./spell-mp.mjs";
/** Table value for a 2d6 total (3..12) from the spell's own table, else fallbackRow (rpt[rate], also 3..12). */
export function tableValue(power, total, fallbackRow = null) {
  if (total <= 2) return 0;
  const t = Math.min(12, total);
  const row = Array.isArray(power?.table) && power.table.length >= 10 ? power.table : fallbackRow;
  const v = Number(row?.[t - 3]);
  return Number.isFinite(v) ? v : 0;
}
/** rolls: array of 2d6 totals in order (first is the base roll; more are consumed only on criticals). */
export function spellDamage({ power, crit = 10, magicPower = 0, rolls = [], fallbackRow = null }) {
  const c = Math.max(8, Number(crit) || 10);
  const used = []; let sum = 0; let i = 0;
  if (!rolls.length) return { fumble: false, crits: 0, rolls: used, table: 0, total: 0, half: 0 };
  if (rolls[0] <= 2) return { fumble: true, crits: 0, rolls: [rolls[0]], table: 0, total: 0, half: 0 };
  while (i < rolls.length) {
    const r = rolls[i++]; used.push(r); sum += tableValue(power, r, fallbackRow);
    if (r < c || r <= 2) break;
  }
  const total = sum + (Number(magicPower) || 0);
  return { fumble: false, crits: used.filter((r) => r >= c).length, rolls: used, table: sum, total, half: Math.ceil(total / 2) };
}
/** "Magic Damage +2 points" -> 2 (only plain magic-damage weak points; elemental ones like "Wind type" are not applied). */
export function magicWeakBonus(weakPoint) {
  const m = String(weakPoint ?? "").match(/^\s*magic(?:al)?\s+damage\s*\+\s*(\d+)/i);
  return m ? Number(m[1]) : 0;
}
/** Damage actually taken: Defense ignored for magic; +weak-point bonus only when revealed (Monster Knowledge >= Weakness). */
export function magicDamageTaken(amount, weakPoint, revealed = true) {
  const a = Math.max(0, Number(amount) || 0);
  return a > 0 ? a + (revealed ? magicWeakBonus(weakPoint) : 0) : 0;
}
/** "Physical Damage +2 points" -> 2. */
export function physicalWeakBonus(weakPoint) {
  const m = String(weakPoint ?? "").match(/^\s*physical\s+damage\s*\+\s*(\d+)/i);
  return m ? Number(m[1]) : 0;
}
/** Damage taken by kind: physical subtracts Defense (min 0) then adds a revealed "Physical Damage +N"; magic ignores Defense. */
export function damageTaken(amount, { kind = "magic", defense = 0, weakPoint = "", revealed = true } = {}) {
  if (kind !== "physical") return magicDamageTaken(amount, weakPoint, revealed);
  const a = Math.max(0, (Number(amount) || 0) - (Number(defense) || 0));
  return a > 0 ? a + (revealed ? physicalWeakBonus(weakPoint) : 0) : 0;
}
/** Heal spell from its data (summary/description/name), e.g. Cure Wounds "Heal target's wounds with Power 10". */
export function isHealSpell({ name = "", summary = "", description = "" } = {}) {
  const t = `${summary} ${String(description).replace(/<[^>]+>/g, " ")}`;
  return /\b(heal(s|ing)?|recover(s|y)?|restore(s)?)\b[^.]{0,40}\b(wounds?|hp|hit points)\b/i.test(t) || /^\s*heal(s|ing)?\b/i.test(summary) || /\bcure wounds\b/i.test(name);
}
/** HP after healing, capped at max (never lowered if already above max). */
export const healedHP = (before, amount, max) => Math.max(Number(before) || 0, Math.min(Number(max) || 0, (Number(before) || 0) + Math.max(0, Number(amount) || 0)));
/** True when a spell carries the compendium {rate, table} power object (vs the legacy numeric power + pt3..pt12). */
export const hasPowerObject = (sys) => !!sys && typeof sys.power === "object" && sys.power !== null && Array.isArray(sys.power.table);
/** Roll damage with an async 2d6 roller (returns a total). Rerolls on crit; shared by monster and PC casting. */
export async function rollSpellDamage({ power, crit = 10, magicPower = 0 }, roll2d6) {
  const c = Math.max(8, Number(crit) || 10); const rolls = [];
  for (let n = 0; n < 20; n++) { const r = Number(await roll2d6()); rolls.push(r); if (n === 0 && r <= 2) break; if (r < c) break; }
  return { ...spellDamage({ power, crit: c, magicPower, rolls }), magicPower: Number(magicPower) || 0 };
}
/** PC cast plan: meta for castChatHTML + MP deduction from the actor's current MP (prepared mpcost, reductions applied). */
export function planPcCast(itemName, sys, mpValue) {
  const mp = Math.max(0, Number(spellMpValue(sys)) || 0); const before = Number(mpValue) || 0;
  const meta = { name: itemName, school: sys.typename || sys.type || "", level: sys.level ?? sys.flagsLevel ?? "?", power: sys.power, powerCrit: Number(sys.powerCrit) || 10,
    resist: sys.resist ?? "", heal: isHealSpell({ name: itemName, summary: sys.summary, description: sys.description }), cost: { raw: sys.mpcostText ? String(sys.mpcostText) : "", hp: 0 } };
  return { meta, mp, magicPower: Number(sys.powerbase) || 0, res: { mpBefore: before, mpAfter: before - mp, hpBefore: 0, hpAfter: 0, mpShort: before < mp, hpShort: false } };
}
