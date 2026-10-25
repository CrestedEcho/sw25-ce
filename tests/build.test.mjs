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
  for (const k of ["attack.extraAttack", "counter.track"]) assert.ok(!r.documentedNotApplied[k], k);
  assert.ok(!r.documentedNotApplied["attack.noStray"], "noStray is applied now");
  const f = toDoc("spells", load("spells/fist-of-god.json")); assert.equal(f.system.mpcost, 8); assert.ok(f.system.mpRule.byDeityRank); assert.ok(!f.flags["sw25-ce"].warnings);
});
test("non-combat feat flag", () => {
  assert.equal(toDoc("feats", load("feats/dodge.json")).system.nonCombat, false);
  assert.equal(toDoc("feats", { slug: "toughness", name: "Toughness" }).system.nonCombat, true);
  assert.equal(toDoc("feats", { slug: "x", name: "X", nonCombat: true }).system.nonCombat, true);
});
import { folderPathFor, buildFolders } from "../tools/build-compendia.mjs";
test("compendium folder paths", () => {
  const names = (c, d) => folderPathFor(c, d).map((x) => x[0]);
  assert.deepEqual(names("spells", { slug: "x", school: "truespeech", level: 10 }), ["Truespeech Magic", "Level 10"]);
  assert.deepEqual(names("spells", { slug: "divine-lyphos/peace", school: "divine", level: 2 }), ["Divine Magic", "Special: Lyphos"]);
  assert.deepEqual(names("spells", { slug: "banish", school: "divine", level: 4 }), ["Divine Magic", "Common", "Level 4"]);
  assert.deepEqual(names("spells", { slug: "f", school: "fairy", element: "water-ice", level: 1 }), ["Fairy Magic", "Water/Ice"]);
  assert.deepEqual(names("items", { slug: "b", type: "accessory", slot: "boots", rank: "A" }), ["Gear", "Feet (Boots)", "Any Class", "Rank A"]);
  assert.deepEqual(names("items", { slug: "b", type: "accessory", slot: "head", classRestriction: ["fencer"] }), ["Gear", "Head", "Fencer", "Unranked"]);
  assert.deepEqual(names("items", { slug: "s", type: "weapon", category: "sword", rank: "B" }), ["Weapons", "Sword", "Rank B"]);
  assert.deepEqual(names("gods", { slug: "g", rank: "ancient" }), ["Ancient Gods"]);
  assert.deepEqual(names("feats", { slug: "x", nonCombat: true }), ["Non-combat Feats"]);
});
test("buildFolders: every entry foldered, Level 2 sorts before Level 10", () => {
  const entries = [10, 2, 1].map((l) => ({ doc: { name: `S${l}` }, d: { slug: `s${l}`, school: "nature", level: l } }));
  const f = buildFolders("spells", entries);
  assert.ok(entries.every((e) => f.some((x) => x._id === e.doc.folder)));
  const lv = f.filter((x) => x.name.startsWith("Level")).sort((a, b) => a.sort - b.sort).map((x) => x.name);
  assert.deepEqual(lv, ["Level 1", "Level 2", "Level 10"]);
  assert.ok(f.every((x) => x.type === "Item" && x._key === `!folders!${x._id}`));
  assert.equal(f.find((x) => x.name === "Nature Magic").folder, null);
});
import { testActorDoc, artPath } from "../tools/build-compendia.mjs";
import { parseMagicSkill } from "../module/rules/sb-cast.mjs";
test("test actors: PC embeds, fellow, multi-part mainPart first, castable magic, art paths", () => {
  const lib = { classes: { fighter: { slug: "fighter", name: "Fighter", category: "major", tier: "warrior" } }, feats: {} };
  const ctx = { lookup: (c, s) => lib[c]?.[s], gaps: [] };
  const pc = testActorDoc("pcs", { slug: "pc", name: "PC", classes: [{ slug: "fighter", level: 2 }], feats: ["nope"], money: 40, abilities: { base: { tech: 7 }, dexterity: 18, correction: { dexterity: 11 } },
    gear: { weapons: [{ name: "Sword", category: "sword" }], accessories: [{ name: "Belt", slot: "waist" }], items: ["Lifegrass x2"] } }, ctx);
  assert.equal(pc.type, "character"); assert.equal(pc.system.money, 40); assert.equal(pc.system.abilities.dex.valuebase, 11);
  assert.equal(pc.items.find((i) => i.type === "skill").system.skilllevel, 2);
  assert.equal(pc.items.find((i) => i.name === "Lifegrass").system.quantity, 2);
  assert.ok(ctx.gaps.some((g) => g.includes('"nope"')));
  assert.equal(pc.img, artPath("pcs", "pc", "portrait")); assert.equal(pc.prototypeToken.texture.src, "assets/sw25-content/actors/pcs/pc-token.webp");
  const f = testActorDoc("npcs", { slug: "fellow", name: "W", fellow: true, hostile: false, mp: 10, actionTable: [{ action: "Attack" }] }, ctx);
  assert.equal(f.system.fellow.enabled, true); assert.equal(f.prototypeToken.disposition, 1);
  const n = testActorDoc("npcs", { slug: "n", name: "N", type: "npc", hostile: false, disposition: "Hostile", parts: [{ name: "x", hp: 5 }] }, ctx);
  assert.equal(n.prototypeToken.disposition, 0);
  const m = testActorDoc("monsters", { slug: "m", name: "M", type: "monster", parts: [{ name: "Wing" }, { name: "Head", mainPart: true }],
    uniqueSkills: [{ name: "Truespeech Magic 3", icon: "major", text: "t" }], magic: [{ school: "truespeech", level: 3, power: { value: 4, fixed: 11 } }] }, ctx);
  assert.deepEqual(m.system.sb.parts.map((p) => [p.name, p.isCore]), [["Head", true], ["Wing", false]]);
  assert.equal(m.prototypeToken.disposition, -1);
  assert.deepEqual(parseMagicSkill(m.system.sb.uniqueSkills[0]), { schools: ["truespeech"], level: 3, magicPower: 4 });
  assert.equal(m.system.sb.uniqueSkills[0].description, "t");
});
