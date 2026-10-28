/**
 * sw25-ce per-weapon attack numbers (PURE, unit-tested). Used by the character sheet's Weapons list
 * cards and by the item-id attack / damage cards.
 *
 * Battle data: { acc, power, crit, bonus, formula, pt, accParts, dmgParts }
 *   acc   = Accuracy modifier (the check is 2d6 + acc)
 *   power / crit / bonus = Power table rate, crit threshold, flat bonus damage
 *   pt    = power table array for powerRoll (bonus lives in pt[POWMOD] + pt[HALFPOWMOD])
 */
import { formatDamage } from "./damage-display.mjs";

export const PTI = { POWER: 0, CVALUE: 1, POWMOD: 13, HALFPOW: 14, HALFPOWMOD: 15, LETHALTECH: 16, CRITICALRAY: 17 };
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const blankCrit = (c) => c == null || c === "" || !Number.isFinite(Number(c));

/** Copy of a weapon's power table, padded to 21 entries. */
function tableOf(wsys) {
  const pt = Array.isArray(wsys?.powertable) ? [...wsys.powertable] : [];
  while (pt.length < 21) pt.push(0);
  if (pt[PTI.POWER] == null || pt[PTI.POWER] === "") pt[PTI.POWER] = wsys?.power ?? 0;
  return pt;
}

/**
 * Character weapon: same numbers the Accuracy / Damage tiles use for the selected weapon,
 * for ANY weapon. extras = { acc, dmg } from class/feat rules (weapon.accuracy / weapon.extraDamage),
 * accDelta = actor-wide Accuracy rule adjustments.
 */
export function pcWeaponBattle(wsys = {}, sd = {}, { extraAcc = 0, extraDmg = 0, accDelta = 0 } = {}) {
  const pt = tableOf(wsys);
  pt[PTI.POWMOD] = n(pt[PTI.POWMOD]) + n(extraDmg);
  pt[PTI.LETHALTECH] = n(pt[PTI.LETHALTECH]) + n(sd.lt) + n(sd.attributes?.ltmod);
  if (!/^f\d+$/.test(String(pt[PTI.CRITICALRAY])))
    pt[PTI.CRITICALRAY] = n(pt[PTI.CRITICALRAY]) + n(sd.cr) + n(sd.attributes?.crmod);
  const crit = blankCrit(wsys.totalcvalue) ? (blankCrit(pt[PTI.CVALUE]) ? null : Number(pt[PTI.CVALUE])) : Number(wsys.totalcvalue);
  const rules = n(extraAcc) + n(accDelta);
  return {
    acc: n(wsys.checkbase) + rules,
    power: wsys.power ?? pt[PTI.POWER], crit,
    bonus: n(pt[PTI.POWMOD]) + n(pt[PTI.HALFPOWMOD]),
    formula: wsys.powerformula || "2d6", pt,
    accParts: [...(wsys._accParts ?? []), { label: "Class / feat rules", value: rules }],
    dmgParts: [...(wsys._dmgParts ?? []), { label: "Class / feat rules", value: n(extraDmg) }],
  };
}

/** Card row for the character Weapons list. */
export function weaponCardRow(item, b, extra = {}) {
  const s = item.system ?? {};
  return {
    id: item.id ?? item._id, name: item.name, img: item.img && !/mystery-man|item-bag/.test(item.img) ? item.img : "systems/sw25-ce/assets/icons/weapon.svg",
    sub: [s.showskill || s.checkskill, s.category, s.usage, s.range ? `Range ${s.range}` : ""].filter(Boolean).join(" · "),
    equipped: !!s.equip, cls: s.showskill || s.checkskill || "—",
    acc: b?.acc == null ? "—" : String(b.acc),
    dmg: formatDamage(b?.power, b?.crit, n(b?.bonus)), power: b?.power ?? "—", crit: b?.crit ?? "—", bonus: n(b?.bonus),
    range: s.range || "", ...extra,
  };
}
