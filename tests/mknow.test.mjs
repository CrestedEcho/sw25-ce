import { test } from "node:test"; import assert from "node:assert/strict";
import { isMonsterKnowledge, knowledgeUpdates } from "../module/rules/mknow.mjs";
import { magicDamageTaken } from "../module/rules/spell-power.mjs";
test("Monster Knowledge name", () => { assert.ok(isMonsterKnowledge("Monster Knowledge")); assert.ok(!isMonsterKnowledge("Initiative")); });
test("weakness revealed at >= Weakness (Kobold 11, Goblin 10); reputation too", () => {
  const kobold = { reputation: 6, weakness: 11 }; const goblin = { reputation: 5, weakness: 10 };
  assert.deepEqual(knowledgeUpdates(10, kobold), { "system.sb.reputationReached": true });
  assert.deepEqual(knowledgeUpdates(11, kobold), { "system.sb.reputationReached": true, "system.sb.weaknessRevealed": true });
  assert.deepEqual(knowledgeUpdates(10, goblin)["system.sb.weaknessRevealed"], true);
  assert.deepEqual(knowledgeUpdates(4, goblin), {});
  assert.deepEqual(knowledgeUpdates(12, { reputation: 6, weakness: 11, reputationReached: true, weaknessRevealed: true }), {});
});
test("magic weak point only when revealed", () => {
  assert.equal(magicDamageTaken(5, "Magic Damage +2 points", false), 5);
  assert.equal(magicDamageTaken(5, "Magic Damage +2 points", true), 7);
});
