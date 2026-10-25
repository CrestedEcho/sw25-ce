import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDamage, parseKFormula, formatDamageFormula } from "../module/rules/damage-display.mjs";
test("formatDamage: Power / Crit / Bonus", () => {
  assert.equal(formatDamage(17, 10, 4), "17 / 10 / +4");
  assert.equal(formatDamage("17", "10", "4"), "17 / 10 / +4");
  assert.equal(formatDamage(10, 12, -1), "10 / 12 / -1");
  assert.equal(formatDamage(20, null, 3), "20 / — / +3");
  assert.equal(formatDamage(20, "", undefined), "20 / — / +0");
  assert.equal(formatDamage(undefined, 10, 0), "— / 10 / +0");
});
test("k-formula display parsing, formula itself untouched", () => {
  assert.deepEqual(parseKFormula("k17@10+4"), { power: 17, crit: 10, bonus: 4 });
  assert.equal(formatDamageFormula("k17@10+4"), "17 / 10 / +4");
  assert.equal(formatDamageFormula("k20+3+1"), "20 / — / +4");
  assert.equal(formatDamageFormula("k10@13-1"), "10 / 13 / -1");
  assert.equal(formatDamageFormula("2d6+3"), "2d6+3");
});
