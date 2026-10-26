import test from "node:test"; import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { featPickList, slotPatch } from "../module/ce7/feat-logic.mjs";
const f = (id, name, sys = {}) => ({ id, name, img: `${id}.webp`, type: "combatability", system: { featSource: "", ...sys } });
test("feat picker lists only combat feats not in a slot (not auto), sorted, with a short plain note", () => {
  const rows = featPickList([f("b", "Weapon Prof", { overview: "<b>Wear</b> rank A" }), f("s", "Slotted", { featSource: "slot", featLevel: 1 }),
    f("u", "Auto", { featSource: "auto" }), { id: "r", name: "Race", type: "raceability", system: {} }, f("a", "Aimed Attack", { description: "<p>" + "x".repeat(200) + "</p>" })]);
  assert.deepEqual(rows.map((r) => r.id), ["a", "b"]);
  assert.equal(rows[1].note, "Wear rank A"); assert.ok(rows[0].note.length <= 88 && rows[0].note.endsWith("…"));
  assert.deepEqual(featPickList([]), []);
});
test("slot patch keeps Activate in sync", () => {
  assert.deepEqual(slotPatch("3"), { "system.featSource": "slot", "system.featLevel": 3, "system.equip": true });
});
test("empty unlocked slots open the picker; locked slots do not; tooltips present", () => {
  const js = readFileSync(new URL("../module/ce7/equipcard.mjs", import.meta.url), "utf8");
  assert.match(js, /\.ce7-feat-slot:not\(\.filled\):not\(\.locked\)", "click"/); assert.match(js, /openFeatPicker/);
  const en = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8")).SW25.V2.Feats;
  assert.equal(en.EmptyTip, "Click to choose a feat (or drag one here)"); assert.match(en.Locked, /adventurer level/); assert.ok(en.PickNone);
});
