import { test } from "node:test";
import assert from "node:assert/strict";
import { planGrants, grantList } from "../module/rules/engine.mjs";

const priest = [
  { choose: "god", options: [{ id: "lumiel", name: "Lumiel" }, { id: "grendal", name: "Grendal" }], level: 1 },
  { kind: "spell", ref: "banish", level: 1 },
  { kind: "spell", ref: "sanity", level: 2 },
  { kind: "spell", ref: "lumiel-special", level: 2, when: { god: "lumiel" } },
  { kind: "spell", ref: "grendal-special", level: 2, when: { god: "grendal" } },
  { kind: "feature", ref: "old-rite", level: 1, level_max: 2 },
];

test("Priest: no god chosen -> pending choice, common grants still flow", () => {
  const p = planGrants(priest, 1, {}, []);
  assert.deepEqual(p.pending.map((g) => g.choose), ["god"]);
  assert.deepEqual(p.add.map((a) => a.ref), ["banish", "old-rite"]);
});

test("Priest two gods: when:{god} picks the right specials", () => {
  const L = planGrants(priest, 2, { god: "lumiel" }, []);
  const G = planGrants(priest, 2, { god: "grendal" }, []);
  assert.ok(L.add.some((a) => a.ref === "lumiel-special") && !L.add.some((a) => a.ref === "grendal-special"));
  assert.ok(G.add.some((a) => a.ref === "grendal-special") && !G.add.some((a) => a.ref === "lumiel-special"));
  assert.equal(L.pending.length, 0);
});

test("Changing god swaps grants; level change adds/removes; level_max retires", () => {
  const have = [{ id: "a", ref: "banish" }, { id: "b", ref: "sanity" }, { id: "c", ref: "lumiel-special" }, { id: "d", ref: "old-rite" }];
  const p = planGrants(priest, 2, { god: "grendal" }, have);
  assert.deepEqual(p.remove, ["c"]);
  assert.deepEqual(p.add.map((a) => a.ref), ["grendal-special"]);
  const up = planGrants(priest, 3, { god: "grendal" }, have);
  assert.ok(up.remove.includes("d"), "level_max 2 retires at 3");
  const down = planGrants(priest, 1, { god: "lumiel" }, have);
  assert.deepEqual(down.remove.sort(), ["b", "c"]);
  assert.deepEqual(planGrants(priest, 0, {}, have).remove.length, 4, "class deleted -> all removed");
});

test("grantOverrides block/add and legacy {uuid} entries", () => {
  const p = planGrants(priest, 1, { god: "lumiel" }, [], { block: ["banish"], add: [{ kind: "feat", ref: "dodge" }] });
  assert.deepEqual(p.add.map((a) => a.ref), ["old-rite", "dodge"]);
  const legacy = [{ level: 1, uuid: "Compendium.sw25-ce.x.Item.abc", name: "Old" }];
  assert.equal(grantList(legacy)[0].kind, "feat");
  const q = planGrants(legacy, 1, {}, [{ id: "z", ref: "Compendium.sw25-ce.x.Item.abc" }]);
  assert.deepEqual([q.add.length, q.remove.length], [0, 0], "already-granted legacy item kept");
});

test("chosen option that is itself a grant is granted; learned-ability choose grants nothing", () => {
  const list = [{ choose: "feat", options: [{ kind: "feat", ref: "targeting" }, { kind: "feat", ref: "dodge" }], level: 1 },
    { choose: "technique", options: [], level: 1 }];
  const p = planGrants(list, 1, { feat: "dodge" }, []);
  assert.deepEqual(p.add, [{ kind: "feat", ref: "dodge" }]);
  assert.deepEqual(p.pending.map((g) => g.choose), ["technique"]);
});
