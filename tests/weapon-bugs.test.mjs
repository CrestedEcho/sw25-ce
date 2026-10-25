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
  assert.match(h, /\[\[\/r 2d6\+5/); assert.match(h, /14 \/ 12 \/ \+4/);
});
import { isHealSpell, healedHP } from "../module/rules/spell-power.mjs";
import { damageHTML } from "../module/rules/sb-cast.mjs";
import { knowledgeUpdates } from "../module/rules/mknow.mjs";
test("heal spells: detected from data, Apply healing button, capped at max HP", () => {
  assert.ok(isHealSpell({ name: "Cure Wounds", summary: "Heal target's wounds with Power 10" }));
  assert.ok(!isHealSpell({ name: "Energy Bolt", summary: "Deal magic damage with Power 10" }));
  const h = damageHTML({ heal: true, power: { rate: 10 }, powerCrit: 10, resist: "Negates" }, { rolls: [7], crits: 0, table: 3, magicPower: 4, total: 7, half: 4 });
  assert.match(h, /data-sw25-heal="7"/); assert.doesNotMatch(h, /sw25-magic-dmg/);
  assert.equal(healedHP(10, 7, 14), 14); assert.equal(healedHP(5, 7, 14), 12); assert.equal(healedHP(16, 3, 14), 16);
});
test("PC wins ties against a fixed value (weakness reveal)", () => {
  assert.equal(knowledgeUpdates(12, { weakness: 12, reputation: 10 })["system.sb.weaknessRevealed"], true);
});
test("Negates spells offer Resisted (no effect) next to Apply", () => {
  const d = { rolls: [7], crits: 0, table: 3, magicPower: 4, total: 7, half: 4 };
  assert.match(damageHTML({ heal: true, power: { rate: 10 }, powerCrit: 10, resist: "Negates" }, d), /data-sw25-heal="7".*data-sw25-resisted/s);
  assert.match(damageHTML({ power: { rate: 10 }, powerCrit: 10, resist: "Negates" }, d), /data-sw25-magic-dmg="7".*data-sw25-resisted/s);
  assert.doesNotMatch(damageHTML({ power: { rate: 10 }, powerCrit: 10, resist: "Half" }, d), /data-sw25-resisted/);
});
