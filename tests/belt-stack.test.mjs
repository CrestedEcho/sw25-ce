import { test } from "node:test";
import assert from "node:assert/strict";
import { consumePlan, stackLabel, beltPickList } from "../module/ce7/belt-logic.mjs";
const C = (sys) => ({ id: "a", name: "Lifegrass", type: "consumable", system: sys });
const apply = (it, p) => { const s = structuredClone(it.system); for (const [k, v] of Object.entries(p.update)) { if (k === "system.quantity") s.quantity = v; else s.uses.value = v; } return { ...it, system: s }; };

test("Lifegrass x1000 2/2: spending both uses takes one off the stack and refills, never deletes", () => {
  let it = C({ limitedUses: true, quantity: 1000, uses: { value: 2, max: 2 } });
  let p = consumePlan(it); assert.equal(p.delete, false); it = apply(it, p);
  p = consumePlan(it); assert.equal(p.delete, false);
  assert.deepEqual(p.update, { "system.quantity": 999, "system.uses.value": 2 }); it = apply(it, p);
  assert.equal(stackLabel(it), "x999 · 2/2 uses");
});
test("last item, last use -> delete (quantity 1, 0 or unset)", () => {
  for (const quantity of [1, 0, undefined]) assert.equal(consumePlan(C({ limitedUses: true, quantity, uses: { value: 1, max: 2 } })).delete, true);
});
test("stack with uses 0 left still usable from next item", () => {
  const p = consumePlan(C({ limitedUses: true, quantity: 3, uses: { value: 0, max: 2 } }));
  assert.equal(p.ok, true); assert.deepEqual(p.update, { "system.quantity": 2, "system.uses.value": 1 });
});
test("non-limited consumable: each use decrements quantity, delete at 0", () => {
  assert.deepEqual(consumePlan(C({ limitedUses: false, quantity: 5 })).update, { "system.quantity": 4 });
  assert.equal(consumePlan(C({ limitedUses: false, quantity: 1 })).delete, true);
  assert.equal(consumePlan(C({ limitedUses: false, quantity: 0 })).ok, false);
});
test("labels on belt and picker", () => {
  assert.equal(stackLabel(C({ limitedUses: true, quantity: 1000, uses: { value: 2, max: 2 } })), "x1000 · 2/2 uses");
  assert.equal(stackLabel(C({ limitedUses: true, quantity: 1, uses: { value: 1, max: 2 } })), "1/2 uses");
  assert.equal(stackLabel(C({ limitedUses: false, quantity: 3 })), "x3");
  assert.equal(beltPickList([C({ limitedUses: true, quantity: 1000, uses: { value: 2, max: 2 } })], [])[0].stack, "x1000 · 2/2 uses");
});
test("non-consumables never consume", () => assert.equal(consumePlan({ type: "item", system: {} }).consumes, false));
