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

import { featCardHtml } from "../module/ce7/feat-logic.mjs";
import fs from "node:fs";
test("feat chat card: name, icon, effect, requirements when present", () => {
  const h = featCardHtml({ name: "Targeting", img: "x.webp", system: { description: "<p>No penalty</p>", cond: "Sorcerer 1" } });
  assert.match(h, /Targeting/); assert.match(h, /x\.webp/); assert.match(h, /No penalty/); assert.match(h, /Requirements:<\/b> Sorcerer 1/);
  assert.doesNotMatch(featCardHtml({ name: "A", system: { description: "d", cond: "-" } }), /Requirements/);
  assert.match(featCardHtml({ name: "<b>", system: {} }), /&lt;b&gt;/);
});
test("feat panel: names are show-in-chat, X/assign separate, tooltip text", () => {
  const t = fs.readFileSync(new URL("../templates/actor/parts/actor-ce7-feats.hbs", import.meta.url), "utf8");
  assert.equal((t.match(/ce7-feat-show/g) ?? []).length, 3);
  assert.equal((t.match(/item-edit/g) ?? []).length, 1); // racial abilities only
  const en = JSON.parse(fs.readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
  assert.match(JSON.stringify(en), /Click to show in chat · drag to move · × to take out/);
  const js = fs.readFileSync(new URL("../module/ce7/equipcard.mjs", import.meta.url), "utf8");
  assert.match(js, /closest\("\.ce7-feat-clear, \.ce7-feat-assign"\)\) return/);
  assert.match(js, /ev\.shiftKey\) return it\.sheet\.render\(true\)/);
});
