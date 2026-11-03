import { test } from "node:test";
import assert from "node:assert/strict";
import { ruleSourceLevel } from "../module/rules/engine.mjs";

const feat = (featSource) => ({ type: "combatability", system: { featSource, rules: [{ key: "evasion", value: 1 }] } });

test("F3: feat bonuses count only when the feat is slotted or auto-granted", () => {
  assert.equal(ruleSourceLevel(feat("slot"), { adv: 3 }), 3);
  assert.equal(ruleSourceLevel(feat("auto"), { adv: 3 }), 3);
  assert.equal(ruleSourceLevel(feat(""), { adv: 3 }), null, "learned but not slotted: no bonus");
  assert.equal(ruleSourceLevel(feat(undefined), { adv: 3 }), null);
  assert.equal(ruleSourceLevel(feat(""), { adv: 3, actorType: "npc" }), 3, "NPC/monster feats are always on");
});

test("F3: other rule sources unchanged (classes need a level, gear must be equipped)", () => {
  assert.equal(ruleSourceLevel({ type: "skill", system: { skilllevel: 0, rules: [{}] } }), null);
  assert.equal(ruleSourceLevel({ type: "skill", system: { skilllevel: 4, rules: [{}] } }), 4);
  assert.equal(ruleSourceLevel({ type: "armor", system: { equip: false, rules: [{}] } }), null);
  assert.equal(ruleSourceLevel({ type: "armor", system: { equip: true, rules: [{}] } }, { adv: 2 }), 2);
  assert.equal(ruleSourceLevel({ type: "raceability", system: { rules: [{}] } }, { adv: 5 }), 5);
  assert.equal(ruleSourceLevel({ type: "raceability", system: {} }), null);
});

import { declareSlugsFor, useCost, showUse, spendPatch, costNumber } from "../module/rules/ability-use.mjs";
test("F4: Declare chip for any declared ability (flag or declared:<slug> rule), not only feats", () => {
  assert.deepEqual(declareSlugsFor({ type: "enhancearts", name: "Muscle Bear", system: { decla: true } }), ["muscle-bear"]);
  assert.deepEqual(declareSlugsFor({ type: "combatability", name: "X", flags: { "sw25-ce": { slug: "power-strike" } }, system: { decla: true } }), ["power-strike"]);
  assert.deepEqual(declareSlugsFor({ type: "combatability", system: { rules: [{ key: "damage", value: 4, predicate: ["declared:mighty-blow"] }] } }), ["mighty-blow"]);
  assert.deepEqual(declareSlugsFor({ type: "combatability", system: { decla: false } }), []);
});
test("F4: Use button on active abilities; spends the listed MP / HP", () => {
  assert.equal(costNumber("3 MP"), 3); assert.equal(costNumber(""), 0); assert.equal(costNumber(5), 5);
  assert.deepEqual(useCost({ system: { mpcost: "3", hpcost: "" } }), { mp: 3, hp: 0 });
  assert.equal(showUse({ type: "combatability", system: { constant: true } }), false, "passive feat: no Use");
  assert.equal(showUse({ type: "combatability", system: { constant: true, decla: true } }), true);
  assert.equal(showUse({ type: "raceability", system: { constant: false } }), true);
  assert.equal(showUse({ type: "essenceweave", system: { constant: true, hpcost: "2" } }), true, "a cost always shows Use");
  assert.equal(showUse({ type: "weapon", system: {} }), false);
  assert.deepEqual(spendPatch({ mp: { value: 10 }, hp: { value: 20 } }, { mp: 3, hp: 2 }), { ok: true, patch: { "system.mp.value": 7, "system.hp.value": 18 }, spent: "3 MP + 2 HP" });
  assert.equal(spendPatch({ mp: { value: 1 } }, { mp: 3, hp: 0 }).ok, false, "not enough MP: nothing spent");
  assert.deepEqual(spendPatch({ hp: { value: 1 } }, { mp: 0, hp: 3 }).patch, { "system.hp.value": -2 });
});
test("F4: feat-slot, auto and racial rows carry a roll link and an action holder; racial rows drag and click", async () => {
  const fs = await import("node:fs");
  const t = fs.readFileSync(new URL("../templates/actor/parts/actor-ce7-feats.hbs", import.meta.url), "utf8");
  assert.equal((t.match(/class="rollable ce7-roll" data-roll-type="item"/g) ?? []).length, 4);
  assert.equal((t.match(/class="sw-acts"/g) ?? []).length, 4);
  assert.match(t, /ce7feats\.racial as \|it\|}}<div class="item ce7-row ce7-drag" draggable="true"/);
});

test("F5: rules editor renders for any item type (feat, race ability, armor)", async () => {
  globalThis.foundry ??= { utils: {} };
  const { itemRulesEditor } = await import("../module/rules/sheet-ui.mjs");
  const h = itemRulesEditor({ type: "raceability", system: { rules: [{ key: "evasion", mode: "add", value: 1, predicate: ["declared:x"] }] } });
  assert.match(h, /class="rr" data-f="key" value="evasion"/);
  assert.match(h, /declared:x/);
  assert.match(h, /rr-add/);
  assert.match(h, /adventurer level/);
  assert.match(itemRulesEditor({ type: "armor", system: { rules: [] } }), /<tbody><\/tbody>/);
});
