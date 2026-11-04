import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as SK from "../module/rules/skill-checks.mjs";
import * as RE from "../module/rules/engine.mjs";
import { SKILL_CHECK_CATALOG } from "../module/data/skill-check-catalog.mjs";

const scoutSkills = [{ package: "technique", checks: ["pickpocket", "disable-device"] }, { package: "movement", checks: ["initiative", "tumble", "hide"] }, { package: "observation", checks: ["search", "notice"] }];
const rangerSkills = [{ package: "technique", checks: ["first-aid", "disable-device*"] }, { package: "movement", checks: ["tumble", "hide"] }, { package: "observation", checks: ["notice*", "search*", "herbology"] }];
const classes = [
  { id: "sc", name: "Scout", level: 3, grants: SK.grantsOf(scoutSkills) },
  { id: "rg", name: "Ranger", level: 5, grants: SK.grantsOf(rangerSkills) },
  { id: "fi", name: "Fighter", level: 6, grants: SK.grantsOf([{ check: "accuracy" }, { check: "evasion" }]) },
];
const abilities = { dex: { mod: 3 }, agi: { mod: 2 }, int: { mod: 1 }, mnd: { mod: 4 } };
const row = (m, id) => m.rows.find((r) => r.id === id);

test("parseCheckId: natural (*) and limit notes", () => {
  assert.deepEqual(SK.parseCheckId("disable-device*"), { id: "disable-device", limit: null, natural: true });
  assert.deepEqual(SK.parseCheckId("monster-knowledge(identify only)"), { id: "monster-knowledge", limit: "identify only", natural: false });
  assert.equal(SK.checkLabel("danger-sense"), "Danger Sense");
});

test("grantsOf: single-check packages, array limits become notes, multi-section packages and combat checks skipped", () => {
  const g = SK.grantsOf([{ package: "insight" }, { package: "monster-knowledge", limit: ["daemon"] }, { package: "multi-section-checks" }, { check: "evasion" }]);
  assert.deepEqual(g.map((x) => [x.id, x.limit]), [["insight", null], ["monster-knowledge", "daemon"]]);
});

