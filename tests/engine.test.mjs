import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as RE from "../module/rules/engine.mjs";

const load = (p) => JSON.parse(fs.readFileSync(new URL(`../../gen/data/${p}`, import.meta.url)));
const cls = (j, level, extra = {}) => ({ id: j.slug, name: j.name, type: "skill", level, rules: j.rules, choices: {}, ...extra });

test("formulas: numbers, @paths, Math helpers, maps", () => {
  assert.equal(RE.evalValue(3), 3);
  assert.equal(RE.evalValue("@level*2+1", { level: 4 }), 9);
  assert.equal(RE.evalValue("floor(@str/6)", { str: 14 }), 2);
  assert.equal(RE.evalValue("@abilities.int.value", { abilities: { int: { value: 11 } } }), 11);
  assert.equal(RE.evalValue({ ancient: 0, major: 1, minor: 2 }, {}, { godRank: "minor" }), 2);
  assert.equal(RE.evalValue({ ancient: 0, major: 1 }, {}, {}), null);
  assert.equal(RE.evalValue("process.exit()"), null, "unsafe code rejected");
  assert.equal(RE.evalValue("A"), "A");
});

test("modes in priority order: override -> multiply -> add -> upgrade -> downgrade", () => {
  const mk = (mode, value, extra = {}) => ({ key: "hp.max", mode, value, ...extra });
  const { active } = RE.collectRules([{ name: "X", type: "skill", level: 1, rules: [mk("add", 2), mk("override", 10), mk("multiply", 2), mk("upgrade", 25), mk("downgrade", 24)] }]);
  const r = RE.combine(5, active);
  assert.equal(r.value, 24); // 10*2+2=22 -> up 25 -> down 24
  const p = RE.collectRules([{ name: "X", type: "skill", level: 1, rules: [mk("add", 2, { priority: 1 }), mk("multiply", 3)] }]);
  assert.equal(RE.combine(1, p.active).value, 9); // priority 1 add first
});

test("level_min / level_max gate rules; @level uses class level", () => {
  const rules = [{ key: "hp.max", mode: "add", value: "@level", level_min: 3, level_max: 5 }];
  const at = (lv) => RE.combine(0, RE.collectRules([{ name: "C", type: "skill", level: lv, rules }]).active).value;
  assert.deepEqual([at(2), at(3), at(5), at(6)], [0, 3, 5, 0]);
});

test("misc modifier then locked manual override wins", () => {
  assert.deepEqual(RE.applyOverride(10, { mod: 2 }).value, 12);
  assert.equal(RE.applyOverride(10, { mod: 2, value: 7, locked: true }).value, 7);
  assert.equal(RE.applyOverride(10, { value: 7, locked: false }).value, 10);
  const sys = { hp: { max: 20 }, dodgebase: 5 };
  const { active } = RE.collectRules([{ name: "C", type: "skill", level: 2, rules: [{ key: "hp.bonus", mode: "add", value: 3 }] }]);
  const rep = RE.applyActorTargets(sys, active, { hp_max: { mod: 1 }, evasion: { value: 9, locked: true } });
  assert.equal(sys.hp.max, 24);
  assert.equal(sys.dodgebase, 9);
  assert.ok(rep.evasion.overridden);
});

test("Fencer (Writer data): crit -1 attack-only, half STR round-up for all gear, legacy shape", () => {
  const fencer = load("classes/fencer.json");
  const { active, notes } = RE.collectRules([cls(fencer, 2)]);
  assert.equal(notes.length, 0);
  const L = RE.toLegacy(active);
  const crit = L.classes.find((c) => c.critMod);
  assert.deepEqual([crit.critMod, crit.attackOnly, crit.name], [-1, true, "Fencer"]);
  const str = L.classes.find((c) => c.minStrMult !== 1);
  assert.deepEqual([str.minStrMult, str.attackOnly], [0.5, false]);
  assert.equal(L.minStrMult, 0.5);
  assert.equal(L.critMod, 0, "attack-only crit not global");
});

test("Fighter (Writer data) adds nothing: sheet already adds class level", () => {
  const { active, notes } = RE.collectRules([cls(load("classes/fighter.json"), 5)]);
  assert.equal(active.length + notes.length, 0);
});

