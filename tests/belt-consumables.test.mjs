import test from "node:test"; import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toggleBeltSlot, consumePlan, hasFormula, usesOf } from "../module/ce7/belt-logic.mjs";

test("belt toggle: tick adds to first free slot, untick removes", () => {
  let r = toggleBeltSlot(["a", "", "c"], "x", true, 6);
  assert.equal(r.changed, true); assert.deepEqual(r.slots.slice(0, 3), ["a", "x", "c"]);
  r = toggleBeltSlot(r.slots, "x", true, 6); assert.equal(r.changed, false);           // already on: no dupe
  r = toggleBeltSlot(r.slots, "x", false, 6); assert.equal(r.slots.includes("x"), false);
  assert.deepEqual(toggleBeltSlot({ 0: "a" }, "b", true, 4).slots, ["a", "b", "", ""]); // object-shaped slots
});

test("belt toggle: full belt reports full and changes nothing", () => {
  const r = toggleBeltSlot(["a", "b", "c", "d"], "e", true, 4);
  assert.equal(r.full, true); assert.equal(r.changed, false); assert.deepEqual(r.slots, ["a", "b", "c", "d"]);
});

test("consume: quantity and uses decrement; last use deletes; empty is refused", () => {
  assert.deepEqual(consumePlan({ system: { quantity: 3 } }), { ok: true, left: 2, delete: false, update: { "system.quantity": 2 } });
  assert.deepEqual(consumePlan({ system: { quantity: 5, uses: { value: 2, max: 3 } } }).update, { "system.uses.value": 1 });
  const last = consumePlan({ system: { quantity: 1 } });
  assert.equal(last.delete, true); assert.equal(last.left, 0); assert.equal(last.update, null);
  assert.equal(consumePlan({ system: { uses: { value: 1, max: 3 } } }).delete, true);
  assert.equal(consumePlan({ system: { quantity: 0 } }).ok, false);
  assert.equal(usesOf({ system: { quantity: 2, qmax: 5 } }).max, 5);
});

test("formula: rolls only when the consumable has check dice or a power roll", () => {
  assert.equal(hasFormula({ system: { usedice: false, usepower: false } }), false);
  assert.equal(hasFormula({ system: {} }), false);
  assert.equal(hasFormula({ system: { usepower: true } }), true);
  assert.equal(hasFormula({ system: { usedice2: true } }), true);
});

test("templates + wiring: belt checkbox and Use button on PC and stat-block inventories; belt slot uses", () => {
  for (const f of ["templates/actor/parts/actor-items.hbs", "templates/actor/sb/sb-inventory.hbs"]) {
    const t = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.match(t, /sw25-belt-toggle/); assert.match(t, /sw25-item-use/);
  }
  assert.match(readFileSync(new URL("../templates/actor/parts/actor-ce7-belt.hbs", import.meta.url), "utf8"), /ce7-belt-use/);
  const src = readFileSync(new URL("../module/ce7/equipcard.mjs", import.meta.url), "utf8");
  assert.match(src, /hasFormula\(it\)\) await it\.rollExec\(\)/); assert.match(src, /await it\.delete\(\)/);
});
