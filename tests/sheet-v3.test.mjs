import test from "node:test"; import assert from "node:assert/strict";
import { isNonCombatFeat, nonCombatFeats } from "../module/rules/noncombat.mjs";
import { prepareStatBlock } from "../module/rules/statblock.mjs";
import { buildStatBlockContext } from "../module/rules/statblock-sheet-data.mjs";

test("nonCombat: system flag wins, flags fallback, default false", () => {
  assert.equal(isNonCombatFeat({ system: { nonCombat: true } }), true);
  assert.equal(isNonCombatFeat({ system: { nonCombat: false }, flags: { "sw25-ce": { data: { nonCombat: true } } } }), false);
  assert.equal(isNonCombatFeat({ system: {}, flags: { "sw25-ce": { data: { nonCombat: true } } } }), true);
  assert.equal(isNonCombatFeat({ system: {} }), false);
  const a = { _id: "a", system: { nonCombat: true } }, b = { _id: "b", system: {} };
  assert.deepEqual(nonCombatFeats([a, b]), [a]); assert.equal(nonCombatFeats([a])[0], a, "same document objects");
});

const raw = { level: 6, parts: [{ name: "Arm", hp: 10, defense: 1 }, { name: "Body", hp: 42, hpValue: 21, mp: 12, mpValue: 3, defense: 6, isCore: true }] };
test("NPC Person summary uses main part, current values, and the Combat-tab path", () => {
  const c = buildStatBlockContext({ type: "npc", view: prepareStatBlock(raw, {}, "npc"), raw, isGM: true });
  assert.deepEqual([c.summary.level, c.summary.hp, c.summary.hpMax, c.summary.hpPct, c.summary.mp, c.summary.mpPct, c.summary.def], [6, 21, 42, 50, 3, 25, 6]);
  assert.equal(c.summary.hpPath, "system.sb.parts.1.hpValue"); assert.equal(c.summary.mpPath, "system.sb.parts.1.mpValue");
  assert.equal(buildStatBlockContext({ type: "monster", view: prepareStatBlock(raw, {}, "monster"), raw, isGM: true }).summary, null);
});
