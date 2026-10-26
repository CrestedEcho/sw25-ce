import test from "node:test"; import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beltPickList, assignBeltSlot } from "../module/ce7/belt-logic.mjs";
const c = (id, name, sys = {}) => ({ id, name, img: `${id}.webp`, type: "consumable", system: sys });
test("picker lists only consumables not already on the belt, sorted, with uses left", () => {
  const items = [c("b", "Potion", { limitedUses: true, uses: { value: 2, max: 3 } }), { id: "x", name: "Sword", type: "weapon", system: {} },
    { id: "y", name: "Old herb", type: "item", system: {} }, c("a", "Awake potion"), c("z", "Bandage", { limitedUses: true, quantity: 4 })];
  const rows = beltPickList(items, ["z", ""]);
  assert.deepEqual(rows.map((r) => r.id), ["a", "b"]);
  assert.equal(rows[0].unlimited, true); assert.deepEqual([rows[1].left, rows[1].max], [2, 3]);
  assert.deepEqual(beltPickList([], []), []);
});
test("assign puts id in the slot, moves it if already elsewhere, pads short belts", () => {
  assert.deepEqual(assignBeltSlot(["", "a"], 0, "a"), ["a", ""]);
  assert.deepEqual(assignBeltSlot([], 2, "b"), ["", "", "b"]);
  assert.deepEqual(assignBeltSlot({ 0: "q" }, 1, "b"), ["q", "b"]);
});
test("empty belt slot has the click tooltip; listener + picker wired (shared by PC and stat-block sheets)", () => {
  const t = readFileSync(new URL("../templates/actor/parts/actor-ce7-belt.hbs", import.meta.url), "utf8");
  assert.match(t, /SW25\.V2\.Belt\.EmptyTip/);
  const js = readFileSync(new URL("../module/ce7/equipcard.mjs", import.meta.url), "utf8");
  assert.match(js, /\.ce7-belt-slot:not\(\.filled\)", "click"/); assert.match(js, /DialogV2\.wait/);
  const en = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
  assert.match(en.SW25.V2.Belt.PickNone, /New Consumable/);
});
