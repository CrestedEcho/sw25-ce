import test from "node:test"; import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toggleBeltSlot, consumePlan, hasFormula, usesOf, isConsumable, sanitizeBelt } from "../module/ce7/belt-logic.mjs";

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

const C = (system) => ({ type: "consumable", system: { limitedUses: true, ...system } });
test("consume: limited consumable decrements quantity/uses; last use deletes; empty is refused", () => {
  assert.deepEqual(consumePlan(C({ quantity: 3 })), { ok: true, left: 2, delete: false, update: { "system.quantity": 2 }, consumes: true });
  assert.deepEqual(consumePlan(C({ quantity: 5, uses: { value: 2, max: 3 } })).update, { "system.uses.value": 1 });
  const last = consumePlan(C({ quantity: 1 }));
  assert.equal(last.delete, true); assert.equal(last.left, 0); assert.equal(last.update, null);
  assert.equal(consumePlan(C({ uses: { value: 1, max: 3 } })).delete, true);
  assert.equal(consumePlan(C({ quantity: 0 })).ok, false);
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

test("non-consumable (regular item, weapon, ...) is never decremented or deleted on Use", () => {
  for (const it of [{ type: "item", name: "Adventurer Set", system: { quantity: 1 } }, { type: "item", system: { quantity: 1, uses: { value: 1, max: 1 } } },
    { type: "weapon", system: { quantity: 1 } }, { type: "accessory", system: {} }]) {
    const p = consumePlan(it);
    assert.equal(p.ok, true); assert.equal(p.consumes, false); assert.equal(p.delete, false); assert.equal(p.update, null);
  }
});

test("unlimited consumable (Has limited uses off) posts/rolls but never decrements", () => {
  const p = consumePlan({ type: "consumable", system: { limitedUses: false, quantity: 1, uses: { value: 1, max: 1 } } });
  assert.equal(p.ok, true); assert.equal(p.consumes, false); assert.equal(p.delete, false); assert.equal(p.update, null);
});

test("limited consumable: uses 3 -> 2 -> 1 -> delete", () => {
  let it = { type: "consumable", system: { limitedUses: true, quantity: 1, uses: { value: 3, max: 3 } } };
  for (const left of [2, 1]) { const p = consumePlan(it); assert.equal(p.delete, false); assert.equal(p.left, left); it = { ...it, system: { ...it.system, uses: { value: p.update["system.uses.value"], max: 3 } } }; }
  const end = consumePlan(it); assert.equal(end.delete, true); assert.equal(end.left, 0);
});

test("belt rejects non-consumables and sanitize clears stale non-consumable entries", () => {
  assert.equal(isConsumable({ type: "item" }), false); assert.equal(isConsumable({ type: "consumable" }), true);
  const r = toggleBeltSlot(["", ""], "kit", true, 4, { type: "item" });
  assert.equal(r.rejected, true); assert.equal(r.changed, false); assert.deepEqual(r.slots, ["", ""]);
  assert.equal(toggleBeltSlot(["", ""], "pot", true, 4, { type: "consumable" }).changed, true);
  assert.equal(toggleBeltSlot(["kit"], "kit", false, 4, { type: "item" }).changed, true); // unticking always works
  const items = { kit: { type: "item" }, pot: { type: "consumable" } };
  const s = sanitizeBelt(["kit", "pot", "gone", ""], (id) => items[id]);
  assert.equal(s.changed, true); assert.deepEqual(s.slots, ["", "pot", "", ""]);
  assert.equal(sanitizeBelt(["pot", ""], (id) => items[id]).changed, false);
});

test("consumable type wiring: template.json, lang, sheet, belt guards", () => {
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  const tj = JSON.parse(read("template.json"));
  assert.ok(tj.Item.types.includes("consumable")); assert.equal(tj.Item.consumable.limitedUses, true);
  assert.deepEqual(tj.Item.consumable.templates, tj.Item.item.templates);
  assert.equal(JSON.parse(read("lang/en.json")).TYPES.Item.consumable, "Consumable");
  const sheet = read("templates/item/item-consumable-sheet.hbs");
  assert.match(sheet, /system\.limitedUses/); assert.match(sheet, /\{\{#if system\.limitedUses\}\}[\s\S]*system\.uses\.max/);
  assert.doesNotMatch(read("templates/item/item-item-sheet.hbs"), /system\.uses\.max/);
  const inv = read("templates/actor/parts/actor-items.hbs");
  assert.match(inv, /\{\{#if item\.consumable\}\}[\s\S]*sw25-belt-toggle[\s\S]*\{\{else\}\}/);
  const ec = read("module/ce7/equipcard.mjs");
  assert.match(ec, /if \(!isConsumable\(src\)\)/); assert.match(ec, /if \(!plan\.consumes\) return;/); assert.match(ec, /isConsumable\(it\)\) return \{ index, item: null \}/);
  assert.match(read("module/sheets/statblock-sheet.mjs"), /it\.type === "consumable"/);
});
