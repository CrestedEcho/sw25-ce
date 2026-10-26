import test from "node:test"; import assert from "node:assert/strict";
import { isConsumableEntry, consumableSystem, toDoc } from "../tools/build-compendia.mjs";

test("builder: obvious consumables detected, permanent gear stays item", () => {
  for (const name of ["Awake Potion", "Lifegrass", "Healing Herb", "Bandage", "Bullet", "Arrows", "Mako Stone (5 pts)", "Scroll of Light"]) assert.equal(isConsumableEntry({ name }), true, name);
  for (const name of ["Adventurer Set", "Scout's Tools", "Holy Symbol", "Gun Belt", "Torch Holder"]) assert.equal(isConsumableEntry({ name }), false, name);
  assert.equal(isConsumableEntry({ name: "Odd thing", type: "potion" }), true);
  assert.equal(isConsumableEntry({ name: "Odd thing", category: "herb" }), true);
});

test("builder: uses from explicit uses, else quantity, else 1", () => {
  assert.deepEqual(consumableSystem({}, 12), { limitedUses: true, uses: { value: 12, max: 12 }, quantity: 1 });
  assert.deepEqual(consumableSystem({}).uses, { value: 1, max: 1 });
  assert.deepEqual(consumableSystem({ uses: 3 }, 9).uses, { value: 3, max: 3 });
  assert.equal(consumableSystem({ limitedUses: false }).limitedUses, false);
});

test("builder: item catalogue entries convert to type consumable with limited uses", () => {
  const p = toDoc("items", { slug: "healing-potion", name: "Healing Potion", type: "consumable", category: "potion", price: 100 });
  assert.equal(p.type, "consumable"); assert.equal(p.system.limitedUses, true); assert.deepEqual(p.system.uses, { value: 1, max: 1 });
  assert.equal(toDoc("items", { slug: "adventurer-set", name: "Adventurer Set", type: "item" }).type, "item");
  assert.equal(toDoc("items", { slug: "gun-belt", name: "Gun Belt", type: "accessory", slot: "waist" }).type, "accessory");
});
