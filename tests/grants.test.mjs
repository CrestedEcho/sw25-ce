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

/* ce.21: per-level picks and plain-name options (Enhancer, Bard, Rider, ... one per level) */
import { choiceKind, choicePick, choiceProgress } from "../module/rules/engine.mjs";
const opts = ["beetleskin", "cats-eyes", "animal-shape"];
const enhancer = [1, 2, 3].map((level) => ({ choose: "technique", options: opts, optionsMinLevel: { "animal-shape": 5 }, level }));

test("repeated choice: every level gets its own pick key; single choices keep their name", () => {
  const l = grantList([...enhancer, { choose: "god", options: ["lyphos"], level: 1 }]);
  assert.deepEqual(l.map((g) => g.key), ["technique@1", "technique@2", "technique@3", "god"]);
  assert.deepEqual(l.slice(0, 3).map((g) => [g.index, g.total]), [[1, 3], [2, 3], [3, 3]]);
  assert.deepEqual(l[0].optionsMinLevel, { "animal-shape": 5 });
  assert.equal(grantList([{ choose: "feat", id: "bonus", options: [], level: 1 }])[0].key, "bonus", "explicit id wins");
});

test("plain-name options resolve to grants of the choice's kind; each level grants its own pick", () => {
  const p1 = planGrants(enhancer, 1, {}, []);
  assert.deepEqual(p1.pending.map((g) => g.key), ["technique@1"]);
  const p3 = planGrants(enhancer, 3, { "technique@1": "beetleskin", "technique@2": "cats-eyes" }, []);
  assert.deepEqual(p3.add, [{ kind: "technique", ref: "beetleskin" }, { kind: "technique", ref: "cats-eyes" }]);
  assert.deepEqual(p3.pending.map((g) => g.key), ["technique@3"], "level 3 still open");
  const down = planGrants(enhancer, 1, { "technique@1": "beetleskin", "technique@2": "cats-eyes" }, [{ id: "x", ref: "beetleskin" }, { id: "y", ref: "cats-eyes" }]);
  assert.deepEqual(down.remove, ["y"], "losing a level drops that level's pick");
});

test("legacy single pick (choices.technique) counts for the first level only", () => {
  const p = planGrants(enhancer, 2, { technique: "beetleskin" }, []);
  assert.deepEqual(p.add, [{ kind: "technique", ref: "beetleskin" }]);
  assert.deepEqual(p.pending.map((g) => g.key), ["technique@2"]);
  assert.equal(choicePick(grantList(enhancer)[1], { technique: "beetleskin" }), null);
});

test("choice kinds come from the choice name; god is a selector only", () => {
  assert.equal(choiceKind({ choose: "feat" }), "feat");
  assert.equal(choiceKind({ choose: "language (speak or read)" }), "language");
  assert.equal(choiceKind({ choose: "spellsong-or-finale" }), "technique");
  assert.equal(choiceKind({ choose: "stunt" }), "technique");
  assert.equal(choiceKind({ choose: "god" }), null);
  assert.equal(choiceKind({ choose: "x", kind: "feature" }), "feature");
  assert.deepEqual(planGrants([{ choose: "god", options: ["lyphos"], level: 1 }], 1, { god: "lyphos" }, []).add, []);
  assert.deepEqual(planGrants([{ choose: "feat", options: ["targeting"], level: 1 }], 1, { feat: "targeting" }, []).add, [{ kind: "feat", ref: "targeting" }]);
  assert.deepEqual(planGrants([{ choose: "feat", options: ["targeting"], level: 1 }], 1, { feat: "not-an-option" }, []).add, [], "unknown pick grants nothing");
});

test("choiceProgress shows 'one per level' counts (never a hard limit)", () => {
  assert.deepEqual(choiceProgress(enhancer, 2, { "technique@1": "beetleskin" }).technique, { picked: 1, open: 1, total: 3 });
  assert.deepEqual(choiceProgress(enhancer, 0, {}).technique, { picked: 0, open: 0, total: 3 });
});
