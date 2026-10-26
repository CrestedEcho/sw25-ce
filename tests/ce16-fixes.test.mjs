import { test } from "node:test";
import assert from "node:assert/strict";
import { weaponCritValue } from "../module/rules/crit-value.mjs";
import { clearPatch, ownedBy, autoFeatPlan } from "../module/ce7/feat-logic.mjs";

test("crit: one formula for sheet and card (Fencer -1, floor 8)", () => {
  assert.equal(weaponCritValue(9, 0, -1), 8);
  assert.equal(weaponCritValue(8, 0, -1), 8);
  assert.equal(weaponCritValue(10, 1, 0), 11);
  assert.equal(weaponCritValue("", 0, 0), 10);
});

test("feat clear patch empties slot and Activate", () => {
  assert.deepEqual(clearPatch(), { "system.featSource": "", "system.featLevel": 0, "system.equip": false });
});

test("ownedBy compares by id, not instance", () => {
  const items = new Map([["i1", {}]]);
  const actor = { id: "a1", items: { get: (id) => items.get(id) } };
  assert.ok(ownedBy({ id: "i1", parent: { id: "a1" } }, actor));
  assert.ok(!ownedBy({ id: "i2", parent: { id: "a1" } }, actor));
  assert.ok(!ownedBy({ id: "i1", parent: { id: "b" } }, actor));
});

test("auto-fill only uses unlocked slots and respects manual/existing layouts", () => {
  const f = (id, src = "") => ({ id, sort: 0, system: { featSource: src } });
  assert.equal(autoFeatPlan([f("a"), f("b")], 2).length, 1);
  assert.equal(autoFeatPlan([f("a"), f("b")], 2)[0]["system.featLevel"], 1);
  assert.deepEqual(autoFeatPlan([f("a"), f("b")], 2, true), []);
  assert.deepEqual(autoFeatPlan([f("a", "slot"), f("b")], 5), []);
  assert.equal(autoFeatPlan([f("a"), f("b"), f("c")], 3).length, 2);
});
