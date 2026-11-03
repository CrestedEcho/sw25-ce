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
