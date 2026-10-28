import { test } from "node:test";
import assert from "node:assert/strict";
import { MULTS, applyRow, damageBreakdown, damageCardHTML, applyPanelHTML } from "../module/rules/damage-card.mjs";

test("multipliers are -1, 0, 1/4, 1/2, 1, 2", () => assert.deepEqual(MULTS.map((m) => m.v), [-1, 0, 0.25, 0.5, 1, 2]));
test("physical: Defense before the multiplier, halves round up", () => {
  const a = applyRow(12, 3, { kind: "physical", mult: 1 });
  assert.equal(a.final, 9); assert.match(a.text, /12 damage − 3 Defense = 9/);
  assert.equal(applyRow(10, 3, { kind: "physical", mult: 0.5 }).final, 4); // 7 / 2 = 3.5 -> 4
  assert.equal(applyRow(10, 3, { kind: "physical", mult: 0.25 }).final, 2); // 7 / 4 -> 2
  assert.equal(applyRow(10, 3, { kind: "physical", mult: 2 }).final, 14);
  assert.equal(applyRow(2, 5, { kind: "physical" }).final, 0);
});
test("magic / fixed skip Defense; ×0 nothing; ×-1 heals with no Defense", () => {
  assert.equal(applyRow(10, 5, { kind: "magic" }).final, 10);
  assert.equal(applyRow(10, 5, { kind: "fixed", mult: 0.5 }).final, 5);
  assert.equal(applyRow(10, 5, { kind: "physical", mult: 0 }).final, 0);
  const h = applyRow(10, 5, { kind: "physical", mult: -1 }); assert.equal(h.heal, true); assert.equal(h.final, 10);
  assert.equal(applyRow(10, 5, { mult: 7 }).mult, 1); // unknown -> ×1
});
test("weak point bonus after Defense, not on fixed", () => {
  assert.equal(applyRow(10, 3, { kind: "physical", weak: 2 }).final, 9);
  assert.equal(applyRow(3, 3, { kind: "physical", weak: 2 }).final, 0);
  assert.equal(applyRow(10, 3, { kind: "fixed", weak: 2 }).final, 10);
});
test("breakdown: crit rolls listed, bonus once", () => {
  const b = damageBreakdown({ rolls: [{ dice: [5, 6], natural: 11, value: 5 }, { dice: [3, 4], natural: 7, value: 3 }], bonusParts: [{ label: "Class level", value: 3 }, { label: "Ability bonus", value: 2 }], bonus: 6, power: 20, crit: 10 });
  assert.equal(b.crits, 1);
  assert.equal(b.lines.filter((l) => l.bonus).reduce((a, l) => a + l.value, 0), 6);
  assert.deepEqual(b.lines.map((l) => l.label), ["Power 20 roll", "Critical roll 1", "Class level", "Ability bonus", "Other modifiers"]);
  const h = damageCardHTML({ name: "Sword", total: 14, label: "20 / 10 / +6", formula: "Power 20", breakdown: b });
  assert.match(h, /1 critical/); assert.match(h, /sw25-dc-panel/);
});
test("apply panel rows and empty state", () => {
  const h = applyPanelHTML(10, [{ id: "t1", name: "Goblin", defense: 2 }, { id: "t2", name: "Ellen", defense: 4 }], { kind: "physical", mults: { t2: 0.5 } });
  assert.match(h, /10 damage − 2 Defense = 8 ×1 → 8/); assert.match(h, /10 damage − 4 Defense = 6 ×½ → 3/);
  assert.match(h, /sw25-dc-go/);
  assert.match(applyPanelHTML(10, []), /Select tokens/);
});
