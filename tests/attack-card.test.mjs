import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFormula, partsTo, pcAccuracy, pcEvasion, monsterCheck, standardValue, readRoll, contest, attackCardHTML, breakdownHTML } from "../module/rules/attack-card.mjs";

test("check formulas", () => {
  assert.equal(checkFormula(5), "2d6+5"); assert.equal(checkFormula(-1), "2d6-1"); assert.equal(checkFormula(0), "2d6");
  assert.deepEqual(partsTo(7, [{ label: "A", value: 4 }, { label: "Z", value: 0 }]), [{ label: "A", value: 4 }, { label: "Other modifiers", value: 3 }]);
});
test("PC accuracy / evasion parts add up", () => {
  const acc = pcAccuracy({ itemhitbase: 8 }, { _accParts: [{ label: "Class level", value: 3 }, { label: "Ability bonus", value: 4 }] });
  assert.equal(acc.formula, "2d6+8"); assert.equal(acc.parts.reduce((a, p) => a + p.value, 0), 8);
  const eva = pcEvasion({ dodgebase: 6, skillagidodge: 5, itemdodge: 1, attributes: { dodgemod: 0, efdodgemod: 0 }, effect: {} });
  assert.equal(eva.formula, "2d6+6"); assert.deepEqual(eva.parts.map((p) => p.value), [5, 1]);
});
test("monsters roll 2d6 + Standard Value (fixed - 7)", () => {
  assert.equal(standardValue({ value: 4, fixed: 11 }), 4);
  assert.equal(standardValue({ fixed: 12 }), 5);
  assert.equal(standardValue({ value: 3 }), 3);
  const c = monsterCheck("Evasion", { value: 0, fixed: 10 });
  assert.equal(c.formula, "2d6+3"); assert.deepEqual(c.parts, [{ label: "Standard Value", value: 3 }]);
  assert.equal(monsterCheck("Evasion", null), null);
});
test("contest: tie misses, natural 2 / 12 on both sides", () => {
  const r = (a, b, mod) => readRoll([a, b], a + b + mod);
  assert.equal(contest(r(3, 4, 5), r(3, 4, 4)).result, "hit");
  assert.equal(contest(r(3, 4, 4), r(3, 4, 4)).result, "miss"); // tie
  assert.equal(contest(r(1, 1, 20), r(1, 2, 0)).result, "miss"); // acc natural 2
  assert.equal(contest(r(2, 2, 0), r(1, 1, 20)).result, "hit"); // eva natural 2
  assert.equal(contest(r(6, 6, 0), r(5, 5, 9)).result, "hit"); // acc natural 12
  assert.equal(contest(r(5, 5, 9), r(6, 6, 0)).result, "miss"); // eva natural 12
  assert.equal(contest(r(6, 6, 1), r(6, 6, 1)).result, "miss"); // both 12 -> totals, tie misses
  assert.equal(contest(r(6, 6, 1), null), null);
});
test("attack card HTML: buttons, outcome only when both rolls exist, breakdown", () => {
  const acc = { label: "Accuracy", mod: 5, formula: "2d6+5", parts: [{ label: "Class level", value: 3 }, { label: "Ability bonus", value: 2 }] };
  const base = { name: "Sword <b>", img: "x.png", acc, damageLabel: "5 / 9 / +1" };
  let h = attackCardHTML(base);
  assert.match(h, /data-ac="accuracy"/); assert.match(h, /data-ac="evasion"/); assert.match(h, /data-ac="damage"/);
  assert.match(h, /Sword &lt;b&gt;/); assert.doesNotMatch(h, /HIT|MISS/); assert.match(h, /5 \/ 9 \/ \+1/);
  h = attackCardHTML({ ...base, accRoll: readRoll([4, 5], 14), evaRoll: readRoll([2, 2], 10), evaName: "Goblin" });
  assert.match(h, /HIT/); assert.match(h, /Goblin/);
  assert.match(breakdownHTML(acc, readRoll([4, 5], 14)), /Class level.*\+ 3/s);
  assert.doesNotMatch(h, /fixed value/i);
});
