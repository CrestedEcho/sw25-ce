import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Load powerroll.mjs without Foundry: swap the sw25.mjs import for an empty reference table.
async function loadPowerRoll() {
  const src = readFileSync(new URL("../module/helpers/powerroll.mjs", import.meta.url), "utf8")
    .replace(/import \{ rpt \} from "\.\.\/sw25\.mjs";/, "const rpt = {};");
  const f = join(mkdtempSync(join(tmpdir(), "sw25pr-")), "powerroll.mjs");
  writeFileSync(f, src);
  return import(f);
}
function scriptedRoll(pairs) {
  const q = pairs.slice();
  return class { constructor(formula) { this.formula = formula; }
    async evaluate() {
      const n = Number(this.formula.split("d")[0]);
      const dice = n === 2 ? q.shift() : Array(n).fill(1);
      this.terms = [{ results: dice.map((r) => ({ result: r })) }];
      this.result = dice.reduce((a, b) => a + b, 0); return this; } };
}

test("weapon crit: 10 then 6 on Power 17 @10 sums both table values plus bonus once", async () => {
  const { powerRoll } = await loadPowerRoll();
  globalThis.Roll = scriptedRoll([[4, 6], [3, 3]]);
  const pt = Array(21).fill(0);
  pt[0] = 17; pt[1] = 10;
  [1, 2, 3, 4, 5, 5, 6, 7, 7, 8].forEach((v, i) => (pt[i + 3] = v));
  pt[13] = 4; // bonus (powMod)
  pt[17] = null;
  const r = await powerRoll("2d6", pt);
  assert.equal(r.rollCount, 1); // => "1 Extra Roll" shown, i.e. it was a crit
  assert.deepEqual(r.eachPowerResult, [7, 4]);
  assert.equal(r.powerResult, 15);
  assert.deepEqual(r.fakeResult.terms[0].results.map((x) => x.result), [4, 6, 3, 3]);
});
