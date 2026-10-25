import { test } from "node:test";
import assert from "node:assert/strict";
import { weaponSystem } from "../tools/build-compendia.mjs";
import { damageTaken, physicalWeakBonus } from "../module/rules/spell-power.mjs";
import { weaponCardHTML } from "../module/rules/weapon-card.mjs";

test("weaponSystem: own table/crit, catalogue accuracy and extra damage only (no class+Str totals)", () => {
  const s = weaponSystem({ power: 14, critThreshold: 12, accuracy: 1, extraDamage: 0, powerTable: [1, 2, 3, 4, 4, 4, 5, 6, 7, 8] });
  assert.equal(s.power, 14); assert.equal(s.cvalue, 12); assert.equal(s.hit, 1); assert.equal(s.dmod, 0);
  assert.equal(s.pt6, 4); assert.equal(s.pt3, 1); assert.equal(s.pt12, 8); assert.equal(s.cr, undefined);
  const b = weaponSystem({ power: 17, powerTable: [1, 2, 3, 4, 5, 5, 6, 7, 7, 8] });
  assert.equal(b.cvalue, 10); assert.equal(b.pt5, 3); assert.equal(b.dmod, 0);
  assert.equal(weaponSystem({ power: null }).pt3, undefined);
});
test("physical damage subtracts Defense; weak point only when revealed; magic ignores Defense", () => {
  assert.equal(damageTaken(9, { kind: "physical", defense: 3 }), 6);
  assert.equal(damageTaken(2, { kind: "physical", defense: 5 }), 0);
  assert.equal(physicalWeakBonus("Physical Damage +2 points"), 2);
  assert.equal(damageTaken(9, { kind: "physical", defense: 3, weakPoint: "Physical Damage +2 points", revealed: true }), 8);
  assert.equal(damageTaken(9, { kind: "physical", defense: 3, weakPoint: "Physical Damage +2 points", revealed: false }), 6);
  assert.equal(damageTaken(9, { kind: "physical", defense: 3, weakPoint: "Magic Damage +2 points" }), 6);
  assert.equal(damageTaken(9, { kind: "magic", defense: 3, weakPoint: "Magic Damage +2 points" }), 11);
});
test("weapon item card is never empty", () => {
  const h = weaponCardHTML("Quarterstaff", { checkbase: 5, powerbase: 4, power: 14, totalcvalue: 12, description: "" });
  assert.match(h, /\[\[\/r 2d6\+5/); assert.match(h, /Power 14 @12 \+4/);
});
