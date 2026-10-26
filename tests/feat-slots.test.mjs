import test from "node:test"; import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unlockedSlots, firstFreeFeatLevel, activatePlan } from "../module/ce7/feat-logic.mjs";

const f = (src, lvl) => ({ system: { featSource: src, featLevel: lvl } });
test("unlocked slots follow adventurer level", () => {
  assert.deepEqual([0, 1, 2, 3, 5, 15, 20].map(unlockedSlots), [0, 1, 1, 2, 3, 8, 8]);
});
test("first free feat level skips taken and locked slots", () => {
  assert.equal(firstFreeFeatLevel([], 3), 1);
  assert.equal(firstFreeFeatLevel([f("slot", 1)], 3), 3);
  assert.equal(firstFreeFeatLevel([f("slot", 1), f("slot", 3)], 3), null);
  assert.equal(firstFreeFeatLevel([], 0), null);
});
test("Activate on an unassigned feat puts it in the first free slot; untick takes it out", () => {
  assert.deepEqual(activatePlan(f("", 0), true, [f("slot", 1)], 5).patch, { "system.featSource": "slot", "system.featLevel": 3 });
  assert.deepEqual(activatePlan(f("", 0), true, [f("slot", 1)], 1), { warn: "noSlot" });
  assert.equal(activatePlan(f("auto", 0), true, [], 5), null);
  assert.deepEqual(activatePlan(f("slot", 3), false, [], 5).patch, { "system.featSource": "", "system.featLevel": 0 });
  assert.equal(activatePlan(f("auto", 0), false, [], 5), null);
});
test("sheet: feat rows and belt items are draggable, unassigned list is a drop zone, Classes tab lists combat feats", () => {
  const feats = readFileSync(new URL("../templates/actor/parts/actor-ce7-feats.hbs", import.meta.url), "utf8");
  const belt = readFileSync(new URL("../templates/actor/parts/actor-ce7-belt.hbs", import.meta.url), "utf8");
  const sheet = readFileSync(new URL("../templates/actor/actor-character-sheet.hbs", import.meta.url), "utf8");
  const js = readFileSync(new URL("../module/sheets/actor-sheet.mjs", import.meta.url), "utf8");
  assert.match(feats, /ce7-drag/); assert.match(belt, /ce7-drag/);
  assert.match(feats, /data-sw-drop="unassigned"/);
  assert.match(js, /dragSelector: "li\.item, \.ce7-drag"/);
  assert.doesNotMatch(js, /dropEffect = "copy"/);
  const classes = sheet.slice(sheet.indexOf('class="tab classes"'));
  assert.match(classes.slice(0, 2000), /actor-combatabilities\.hbs/);
});
