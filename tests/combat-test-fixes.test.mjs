import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultCheckFor, checkClassList, bestClass, defaultWeaponClass, EVASION_CLASSES } from "../module/rules/class-pick.mjs";
import { SCHOOL_TO_TYPE, spellTypeOf } from "../module/rules/spell-school.mjs";
import { testActorDoc } from "../tools/build-compendia.mjs";

const cls = (slug, name, lvl) => ({ type: "skill", name, flags: { "sw25-ce": { slug } }, system: { skilllevel: lvl } });
const warrior = [cls("fighter", "Fighter", 2), cls("scout", "Scout", 1), cls("ranger", "Ranger", 1)];

test("Initiative / Monster Knowledge checks default to Scout|Tactician+Agi and Sage+Int", () => {
  assert.deepEqual(defaultCheckFor("Initiative", { init: "Initiative", mknow: "Monster Knowledge" }), { checkskill: "scout|tactician", checkabi: "agi" });
  assert.deepEqual(defaultCheckFor("Monster Knowledge", { init: "Initiative", mknow: "Monster Knowledge" }), { checkskill: "sage", checkabi: "int" });
  assert.equal(defaultCheckFor("Other", { init: "Initiative", mknow: "Monster Knowledge" }), null);
  assert.deepEqual(checkClassList("scout|tactician"), ["scout", "tactician"]);
  assert.equal(checkClassList("adv"), null);
  assert.equal(checkClassList("Fighter"), null);
});

test("Evasion / weapon class defaults pick the best fighter class", () => {
  assert.equal(bestClass(warrior, EVASION_CLASSES).name, "Fighter");
  assert.equal(bestClass([cls("sorcerer", "Sorcerer", 2)], EVASION_CLASSES), null, "Tabbit: no evasion class -> Evasion 0 is correct");
  assert.equal(defaultWeaponClass(warrior, { system: { type: "sword" } }).name, "Fighter");
  assert.equal(defaultWeaponClass([...warrior, cls("marksman", "Marksman", 1)], { system: { type: "bow" } }).name, "Marksman");
});

test("Spell school maps to the sheet's Magic-tab bucket", () => {
  assert.equal(SCHOOL_TO_TYPE.truespeech, "sorcerer");
  assert.equal(spellTypeOf({ system: { type: "" }, flags: { "sw25-ce": { data: { school: "truespeech" } } } }), "sorcerer");
  assert.equal(spellTypeOf({ system: { type: "priest" } }), "priest");
});

test("Test monster: Lore 'Neutral' stays, but hostile:true makes the token Hostile", () => {
  const ctx = { lookup: () => undefined, gaps: [] };
  const base = { slug: "k", name: "K", type: "monster", disposition: "Neutral", parts: [{ name: "Weapon", hp: 13, mp: 10 }] };
  assert.equal(testActorDoc("monsters", base, ctx).prototypeToken.disposition, 0);
  const h = testActorDoc("monsters", { ...base, hostile: true }, ctx);
  assert.equal(h.prototypeToken.disposition, -1);
  assert.equal(h.system.sb.disposition, "Neutral");
  assert.equal(h.system.sb.parts[0].mp, 10, "book MP kept");
});

test("Test PC: spellcasting classes get their school's spells up to class level", () => {
  const spells = [{ slug: "energy-bolt", name: "Energy Bolt", school: "truespeech", level: 1, mpCost: 5 }, { slug: "x", name: "X", school: "truespeech", level: 5, mpCost: 5 }];
  const lib = { classes: new Map([["sorcerer", { slug: "sorcerer", name: "Sorcerer", tier: "wizard", classSkills: [{ check: "spellcasting", limit: ["truespeech"] }] }]]) };
  const ctx = { lookup: (c, s) => lib[c]?.get(s), list: (c) => (c === "spells" ? spells : []), gaps: [] };
  const pc = testActorDoc("pcs", { slug: "t", name: "T", classes: [{ slug: "sorcerer", level: 2 }] }, ctx);
  const sp = pc.items.filter((i) => i.type === "spell");
  assert.deepEqual(sp.map((i) => [i.name, i.system.type]), [["Energy Bolt", "sorcerer"]]);
});
