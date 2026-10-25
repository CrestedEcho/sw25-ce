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
