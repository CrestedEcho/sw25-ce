import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as RE from "../module/rules/engine.mjs";
import * as SC from "../module/rules/spell-cast.mjs";

const load = (p) => JSON.parse(fs.readFileSync(new URL(`../../gen/data/${p}`, import.meta.url)));

test("priest influence surcharge: spell-kind rule, by deity rank, per cast", () => {
  const pr = load("classes/priest.json");
  const { active, notes } = RE.collectRules([{ id: "priest", name: "Priest", type: "skill", level: 3, rules: pr.rules, choices: { god: "tidan" } }]);
  assert.ok(!notes.some((n) => n.key === "spell.mpSurcharge.outOfInfluence"));
  const [r] = SC.surchargeRules(active);
  assert.equal(r.source, "Priest");
  assert.equal(SC.influenceSurcharge(r, "ancient"), 0);
  assert.equal(SC.influenceSurcharge(r, "major"), 1);
  assert.equal(SC.influenceSurcharge(r, "minor"), 2);
  assert.equal(SC.influenceSurcharge(r, null), 0);
  assert.equal(SC.spellCostTotal({ base: 5, surcharge: 2 }), 7);
  assert.equal(SC.costLabel({ base: 5, surcharge: 1 }), "5 +1 outside influence = 6");
});

test("Metamagic/Targets: single-target spells only, MP x targets (+ surcharge per cast)", () => {
  const mm = load("feats/metamagic-targets.json");
  const { active, notes } = RE.collectRules([{ id: "mm", name: "Metamagic/Targets", type: "combatability", level: 1, rules: mm.rules }]);
  assert.equal(notes.length, 0);
  for (const t of ["1 Character", "1 character X", "1 Entire Character", "1 object", "1 Spell"]) assert.ok(SC.singleTarget(t), t);
  for (const t of ["Caster", "Touch", "1 area (3m radius) / 5", "Any point", "1 bullet"]) assert.ok(!SC.singleTarget(t), t);
  assert.deepEqual(SC.targetsRule(active, { target: "1 Character" }), { source: "Metamagic/Targets", multiplier: true });
  assert.equal(SC.targetsRule(active, { target: "Caster" }), null);
  assert.equal(SC.targetsRule([], { target: "1 Character" }), null);
  assert.equal(SC.spellCostTotal({ base: 4, targets: 3 }), 12);
  assert.equal(SC.spellCostTotal({ base: 4, targets: 3, surcharge: 1 }), 13);
  assert.equal(SC.costLabel({ base: 4, targets: 3, surcharge: 1 }), "4 x3 +1 outside influence = 13");
  assert.equal(SC.spellCostTotal({ base: 4, targets: 0 }), 4, "at least one target");
});
