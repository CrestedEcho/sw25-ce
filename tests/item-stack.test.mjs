import { test } from "node:test";
import assert from "node:assert/strict";
import { stackPlan, sameStack, STACKABLE_TYPES } from "../module/ce7/item-stack.mjs";

const loot = (o = {}) => ({ name: "Black Gem", type: "item", system: { quantity: 1, price: 150 }, flags: { "sw25-ce": { data: { materialCard: "Black B" } } }, ...o });
const owned = [{ id: "own1", ...loot({ system: { quantity: 2, price: "150" } }) }, { id: "sw1", name: "Long Sword", type: "weapon", system: { quantity: 1, price: 440 } }];

test("same name, type, price and card adds to the existing quantity", () => {
  assert.deepEqual(stackPlan(owned, loot()), { id: "own1", update: { "system.quantity": 3 } });
  assert.deepEqual(stackPlan(owned, loot({ system: { quantity: 4, price: 150 } })).update, { "system.quantity": 6 });
  // missing/0 quantity counts as 1
  assert.deepEqual(stackPlan(owned, loot({ system: { price: 150 } })).update, { "system.quantity": 3 });
});

test("Shift, or a drop from the same actor (sorting), creates normally", () => {
  assert.equal(stackPlan(owned, loot(), { shiftKey: true }), null);
  assert.equal(stackPlan(owned, loot(), { sameActor: true }), null);
});

test("a different name, price or card, or no match, doesn't stack", () => {
  assert.equal(stackPlan(owned, loot({ name: "Red Gem" })), null);
  assert.equal(stackPlan(owned, loot({ system: { quantity: 1, price: 100 } })), null);
  assert.equal(stackPlan(owned, loot({ flags: { "sw25-ce": { data: { materialCard: "Black A" } } } })), null);
  assert.equal(stackPlan(owned, loot({ flags: {} })), null);
  assert.equal(stackPlan([], loot()), null);
});

test("weapons, armour and accessories never stack; consumables and resources do", () => {
  for (const type of ["weapon", "armor", "accessory"]) {
    assert.equal(STACKABLE_TYPES.has(type), false);
    assert.equal(stackPlan([{ id: "x", name: "Long Sword", type, system: { quantity: 1, price: 440 } }], { name: "Long Sword", type, system: { quantity: 1, price: 440 } }), null);
  }
  const herb = { name: "Healing Potion", type: "consumable", system: { quantity: 5, price: 100 } };
  assert.deepEqual(stackPlan([{ id: "c", ...herb }], { ...herb, system: { quantity: 1, price: 100 } }), { id: "c", update: { "system.quantity": 6 } });
  assert.ok(sameStack({ name: "Mana Shard", type: "resource", system: {} }, { name: "Mana Shard", type: "resource", system: {} }));
  // a type mismatch with the same name doesn't stack
  assert.equal(stackPlan([{ id: "c", ...herb }], { ...herb, type: "item" }), null);
});
