import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";
import { POWER_TABLE, POWER_TABLE_SOURCE } from "../module/data/power-table.mjs";
import { powerLookup, journalRowFilled } from "../module/rules/power-lookup.mjs";

test("bundled table: Power 0..100, totals 3..12, credited as unofficial community table", () => {
  assert.equal(POWER_TABLE.length, 101);
  for (const r of POWER_TABLE) { assert.equal(r.length, 10); assert.ok(r.every(Number.isInteger)); }
  assert.match(POWER_TABLE_SOURCE, /unofficial community power table/);
  assert.match(readFileSync(new URL("../module/data/power-table.mjs", import.meta.url), "utf8"), /Unofficial, community-made/);
});

test("spot values match the community CSV", () => {
  assert.deepEqual(POWER_TABLE[0], [0, 0, 0, 1, 2, 2, 3, 3, 4, 4]);
  assert.deepEqual(POWER_TABLE[1], [0, 0, 0, 1, 2, 3, 3, 3, 4, 4]);
  assert.deepEqual(POWER_TABLE[2], [0, 0, 0, 1, 2, 3, 4, 4, 4, 4]);
  assert.deepEqual(POWER_TABLE[99], [8, 12, 15, 17, 19, 20, 22, 24, 27, 29]);
  assert.deepEqual(POWER_TABLE[100], [8, 12, 15, 18, 19, 20, 22, 24, 27, 30]);
  assert.deepEqual(powerLookup(100, 12), { value: 30, source: "bundled" });
  assert.deepEqual(powerLookup(99, 3), { value: 8, source: "bundled" });
  assert.equal(powerLookup(0, 7).value, 2);
});

test("precedence: filled journal row wins per Power, blank journal row falls back, nothing -> source null", () => {
  const journal = { 10: [9, 9, 9, 9, 9, 9, 9, 9, 9, 99], 20: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 30: ["", "", "", "", "", "", "", "", "", ""] };
  assert.deepEqual(powerLookup(10, 12, { journal }), { value: 99, source: "journal" });
  assert.deepEqual(powerLookup("10", 3, { journal }), { value: 9, source: "journal" });
  assert.deepEqual(powerLookup(20, 12, { journal }), { value: POWER_TABLE[20][9], source: "bundled" });
  assert.equal(powerLookup(30, 5, { journal }).source, "bundled");
  assert.equal(powerLookup(11, 5, { journal }).source, "bundled");
  assert.deepEqual(powerLookup(101, 5, { journal }), { value: 0, source: null });
  assert.deepEqual(powerLookup(10, 5, { journal: {}, bundled: [] }), { value: 0, source: null });
  assert.equal(journalRowFilled([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]), true);
  assert.equal(journalRowFilled([1, 2]), false);
  assert.equal(powerLookup(10, 15).value, POWER_TABLE[10][9]); // totals above 12 (lethal tech etc.) read the 12 column
});

test("natural 2 is always 0 with no lookup, even with a journal row", () => {
  assert.deepEqual(powerLookup(50, 2), { value: 0, source: "natural2" });
  assert.deepEqual(powerLookup(50, 2, { journal: { 50: [9, 9, 9, 9, 9, 9, 9, 9, 9, 9] } }), { value: 0, source: "natural2" });
});

async function loadPowerRoll(rptValue, warnings) {
  const src = readFileSync(new URL("../module/helpers/powerroll.mjs", import.meta.url), "utf8")
    .replace(/import \{ rpt \} from "\.\.\/sw25\.mjs";/, `const rpt = ${JSON.stringify(rptValue)};`)
    .replace("../rules/power-lookup.mjs", new URL("../module/rules/power-lookup.mjs", import.meta.url).href);
  const f = join(mkdtempSync(join(tmpdir(), "sw25pb-")), "powerroll.mjs"); writeFileSync(f, src);
  globalThis.ui = { notifications: { warn: (m) => warnings.push(m) } };
  return import(f);
}
function scripted(pairs) {
  const q = pairs.slice();
  return class { constructor(f) { this.n = Number(String(f).split("d")[0]) || 2; } async evaluate() {
    const d = this.n === 2 && q.length ? q.shift() : Array.from({ length: this.n }, () => 1);
    this.terms = [{ results: d.map((result) => ({ result })) }]; this.result = d.reduce((a, x) => a + x, 0); this.total = this.result; return this; } };
}
const blankPt = (power, crit = 10, mod = 0) => { const pt = new Array(21).fill(0); pt[0] = power; pt[1] = crit; for (let i = 2; i <= 12; i++) pt[i] = null; pt[13] = mod; return pt; };

test("powerRoll: blank item rows use the bundled table; journal row overrides; natural 2 = fumble, 0, no warning", async () => {
  const w = []; let { powerRoll } = await loadPowerRoll({}, w);
  globalThis.Roll = scripted([[3, 4]]);
  let r = await powerRoll("2d6", blankPt(20, 10, 3));
  assert.deepEqual(r.eachPowerResult, [POWER_TABLE[20][7 - 3]]); assert.equal(r.powerResult, POWER_TABLE[20][4] + 3);
  globalThis.Roll = scripted([[1, 1]]);
  r = await powerRoll("2d6", blankPt(20, 10, 3));
  assert.equal(r.fumble, 1); assert.equal(r.powerResult, 0); assert.equal(w.length, 0);
  ({ powerRoll } = await loadPowerRoll({ 20: [5, 5, 5, 5, 77, 5, 5, 5, 5, 5] }, w));
  globalThis.Roll = scripted([[3, 4]]);
  r = await powerRoll("2d6", blankPt(20));
  assert.deepEqual(r.eachPowerResult, [77]);
  assert.equal(w.length, 0);
});
