import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as R from "../module/rules/race.mjs";
import { ruleSourceLevel } from "../module/rules/engine.mjs";

const rd = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

function fakeActor(init = {}) {
  let n = 0;
  const items = [];
  const a = {
    name: "Test PC", type: "character",
    system: { race: "", abilities: Object.fromEntries(R.ABIL_KEYS.map((k) => [k, { dice: "", valuebase: "" }])), ...init },
    items: Object.assign(items, { get: (id) => items.find((i) => i.id === id) }),
    log: [],
    async update(u) { a.log.push(["update", u]); for (const [k, v] of Object.entries(u)) { const p = k.split("."); let o = a; for (const s of p.slice(0, -1)) o = o[s]; o[p.at(-1)] = v; } },
    async deleteEmbeddedDocuments(_t, ids) { a.log.push(["delete", ids]); for (const id of ids) { const i = items.findIndex((x) => x.id === id); if (i >= 0) items.splice(i, 1); } },
    async createEmbeddedDocuments(_t, list) { a.log.push(["create", list.map((x) => x.name)]); return list.map((d) => { const it = { ...d, id: `c${++n}` }; items.push(it); return it; }); },
  };
  return a;
}
const human = { id: "rH", type: "race", name: "Human", system: { dice: { dex: "2d", agi: "2d", str: "2d", vit: "2d", int: "2d", mnd: "2d" }, languages: "Trade Common + 1 regional dialect", restricted: "None",
  abilities: [{ uuid: "Item.cf", name: "Sword's Grace/Change Fate", level: 1 }], enhanced: [{ uuid: "Item.cf6", name: "Change Fate (enhanced)", level: 6 }, { uuid: "Item.cf11", name: "Change Fate (enhanced)", level: 11 }] } };
const elf = { id: "rE", type: "race", name: "Elf", system: { dice: { dex: "2d", agi: "2d", str: "1d", vit: "2d", int: "2d", mnd: "2d" }, languages: "Elvish, Trade Common", restricted: "None",
  abilities: [{ uuid: "Item.dv", name: "Darkvision", level: 1 }, { uuid: "", name: "Gentle Water (no link)", level: 1 }], enhanced: [] } };
const db = { "Item.cf": { name: "Sword's Grace/Change Fate", type: "raceability", system: { description: "flip dice" } }, "Item.cf6": { name: "Change Fate (enhanced)", type: "raceability", system: {} },
  "Item.cf11": { name: "Change Fate (enhanced)", type: "raceability", system: {} }, "Item.dv": { name: "Darkvision", type: "raceability", system: {} } };
const resolve = async (u) => (db[u] ? { toObject: () => JSON.parse(JSON.stringify(db[u])) } : null);

test("F1: dice formulas: '2d' -> 2d6, '1d' -> 1d6, blanks stay blank", () => {
  assert.equal(R.diceFormula("2d"), "2d6");
  assert.equal(R.diceFormula("1D"), "1d6");
  assert.equal(R.diceFormula("2d6"), "2d6");
  assert.equal(R.diceFormula("2d+6"), "2d6+6");
  assert.equal(R.diceFormula(""), "");
});

test("F1: dropping a race sets name + dice formulas only (scores untouched, nothing rolled) and adds linked cards", async () => {
  const a = fakeActor();
  a.system.abilities.dex.valuebase = 9;
  a.items.push({ ...human });
  const n = await R.applyRace(a, human, { resolve });
  assert.equal(n, 3);
  assert.equal(a.system.race, "Human");
  assert.equal(a.system.abilities.str.dice, "2d");
  assert.equal(a.system.abilities.dex.valuebase, 9, "existing score kept");
  assert.ok(!a.log.some(([k, u]) => k === "update" && Object.keys(u).some((x) => x.endsWith("valuebase"))), "no score written on drop");
  const cards = a.items.filter((i) => R.raceOf(i) === "rH");
  assert.deepEqual(cards.map((c) => R.raceLevelOf(c)), [1, 6, 11]);
  assert.equal(cards[0].system.race, "Human");
  assert.equal(cards[0].flags["sw25-ce"].raceLink, "Item.cf");
});

test("F1: enhanced cards are inactive (no rule bonus, greyed) until that adventurer level", () => {
  const card = { type: "raceability", flags: { "sw25-ce": { fromRace: "rH", raceLevel: 6 } }, system: { rules: [] } };
  assert.equal(R.raceCardActive(card, 1), false);
  assert.equal(R.raceCardActive(card, ""), false);
  assert.equal(R.raceCardActive(card, 6), true);
  assert.equal(ruleSourceLevel(card, { adv: 5 }), null);
  assert.equal(ruleSourceLevel(card, { adv: 6 }), 6);
  const base = { type: "raceability", flags: { "sw25-ce": { fromRace: "rH", raceLevel: 1 } }, system: { rules: [] } };
  assert.equal(ruleSourceLevel(base, { adv: 0 }), 1);
});

