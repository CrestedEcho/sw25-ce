import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { toDoc, idFor, skillTypeOf } from "../tools/build-compendia.mjs";
const load = (p) => JSON.parse(fs.readFileSync(new URL(`../../gen/data/${p}`, import.meta.url)));

test("deterministic ids and slug flag", () => {
  assert.equal(idFor("classes", "fencer"), idFor("classes", "fencer"));
  assert.match(idFor("classes", "fencer"), /^[A-Za-z0-9]{16}$/);
  assert.notEqual(idFor("classes", "fencer"), idFor("feats", "fencer"));
  const d = toDoc("classes", load("classes/fencer.json"));
  assert.equal(d.flags["sw25-ce"].slug, "fencer");
  assert.equal(d.type, "skill");
  assert.ok(Array.isArray(d.system.rules) && d.system.rules.length > 0);
});
test("category/tier inconsistency handled", () => {
  assert.equal(skillTypeOf(load("classes/fighter.json")), "fighterskill");
  assert.equal(skillTypeOf(load("classes/fencer.json")), "fighterskill");
  assert.equal(skillTypeOf(load("classes/priest.json")), "magicuserskill");
});
import { parseMp } from "../tools/build-compendia.mjs";
test("MP text parsing", () => {
  assert.deepEqual(parseMp(19), { raw: "19", base: 19, flag: null });
  assert.equal(parseMp("MP50-200").max, 200);
  const h = parseMp("MP5 + HP5"); assert.equal(h.base, 5); assert.equal(h.hpCost, 5);
  assert.equal(parseMp("MP10 + 5-point min. Mako Stone").makoStone, 5);
  assert.equal(parseMp("varies").flag, "unparsed");
});
test("spell element, god folder, chain-attack todo", () => {
  const e = toDoc("spells", load("spells/earthquake.json")); assert.equal(e.system.element, "earth");
  const g = toDoc("spells", { slug: "x", name: "X", mpCost: "MP8-12", power: null, todo: "power table not parsed" }); assert.ok(g.flags["sw25-ce"].warnings.includes("power-table-empty")); assert.equal(g.system.mpcost, 8);
  const c = toDoc("feats", load("feats/chain-attack.json")); assert.ok(c.flags["sw25-ce"].todo);
});
test("deity-rank power, spell weapon, mpRule", () => {
  const f = toDoc("spells", load("spells/fist-of-god.json")); assert.equal(f.system.powerByDeityRank.major.power, 30); assert.ok(!(f.flags["sw25-ce"].warnings ?? []).includes("power-table-empty"));
  const b = toDoc("spells", load("spells/daemons-blade.json")); assert.equal(b.system.weapon.power, 50); assert.equal(b.system.powerCrit, 10); assert.ok(!b.flags["sw25-ce"].warnings);
  const p = toDoc("spells", load("spells/perfect-cancellation.json")); assert.equal(p.system.mpcost, 33); assert.equal(p.system.mpRule.base, 33);
});
import { checkRefs } from "../tools/build-compendia.mjs";
test("documented-but-unapplied keys are not errors", async () => {
  const all = ["chain-attack", "dodge", "targeting"].map((f) => ({ cat: "feats", d: load(`feats/${f}.json`) }));
  const r = await checkRefs(all);
  assert.deepEqual(r.unmappedKeys, {});
  for (const k of ["attack.extraAttack", "counter.track", "attack.noStray"]) assert.ok(r.documentedNotApplied[k], k);
  const f = toDoc("spells", load("spells/fist-of-god.json")); assert.equal(f.system.mpcost, 8); assert.ok(f.system.mpRule.byDeityRank); assert.ok(!f.flags["sw25-ce"].warnings);
});