test("legacy ce.7 object rules adapt identically", () => {
  const legacy = { critMod: -1, minStrMult: 0.5, attackOnly: true, castPenalty: { metal: 4, nonmetal: 2, nonmetalMinStr: 10 } };
  const L = RE.toLegacy(RE.collectRules([{ name: "Fencer", type: "skill", level: 1, rules: legacy }]).active);
  assert.equal(L.classes.find((c) => c.critMod).critMod, -1);
  assert.ok(L.classes.every((c) => c.attackOnly));
  assert.deepEqual(L.castPenalty.Fencer, { metal: 4, nonmetal: 2, nonmetalMinStr: 10 });
  const zero = { critMod: 0, minStrMult: 1, attackOnly: true, castPenalty: { metal: 0, nonmetal: 0, nonmetalMinStr: 10 } };
  assert.deepEqual(RE.normalizeRules(zero), [], "Ellen default rules stay inert");
});

test("spell.armorPenalty maps onto castPenalty (Sorcerer)", () => {
  const L = RE.toLegacy(RE.collectRules([cls(load("classes/sorcerer.json"), 3)]).active);
  assert.deepEqual(L.castPenalty.Sorcerer, { metal: 4, nonmetal: 2, nonmetalMinStr: 10 });
});

test("check.penalty is predicate-gated by armour (Scout)", () => {
  const { active } = RE.collectRules([cls(load("classes/scout.json"), 1)]);
  const none = RE.checkMods(active, { armors: [] })[0];
  const metal = RE.checkMods(active, { armors: [{ category: "metalarmor" }] })[0];
  assert.equal(none.active, false);
  assert.equal(metal.active, true);
  assert.deepEqual(metal.checks, ["tumble", "hide", "acrobatics", "follow"]);
  assert.equal(metal.value, -4);
});

test("weapon extras: usesThisClass, melee, declared is situational, @choice category", () => {
  const ps = load("feats/power-strike-i.json");
  const wp = load("feats/weapon-proficiency-a.json");
  const src = [{ name: "Power Strike I", type: "combatability", level: 3, rules: ps.rules },
    { name: "Weapon Proficiency A", type: "combatability", level: 3, rules: wp.rules, choices: { choice: "sword" } },
    { name: "Fighter", type: "skill", level: 3, rules: [{ key: "attack.extraDamage", mode: "add", value: 1, predicate: ["attack.usesThisClass"] }] }];
  const { active, notes } = RE.collectRules(src);
  const sword = { checkskill: "Fighter", category: "sword" };
  const ex = RE.weaponExtras(active, sword, {});
  assert.equal(ex.extraDamage.value, 2); // prof +1, fighter +1; power strike situational
  assert.equal(ex.extraDamage.situational.length, 1);
  assert.equal(RE.weaponExtras(active, { checkskill: "Fencer", category: "axe" }).extraDamage.value, 0);
  assert.ok(notes.some((n) => n.key === "equip.rankAllowed"));
});

test("unknown keys and predicates are kept as notes, never errors", () => {
  const { active, notes } = RE.collectRules([{ name: "H", type: "skill", level: 1, rules: [{ key: "bard.power", mode: "add", value: 1 }, { key: "hp.max", mode: "add", value: 1, predicate: ["moon.full"] }] }]);
  assert.equal(notes[0].reason, "unknown key");
  const r = RE.rulesFor(active, "hp.max", {});
  assert.equal(r.rules.length, 0);
  assert.deepEqual(r.situational[0].notes, ["moon.full"]);
});

test("Priest surcharge resolves by god rank but is a note (not applied)", () => {
  const priest = load("classes/priest.json");
  const { notes } = RE.collectRules([{ ...cls(priest, 1), selectors: { godRank: "minor" } }]);
  assert.equal(notes[0].key, "spell.mpSurcharge.outOfInfluence");
  assert.equal(notes[0].value, 2);
});

test("every Writer class/feat rule key resolves", () => {
  const dir = new URL("../../gen/data/", import.meta.url);
  const unknown = [];
  for (const cat of ["classes", "feats"]) for (const f of fs.readdirSync(new URL(cat + "/", dir))) {
    if (!f.endsWith(".json")) continue;
    for (const r of load(`${cat}/${f}`).rules ?? []) if (RE.resolveKey(r.key).unknown) unknown.push(`${f}:${r.key}`);
  }
  assert.deepEqual(unknown, []);
});
