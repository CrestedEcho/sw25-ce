import { test } from "node:test"; import assert from "node:assert/strict";
import { fixedToDice, pairFixed, parseSbDamage, applyVital, parseLootRange, lootFor, spellGmOnly, castIsWhisper, slugKey } from "../module/rules/sb-play.mjs";
import { buildStatBlockContext } from "../module/rules/statblock-sheet-data.mjs";

test("fixed -> dice: 2d6 + (fixed - 7)", () => {
  assert.equal(fixedToDice(12).formula, "2d6+5");
  assert.equal(fixedToDice(7).formula, "2d6");
  assert.equal(fixedToDice(5).formula, "2d6-2");
  assert.equal(fixedToDice("x"), null);
  assert.equal(pairFixed({ value: 4 }), 11);
  assert.equal(pairFixed({ value: 4, fixed: 12 }), 12); // locked fixed wins
});

test("damage: dice formula + fixed average 7 + bonus", () => {
  assert.deepEqual(parseSbDamage("2d+3"), { dice: 2, bonus: 3, formula: "2d6+3", average: 10 });
  assert.equal(parseSbDamage("2d6-1").average, 6);
  assert.equal(parseSbDamage("3d").formula, "3d6");
  assert.equal(parseSbDamage("3d").average, 10);
  assert.equal(parseSbDamage("—"), null);
});

test("damage / heal clamping", () => {
  assert.equal(applyVital({ current: 10, max: 18, amount: 4, mode: "damage" }), 6);
  assert.equal(applyVital({ current: 3, max: 18, amount: 8, mode: "damage" }), 0);
  assert.equal(applyVital({ current: 3, max: 18, amount: 8, mode: "damage", allowNegative: true }), -5);
  assert.equal(applyVital({ current: 3, max: 18, amount: 40, mode: "damage", allowNegative: true }), -18);
  assert.equal(applyVital({ current: 15, max: 18, amount: 9, mode: "heal" }), 18);
  assert.equal(applyVital({ current: null, max: 18, amount: 5, mode: "damage" }), 13); // unset current = max
  assert.equal(applyVital({ current: 2, max: 8, amount: 5, mode: "spend", kind: "mp", allowNegative: true }), 0);
  assert.equal(applyVital({ current: 6, max: 8, amount: 5, mode: "restore", kind: "mp" }), 8);
  assert.equal(applyVital({ current: 6, max: 8, amount: -3, mode: "damage" }), 6);
});

test("loot range parser", () => {
  assert.deepEqual(parseLootRange("2-6"), { always: false, min: 2, max: 6 });
  assert.deepEqual(parseLootRange("7～10"), { always: false, min: 7, max: 10 });
  assert.deepEqual(parseLootRange("7–10"), { always: false, min: 7, max: 10 });
  assert.deepEqual(parseLootRange("11+"), { always: false, min: 11, max: Infinity });
  assert.deepEqual(parseLootRange("~6"), { always: false, min: -Infinity, max: 6 });
  assert.deepEqual(parseLootRange("12"), { always: false, min: 12, max: 12 });
  assert.equal(parseLootRange("Always").always, true);
  assert.equal(parseLootRange("", { always: true }).always, true);
  assert.deepEqual(parseLootRange("", { min: 3, max: 5 }), { always: false, min: 3, max: 5 });
  assert.equal(parseLootRange("??"), null);
  const rows = [{ roll: "Always", item: "Fang" }, { roll: "2-6", item: "Trinket" }, { roll: "7-10", item: "Part" }, { roll: "11+", item: "Gem" }];
  assert.deepEqual(lootFor(rows, 8).map((r) => r.item), ["Fang", "Part"]);
  assert.deepEqual(lootFor(rows, 12).map((r) => r.item), ["Fang", "Gem"]);
});

test("no-damage spells whisper to GM by default; flag off posts publicly", () => {
  assert.equal(spellGmOnly({}, "Sleep"), true);
  assert.equal(spellGmOnly({ [slugKey("Blindness")]: false }, "Blindness"), false);
  assert.equal(castIsWhisper({ name: "Sleep", power: null }, {}), true);
  assert.equal(castIsWhisper({ name: "Energy Bolt", power: { rate: 10 } }, {}), false);
  assert.equal(castIsWhisper({ name: "Blindness", power: null }, { blindness: false }), false);
});

test("play context: check buttons, damage average, casting power", () => {
  const view = { parts: [{ name: "Body", isCore: true, accuracy: { value: 5, fixed: 12 }, evasion: { value: 4, fixed: 11 }, damage: "2d+3", defense: 2, hp: 18, mp: 20 }],
    fortitude: { value: 3, fixed: 10 }, willpower: { value: 2, fixed: 9 },
    uniqueSkills: [{ name: "Truespeech Magic 4", check: { value: 4, fixed: 11 }, tags: [] }, { name: "Stealth", check: { value: 3, fixed: 10 }, tags: [] }] };
  const c = buildStatBlockContext({ type: "monster", view, raw: {} });
  assert.equal(c.playParts[0].accuracy.formula, "2d6+5");
  assert.equal(c.playParts[0].damage.average, 10);
  assert.deepEqual(c.resistances.map((r) => r.formula), ["2d6+3", "2d6+2"]);
  assert.deepEqual(c.levelChecks.map((r) => [r.label, r.formula]), [["Stealth", "2d6+3"]]);
  assert.equal(c.casters[0].casting.formula, "2d6+4");
  assert.equal(c.casters[0].magicPower, 4);
});