test("F1: dropping another race replaces the old race and every card it added; unlinked entries become description cards", async () => {
  const a = fakeActor();
  a.items.push({ ...human }); await R.applyRace(a, human, { resolve });
  a.items.push({ id: "own", name: "My own ability", type: "raceability", system: {} });
  a.items.push({ ...elf }); await R.applyRace(a, elf, { resolve });
  assert.equal(a.system.race, "Elf");
  assert.equal(a.system.abilities.str.dice, "1d");
  assert.ok(!a.items.some((i) => i.id === "rH" || R.raceOf(i) === "rH"), "human + its cards gone");
  assert.ok(a.items.some((i) => i.id === "own"), "hand-added ability kept");
  assert.deepEqual(a.items.filter((i) => R.raceOf(i) === "rE").map((i) => i.name), ["Darkvision", "Gentle Water (no link)"]);
});

test("F1: removing the race removes its cards and clears name/dice", async () => {
  const a = fakeActor();
  a.items.push({ ...elf }); await R.applyRace(a, elf, { resolve });
  a.system.abilities.dex.valuebase = 8;
  a.items.splice(a.items.findIndex((i) => i.id === "rE"), 1);
  await R.removeRace(a, elf);
  assert.equal(a.items.length, 0);
  assert.equal(a.system.race, "");
  assert.equal(a.system.abilities.str.dice, "");
  assert.equal(a.system.abilities.dex.valuebase, 8, "rolled score is the player's; kept");
});

test("F1: players roll each score: result posts to chat and fills that score; Roll all only rolls scores with dice", async () => {
  const posted = [];
  class FakeRoll { constructor(f) { this.formula = f; } async evaluate() { this.total = this.formula === "1d6" ? 3 : 7; return this; } async toMessage(m) { posted.push([this.formula, m.flavor]); } }
  const a = fakeActor();
  for (const k of R.ABIL_KEYS) a.system.abilities[k].dice = "2d";
  a.system.abilities.str.dice = "1d"; a.system.abilities.mnd.dice = "";
  assert.equal(await R.rollAbilityScore(a, "str", { RollCls: FakeRoll, Chat: null }), 3);
  assert.equal(a.system.abilities.str.valuebase, 3);
  assert.match(posted[0][1], /creation roll C \(1d\)/);
  const all = await R.rollAllScores(a, { RollCls: FakeRoll, Chat: null });
  assert.deepEqual(Object.keys(all), ["dex", "agi", "str", "vit", "int"]);
  assert.equal(a.system.abilities.mnd.valuebase, "", "no dice -> untouched (manual entry)");
  assert.equal(await R.rollAbilityScore(a, "mnd", { RollCls: FakeRoll, Chat: null }), null);
});

test("F1: race links: drop to link (no duplicates), enhanced default Lv6 then Lv11", () => {
  let l = R.addRaceLink([], { uuid: "A", name: "a" }, "abilities");
  l = R.addRaceLink(l, { uuid: "A", name: "a" }, "abilities");
  assert.deepEqual(l, [{ uuid: "A", name: "a", level: 1 }]);
  let e = R.addRaceLink([], { uuid: "B", name: "b" }, "enhanced");
  e = R.addRaceLink(e, { uuid: "C", name: "c" }, "enhanced");
  assert.deepEqual(e.map((x) => x.level), [6, 11]);
  const v = R.raceSheetData(elf.system);
  assert.deepEqual(v.raceDice.map((d) => `${d.letter}${d.value}`), ["A2d", "B2d", "C1d", "D2d", "E2d", "F2d"]);
});

test("F1: race item type, template, sheet, per-score roll buttons and hooks are wired", () => {
  const t = JSON.parse(rd("template.json"));
  assert.ok(t.Item.types.includes("race"));
  assert.deepEqual(Object.keys(t.Item.race.dice), R.ABIL_KEYS);
  const ch = rd("templates/actor/actor-character-sheet.hbs");
  assert.equal((ch.match(/class="sw-abroll" data-ab=/g) ?? []).length, 6);
  assert.match(ch, /sw-abroll-all/);
  assert.ok(fs.existsSync(new URL("../templates/item/item-race-sheet.hbs", import.meta.url)));
  assert.match(rd("module/sw25.mjs"), /registerRaceHooks\(\)/);
  assert.match(rd("module/sheets/actor-sheet.mjs"), /RACE\.rollAbilityScore/);
  assert.match(rd("templates/actor/parts/actor-ce7-feats.hbs"), /sw-inactive/);
  for (const f of ["en", "ja", "ko"]) assert.ok(JSON.parse(rd(`lang/${f}.json`)).TYPES.Item.race);
  // never auto-rolled: the drop path has no Roll
  const src = rd("module/rules/race.mjs");
  const apply = src.slice(src.indexOf("export async function applyRace"), src.indexOf("export async function removeRace"));
  assert.doesNotMatch(apply, /Roll|valuebase/);
});
