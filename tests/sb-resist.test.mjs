import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sbResistFor, sbResistFormula } from "../module/rules/sb-resist.mjs";
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
