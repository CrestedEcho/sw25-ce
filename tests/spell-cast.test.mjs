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
