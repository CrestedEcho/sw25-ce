import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import path from "node:path"; import os from "node:os";
import { buildPowerTable, missingOwnRows } from "../module/rules/power-table-row.mjs";

import { POWER_TABLE } from "../module/data/power-table.mjs";
// Real built data (private, outside git): skip when the build isn't on this machine.
const SRC = process.env.SW25_BUILD_SRC ?? "/tmp/sw25-compendia-build/src";
const ACTORS = path.join(SRC, "sw25-test-actors");
const haveBuild = fs.existsSync(ACTORS);

async function loadPowerRoll(warnings) {
  const src = fs.readFileSync(new URL("../module/helpers/powerroll.mjs", import.meta.url), "utf8")
    .replace(/import \{ rpt \} from "\.\.\/sw25\.mjs";/, "const rpt = {};")
    .replace("../rules/power-lookup.mjs", new URL("../module/rules/power-lookup.mjs", import.meta.url).href);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sw25bw-")), "powerroll.mjs");
  fs.writeFileSync(f, src);
  globalThis.ui = { notifications: { warn: (m) => warnings.push(m) } };
  return import(f);
}
const fixedRoll = (a, b) => class { constructor(f) { this.formula = f; }
  async evaluate() { this.terms = [{ results: [{ result: a }, { result: b }] }]; this.result = a + b; return this; } };
const asDataPt = (t) => String(t).split(","); // Handlebars renders the array joined, undefined -> ""
const pcWeapons = () => fs.readdirSync(ACTORS).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(ACTORS, f), "utf8")))
  .flatMap((a) => (a.items ?? []).filter((i) => i.type === "weapon").map((i) => ({ actor: a.name, i })));

test("built PC weapons carry their own pt3..pt12 rows and only catalogue extra damage", { skip: !haveBuild && "no build" }, () => {
  const ws = pcWeapons();
  assert.ok(ws.length > 0);
  for (const { actor, i } of ws) {
    if (i.system.power == null) continue;
    assert.equal(missingOwnRows(i.system), false, `${actor}: ${i.name} has no table rows`);
    const cat = i.flags?.["sw25-ce"]?.data ?? {};
    // sheet extraDamage/accuracy are book totals the engine re-derives; they must not land in dmod/hit
    if (cat.extraDamage && cat.extraDamage > 0) assert.notEqual(i.system.dmod, cat.extraDamage, `${actor}: ${i.name} dmod = sheet total`);
  }
});

test("Human Warrior Bastard Sword (real built item): roll 5 -> table 3, bonus counted once", { skip: !haveBuild && "no build" }, async () => {
  const w = pcWeapons().find((x) => x.actor === "Human Warrior" && x.i.name === "Bastard Sword");
  assert.ok(w, "Human Warrior / Bastard Sword in build");
  const warnings = []; const { powerRoll } = await loadPowerRoll(warnings);
  globalThis.Roll = fixedRoll(2, 3);
  // runtime adds item dmod into powerbase; class level + Str bonus = 4 for this PC
  const sys = { ...w.i.system, totalcvalue: w.i.system.cvalue, powerbase: 4 + Number(w.i.system.dmod || 0) };
  const r = await powerRoll("2d6", asDataPt(buildPowerTable(sys))); // the sheet passes data-pt as strings
  assert.deepEqual(warnings, []);
  assert.deepEqual(r.eachPowerResult, [3]);
  assert.equal(r.powMod, 4);
  assert.equal(r.powerResult, 7); // ce.12 in Foundry: 3 + 4 = 7
});

test("old-build world copy (no rows): the bundled community table now fills the row, no 'no row' warning", async () => {
  const stale = { power: 17, cvalue: 10, totalcvalue: 10, hit: 5, dmod: 4 };
  assert.equal(missingOwnRows(stale), true);
  const warnings = []; const { powerRoll } = await loadPowerRoll(warnings);
  globalThis.Roll = fixedRoll(2, 3);
  const r = await powerRoll("2d6", asDataPt(buildPowerTable({ ...stale, powerbase: 4 + stale.dmod })));
  assert.equal(r.powMod, 8);
  const v = POWER_TABLE[17][5 - 3];
  assert.deepEqual(r.eachPowerResult, [v]);
  assert.equal(r.powerResult, v + 8); // bonus is still the stale doubled dmod (old build), but the roll is no longer 0
  assert.equal(warnings.length, 0);
});

test("buildPowerTable slot layout matches PT indices", async () => {
  const { PT } = await loadPowerRoll([]);
  const t = buildPowerTable({ power: 17, totalcvalue: 10, pt3: 1, pt12: 8, powerbase: 4 }, { powmod: 2, lethaltech: 1 });
  assert.equal(t.length, 21);
  assert.equal(t[PT.POWER], 17); assert.equal(t[PT.CVALUE], 10); assert.equal(t[PT.TABLE_3], 1); assert.equal(t[PT.TABLE_12], 8);
  assert.equal(t[PT.POWMOD], 4); assert.equal(t[PT.LETHALTECH], 1); assert.equal(t[PT.POWTABLEMOD], 2);
});