test("shipped catalog has no class names and excludes nothing important", () => {
  const src = fs.readFileSync(new URL("../module/data/skill-check-catalog.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /scout|ranger|sage|rider|bard|fighter|geomancer|alchemist|tactician/i);
  for (const id of ["tumble", "search", "monster-knowledge", "jump", "swim", "insight"]) assert.ok(SKILL_CHECK_CATALOG.some((c) => c.id === id), id);
  assert.equal(SKILL_CHECK_CATALOG.find((c) => c.id === "jump").ability, "agi");
  assert.equal(SKILL_CHECK_CATALOG.find((c) => c.id === "swim").ability, "agi");
});

test("default class = highest-level granting class; green only when the chosen class grants", () => {
  const m = SK.buildSkillChecks({ catalog: SKILL_CHECK_CATALOG, classes, abilities, advLevel: 6 });
  const t = row(m, "tumble");
  assert.equal(t.selected, "rg"); assert.equal(t.grants, true); assert.equal(t.value, 5 + 2);
  assert.equal(t.formula, "2d6 + 5[Ranger Lv 5] + 2[Agi]");
  const pp = row(m, "pickpocket"); assert.equal(pp.selected, "sc"); assert.equal(pp.value, 3 + 3);
  const lit = row(m, "literature"); assert.equal(lit.selected, SK.NONE); assert.equal(lit.grants, false); assert.equal(lit.value, 0);
  assert.equal(lit.formula, "2d6");
  assert.ok(!m.rows.some((r) => r.id === "initiative"), "initiative is the header button, not a row");
  assert.equal(row(m, "notice").natural, true); // Ranger lv5 outranks Scout, Ranger's notice is natural-only
});

test("no restrictions: any class, Adventurer level or none can be chosen; non-granting is neutral", () => {
  const m = SK.buildSkillChecks({ catalog: SKILL_CHECK_CATALOG, classes, abilities, advLevel: 6, saved: { literature: { class: "fi" }, climb: { class: "adv" }, tumble: { class: "none" } } });
  const lit = row(m, "literature");
  assert.equal(lit.selected, "fi"); assert.equal(lit.grants, false); assert.equal(lit.className, "Fighter"); assert.equal(lit.value, 6 + 1);
  assert.equal(lit.options.length, 2 + classes.length);
  const climb = row(m, "climb"); assert.equal(climb.className, "Adventurer"); assert.equal(climb.value, 6 + 2);
  assert.equal(row(m, "tumble").value, 0);
  // a saved class that no longer exists falls back to the default
  const m2 = SK.buildSkillChecks({ catalog: SKILL_CHECK_CATALOG, classes, abilities, saved: { tumble: { class: "gone" } } });
  assert.equal(row(m2, "tumble").selected, "rg");
});

test("homebrew classes add their own check rows; missing catalog still works", () => {
  const hb = [{ id: "hb", name: "Chef", level: 2, grants: SK.grantsOf([{ package: "knowledge", checks: ["cooking"] }, { package: "taste" }]) }];
  const m = SK.buildSkillChecks({ catalog: [], classes: hb, abilities });
  assert.equal(row(m, "cooking").grants, true); assert.equal(row(m, "cooking").group, "knowledge"); assert.equal(row(m, "cooking").value, 2 + 1);
  assert.equal(row(m, "taste").group, "other"); assert.equal(row(m, "taste").homebrew, true);
});

test("modifiers: player ±, effects and rule-engine mods are listed in the formula", () => {
  const ruleMods = [
    { label: "Metal armour", source: "Scout", sourceId: "sc", sourceType: "skill", value: -4, checks: ["tumble", "hide"], active: true },
    { label: "Ring", source: "Ring of Agility", sourceId: "r1", sourceType: "accessory", value: 1, checks: ["all"], active: true },
    { label: "Off", source: "x", value: 9, checks: [], active: false },
  ];
  const m = SK.buildSkillChecks({ catalog: SKILL_CHECK_CATALOG, classes, abilities, ruleMods, globalMod: -1,
    saved: { hide: { class: "sc", mod: 2 } }, effects: { allck: 1, package: { move: 1 } } });
  const hide = row(m, "hide");
  assert.equal(hide.value, 3 + 2 + 1 + 1 - 4 + 1 - 1 + 2);
  assert.match(hide.formula, /- 4\[Metal armour \(Scout\)\]/);
  assert.match(hide.calc, /\+ 2 \(Situational ±\)/);
  // the Scout's own armour penalty does not apply when rolling Tumble as the Ranger
  const tumble = row(m, "tumble");
  assert.ok(!tumble.mods.some((p) => p.label.startsWith("Metal armour")));
  assert.equal(row(m, "search").mods.some((p) => p.label === "Ring (Ring of Agility)"), true);
});

test("engine: check.<id>.mod and check.all.mod are check modifiers, predicate-gated", () => {
  const src = { id: "a1", name: "Plate", type: "armor", level: 0, rules: [
    { key: "check.tumble.mod", value: -4, predicate: ["armor.metal"], label: "Metal armour" },
    { key: "check.all.mod", value: 1, label: "Lucky" },
  ] };
  const { active, notes } = RE.collectRules([src]);
  assert.equal(notes.length, 0);
  const none = RE.checkMods(active, { armors: [] });
  const metal = RE.checkMods(active, { armors: [{ category: "metalarmor" }] });
  assert.equal(none[0].active, false); assert.equal(metal[0].active, true);
  assert.deepEqual(metal[0].checks, ["tumble"]); assert.deepEqual(metal[1].checks, ["all"]);
  assert.equal(metal[0].sourceType, "armor");
  assert.equal(RE.resolveKey("check.penalty").kind, "check");
});

test("initiative breakdown keeps the item total and adds initiative rule mods", () => {
  const r = SK.initiativeParts({ base: 7, className: "Scout", classLevel: 3, ability: "Agi", abilityMod: 2, ruleMods: [{ label: "Quick", value: 1, checks: ["initiative"], active: true }, { label: "Other", value: 5, checks: ["tumble"], active: true }] });
  assert.equal(r.value, 8); assert.equal(r.formula, "2d6 + 3[Scout Lv 3] + 2[Agi] + 2[Other modifiers] + 1[Quick]");
});
