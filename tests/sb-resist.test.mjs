import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sbResistFor, sbResistFormula, needsDodgePart } from "../module/rules/sb-resist.mjs";
import { prepareStatBlock } from "../module/rules/statblock.mjs";

const view = prepareStatBlock({ fortitude: 6, willpower: { value: 5, fixed: 12 }, parts: [{ name: "Head", evasion: 4 }, { name: "Body", evasion: 3, isCore: true }] }, {}, "monster");

test("resist values come from the stat block (core part evasion, fortitude, willpower)", () => {
  assert.deepEqual(sbResistFor(view, "Dodge"), { value: 3, fixed: 10 });
  assert.deepEqual(sbResistFor(view, "Vitres"), { value: 6, fixed: 13 });
  assert.deepEqual(sbResistFor(view, "Mndres"), { value: 5, fixed: 12 });
  assert.equal(sbResistFor(view, "Other"), null);
  assert.equal(sbResistFor({ parts: [] }, "Vitres"), null);
  assert.equal(sbResistFor(undefined, "Vitres"), null);
});

test("formula: fixed value or 2d6 + value", () => {
  assert.deepEqual(sbResistFormula({ value: 6, fixed: 13 }, true), { checkformula: "13", checkbase: "" });
  assert.deepEqual(sbResistFormula({ value: 6, fixed: 13 }, false), { checkformula: "2d6", checkbase: "+ 6" });
  assert.deepEqual(sbResistFormula({ value: -1, fixed: 6 }, false), { checkformula: "2d6", checkbase: "-1" });
  assert.equal(sbResistFormula(null), null);
});

test("createActor no longer adds default Resist/Attack monsterabilities", () => {
  const src = readFileSync(new URL("../module/sw25.mjs", import.meta.url), "utf8");
  const hook = src.slice(src.indexOf('Hooks.on("createActor"'), src.indexOf("// Set default item"));
  assert.doesNotMatch(hook, /type: "monsterability"/);
  assert.doesNotMatch(hook, /SW25\.Config\.MonRes"|SW25\.Config\.MonWp/);
  assert.match(hook, /actor\.type == "character"/);
});

test("dodge: chosen part's Evasion on multi-part monsters; single part auto-picks", () => {
  assert.deepEqual(sbResistFor(view, "Dodge", 0), { value: 4, fixed: 11 });
  assert.deepEqual(sbResistFor(view, "Dodge", 1), { value: 3, fixed: 10 });
  assert.deepEqual(sbResistFor(view, "Dodge", 9), { value: 3, fixed: 10 }); // bad index -> core
  assert.equal(needsDodgePart(view, "Dodge"), true);
  assert.equal(needsDodgePart(view, "Vitres"), false);
  const one = prepareStatBlock({ parts: [{ name: "Body", evasion: 5 }] }, {}, "monster");
  assert.equal(needsDodgePart(one, "Dodge"), false);
  assert.deepEqual(sbResistFor(one, "Dodge"), { value: 5, fixed: 12 });
});

test("fortitude/willpower include the Sword Shard bonus (monsters only, not NPCs)", () => {
  const raw = (n) => ({ fortitude: 6, willpower: 5, swordShards: n, parts: [{ name: "Body", evasion: 3 }] });
  for (const [n, add] of [[0, 0], [1, 1], [5, 1], [6, 2], [10, 2], [11, 3], [15, 3], [16, 4], [30, 4]]) {
    const v = prepareStatBlock(raw(n), {}, "monster");
    assert.deepEqual(sbResistFor(v, "Vitres"), { value: 6 + add, fixed: 13 + add }, `shards ${n}`);
    assert.deepEqual(sbResistFor(v, "Mndres"), { value: 5 + add, fixed: 12 + add }, `shards ${n}`);
  }
  const npc = prepareStatBlock(raw(12), {}, "npc");
  assert.deepEqual(sbResistFor(npc, "Vitres"), { value: 6, fixed: 13 });
  assert.deepEqual(sbResistFor(prepareStatBlock(raw(3), {}, "monster"), "Dodge"), { value: 3, fixed: 10 }); // evasion unaffected
});

test("chat resist button wires the multi-part picker", () => {
  const src = readFileSync(new URL("../module/helpers/chatbutton.mjs", import.meta.url), "utf8");
  assert.match(src, /needsDodgePart\(sbView, resKey\)[\s\S]{0,250}pickEvasionPart\(selectActor/);
  assert.match(readFileSync(new URL("../module/rules/attack-flow.mjs", import.meta.url), "utf8"), /export async function pickEvasionPart/);
});
