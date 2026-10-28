import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { baseMpCost, clampMpCost, isVariableMpText, spellMpValue } from "../module/rules/spell-mp.mjs";
import { spellInfo, rowData } from "../module/rules/spell-card.mjs";
import { planPcCast } from "../module/rules/spell-power.mjs";

test("base MP: real basempcost wins", () => {
  assert.equal(baseMpCost({ basempcost: 5 }, { mpcost: 9 }), 5);
  assert.equal(baseMpCost({ basempcost: "4" }, {}), 4);
});
test("base MP: falls back to stored source mpcost when basempcost is null/''/0", () => {
  for (const b of [null, undefined, "", 0, "0"]) assert.equal(baseMpCost({ basempcost: b }, { mpcost: 9 }), 9, String(b));
});
test("base MP: genuine 0 stays 0, blank stays null", () => {
  assert.equal(baseMpCost({ basempcost: 0 }, { mpcost: 0 }), 0);
  assert.equal(baseMpCost({ basempcost: 0 }, {}), 0);
  assert.equal(baseMpCost({ basempcost: "" }, { mpcost: "" }), null);
  assert.equal(baseMpCost({}, {}), null);
});
test("clamp: min 1 only for a real positive base", () => {
  assert.equal(clampMpCost(9, 7), 7);
  assert.equal(clampMpCost(3, -2), 1);
  assert.equal(clampMpCost(0, -2), 0);
  assert.equal(clampMpCost(null, -2), null);
  assert.equal(clampMpCost(9, NaN), 9);
});
test("simulated owned prep: imported spell keeps its cost minus reductions", () => {
  const src = { mpcost: 9, mpcostText: "9" }; const sys = { ...src, basempcost: 0 };
  const base = baseMpCost(sys, src);
  sys.mpcost = clampMpCost(base, (Number(base) || 0) - 2 - 0);
  assert.equal(sys.mpcost, 7);
});
test("variable MP text detection", () => {
  assert.equal(isVariableMpText("X"), true);
  assert.equal(isVariableMpText("2+"), true);
  assert.equal(isVariableMpText("9"), false);
  assert.equal(isVariableMpText(""), false);
  assert.equal(isVariableMpText(undefined), false);
});
test("display value + list row", () => {
  assert.equal(spellMpValue({ mpcost: 7, basempcost: 9 }), 7);
  assert.equal(spellMpValue({ mpcost: null, basempcost: 9 }), 9);
  assert.equal(spellMpValue({ mpcost: "", basempcost: "" }), "");
  assert.equal(rowData({ system: { mpcost: 7, mpcostText: "9" } }).mp, "7 MP");
  assert.equal(rowData({ system: { mpcost: null, basempcost: "", mpcostText: "X" } }).mp, "X");
  assert.equal(rowData({ system: { mpcost: 3, mpcostText: "3+" } }).mp, "3+");
  assert.equal(rowData({ system: { mpcost: null, basempcost: "" } }).mp, "—");
  assert.equal(spellInfo({ system: { mpcost: 9 } }).mp, 9);
});
test("cast plan uses the prepared/basic cost", () => {
  const p = planPcCast("S", { mpcost: null, basempcost: 6 }, 20);
  assert.equal(p.mp, 6); assert.equal(p.res.mpAfter, 14);
});
test("item.mjs spell branch uses the fallback base and no blind clamp", () => {
  const s = readFileSync(new URL("../module/documents/item.mjs", import.meta.url), "utf8");
  const a = s.indexOf('if (itemData.type == "spell") {'); const b = s.indexOf('if (itemData.type == "magicalsong")', a);
  const seg = s.slice(a, b);
  assert.ok(seg.includes("baseMpCost(systemData, itemData._source?.system)"));
  assert.equal((seg.match(/clampMpCost\(spellBaseMp/g) || []).length, 10);
  assert.ok(!seg.includes("if (systemData.mpcost < 1) systemData.mpcost = 1;"));
  assert.ok(!seg.includes("Number(systemData.basempcost)"));
});
