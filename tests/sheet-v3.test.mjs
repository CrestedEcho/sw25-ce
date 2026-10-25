import test from "node:test"; import assert from "node:assert/strict";
import { accentFor } from "../module/rules/statblock-sheet-data.mjs";
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

test("vitals: one row per part, core first; combat block for monsters + hostile NPCs only", () => {
  const m = { parts: [{ name: "Head", hp: 30, mp: 20 }, { name: "Body", hp: 50, hpValue: 25, isCore: true }, { name: "Tail", hp: 20, mp: 0 }] };
  const c = buildStatBlockContext({ type: "monster", view: prepareStatBlock(m, {}, "monster"), raw: m });
  assert.deepEqual(c.vitals.map((v) => [v.i, v.name, v.isCore]), [[1, "Body", true], [0, "Head", false], [2, "Tail", false]]);
  assert.equal(c.multiPart, true); assert.equal(c.showVitalsInCombat, true); assert.equal(c.vitals[0].hpPct, 50);
  const calm = buildStatBlockContext({ type: "npc", view: prepareStatBlock(raw, {}, "npc"), raw });
  assert.equal(calm.showVitalsInCombat, true); assert.equal(calm.summaryRows.length, 1);
  const host = { ...raw, hostile: true };
  assert.equal(buildStatBlockContext({ type: "npc", view: prepareStatBlock(host, {}, "npc"), raw: host }).showVitalsInCombat, true);
});

import { npcToggleDisposition, DISPOSITION_LABELS } from "../module/rules/statblock.mjs";
test("NPC toggles -> disposition: hostile wins, fellow friendly, else neutral", () => {
  assert.equal(npcToggleDisposition({ hostile: true }), "HOSTILE");
  assert.equal(npcToggleDisposition({ hostile: false }), "NEUTRAL");
  assert.equal(npcToggleDisposition({ fellow: true }), "FRIENDLY");
  assert.equal(npcToggleDisposition({ hostile: true, fellow: true }), "HOSTILE");
  assert.equal(npcToggleDisposition({ hostile: false, fellow: true }), "FRIENDLY", "un-hostiled Fellow returns to Friendly");
  assert.equal(DISPOSITION_LABELS[-1], "Hostile"); assert.equal(DISPOSITION_LABELS[0], "Neutral");
});

import { monsterToggleDisposition, isHostileToggle } from "../module/rules/statblock.mjs";
test("monster Hostile toggle: default Hostile, OFF -> Neutral; theme stays rust", () => {
  assert.equal(monsterToggleDisposition({}), "HOSTILE");
  assert.equal(monsterToggleDisposition({ neutral: true }), "NEUTRAL");
  assert.equal(isHostileToggle({}, "monster"), true);
  assert.equal(isHostileToggle({ neutral: true }, "monster"), false);
  assert.equal(isHostileToggle({}, "npc"), false);
  assert.equal(accentFor("monster", false), "rust");
});
