import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pcWeaponBattle, weaponCardRow, PTI } from "../module/rules/weapon-battle.mjs";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
// powertable as item.mjs buildPowerTable makes it: [power, crit, 0, pt3..pt12, powerbase, halfpow, halfpowmod, lt, cr, pharm, powup, powmod]
const table = (power, crit, powerbase, halfpowmod = 0, lt = 0, cr = 0) => [power, crit, 0, 1, 2, 3, 3, 4, 5, 6, 7, 8, 9, powerbase, 0, halfpowmod, lt, cr, 0, 0, 0];

test("PC weapon: Accuracy = checkbase + rules, bonus = powerbase + half-power mod (= tile itempowerbase)", () => {
  const w = { checkbase: 5, power: 17, totalcvalue: 10, powertable: table(17, 10, 4, 1), _accParts: [{ label: "Fighter", value: 3 }] };
  const b = pcWeaponBattle(w, { lt: 0, cr: 0, attributes: {} });
  assert.equal(b.acc, 5); assert.equal(b.power, 17); assert.equal(b.crit, 10); assert.equal(b.bonus, 5);
  assert.equal(b.formula, "2d6");
});
test("PC weapon: rule extras and actor-wide Accuracy go on the numbers AND the rolled table", () => {
  const w = { checkbase: 5, power: 20, totalcvalue: 9, powertable: table(20, 9, 4) };
  const b = pcWeaponBattle(w, {}, { extraAcc: 1, extraDmg: 2, accDelta: 1 });
  assert.equal(b.acc, 7); assert.equal(b.bonus, 6); assert.equal(b.pt[PTI.POWMOD], 6);
  assert.deepEqual(b.accParts.at(-1), { label: "Class / feat rules", value: 2 });
  assert.deepEqual(b.dmgParts.at(-1), { label: "Class / feat rules", value: 2 });
});
test("PC weapon: lethal technique / critical ray added to a COPY, item table untouched", () => {
  const pt = table(10, 10, 3, 0, 1, 0); const w = { checkbase: 2, power: 10, totalcvalue: 10, powertable: pt };
  const b = pcWeaponBattle(w, { lt: 1, cr: 1, attributes: { ltmod: 1, crmod: 0 } });
  assert.equal(b.pt[PTI.LETHALTECH], 3); assert.equal(b.pt[PTI.CRITICALRAY], 1);
  assert.equal(pt[PTI.LETHALTECH], 1); assert.equal(pt[PTI.CRITICALRAY], 0);
  const f = pcWeaponBattle({ ...w, powertable: table(10, 10, 3, 0, 0, "f5") }, { cr: 2 });
  assert.equal(f.pt[PTI.CRITICALRAY], "f5");
});
test("card row: Power / Crit / Bonus text, class, sub line, range, icon fallback", () => {
  const item = { id: "a1", name: "Short Bow", img: "icons/svg/item-bag.svg", system: { showskill: "Shooter", category: "Bow", usage: "2H", range: "30 m", equip: false } };
  const r = weaponCardRow(item, { acc: 4, power: 15, crit: 10, bonus: 3 });
  assert.equal(r.dmg, "15 / 10 / +3"); assert.equal(r.cls, "Shooter"); assert.equal(r.acc, "4");
  assert.equal(r.sub, "Shooter · Bow · 2H · Range 30 m"); assert.equal(r.range, "30 m"); assert.equal(r.equipped, false);
  assert.equal(r.img, "systems/sw25-ce/assets/icons/weapon.svg");
  assert.equal(weaponCardRow({ ...item, img: "x.webp" }, { acc: -1, power: 0, crit: 12, bonus: -2 }).dmg, "0 / 12 / -2");
});
test("character Weapons list template follows the mockup (no k-notation, item-id buttons)", () => {
  const t = src("templates/actor/parts/actor-battleweapons.hbs");
  assert.doesNotMatch(t, /k\{\{system\.power\}\}/);
  for (const s of ["Power / Crit / Bonus", "Roll Accuracy", "Roll Damage", "sw25-wpn-acc", "sw25-wpn-dmg", "eq-change", "item-edit", "item-delete", "{{#each weaponCards"]) assert.ok(t.includes(s), s);
  assert.match(src("templates/actor/actor-character-sheet.hbs"), /selectOptions battleweapons selected=system\.itemid valueAttr="_id"/);
  const sh = src("module/sheets/actor-sheet.mjs");
  assert.match(sh, /\.sw25-wpn-acc, \.sw25-wpn-dmg/);
  assert.match(sh, /context\.weaponCards =/);
});
test("weapon selected by item id (old name values still match); per-weapon battle stored; no in-place table mutation", () => {
  const a = src("module/documents/actor.mjs");
  assert.match(a, /this\.items\.get\?\.\(systemData\.hitweapon\) \?\? this\.items\.find\(\(i\) => i\.type == "weapon" && i\.name == systemData\.hitweapon\)/);
  assert.match(a, /\?\.id \?\? "";/);
  assert.match(a, /systemData\.itempowertable = \[\.\.\.\(item\.system\.powertable \?\? \[\]\)\]/);
  assert.match(a, /w\.system\._battle = pcWeaponBattle\(/);
  const f = src("module/rules/attack-flow.mjs");
  assert.match(f, /item\.system\._battle \?\? pcWeaponBattle/);
  assert.match(f, /postAttackCard\(actor, \{ partIndex = null, itemId: wantId = null \} = \{\}\)/);
});
