import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as RE from "../module/rules/engine.mjs";
import * as CS from "../module/rules/combat-state.mjs";

const load = (p) => JSON.parse(fs.readFileSync(new URL(`../../gen/data/${p}`, import.meta.url)));
const feat = (j) => ({ id: j.slug, name: j.name, type: "combatability", level: 1, rules: j.rules, choices: {} });
const sword = { category: "sword", checkskill: "Fighter" };

test("declarations: toggle, one attack, lingering risk, turn start", () => {
  let s = CS.toggleDeclare(null, ["power-strike"], true);
  assert.deepEqual(s, { active: ["power-strike"], lingering: ["power-strike"] });
  assert.ok(CS.isDeclared(s, "power-strike"));
  assert.deepEqual(CS.toggleDeclare(s, "power-strike", false), { active: [], lingering: [] }, "cancel before attacking undoes risk");
  s = CS.consumeAttack(s);
  assert.deepEqual(s, { active: [], lingering: ["power-strike"] });
  assert.deepEqual(CS.toggleDeclare(s, "power-strike", false).lingering, ["power-strike"], "risk stays once used");
  assert.deepEqual(CS.turnStart(), { active: [], lingering: [] });
  assert.deepEqual(CS.declaredSlugs(load("feats/power-strike-i.json").rules), ["power-strike"]);
});

test("Power Strike: +4 only while declared; Evasion -2 until next turn", () => {
  const { active } = RE.collectRules([feat(load("feats/power-strike-i.json"))]);
  const dmg = (ctx) => RE.weaponExtras(active, sword, ctx).extraDamage.value;
  const ev = (ctx) => RE.rulesFor(active.filter((r) => r.kind === "actor"), "evasion", ctx).rules.length;
  assert.equal(dmg({}), 0); assert.equal(ev({}), 0);
  let st = CS.toggleDeclare(null, "power-strike", true);
  assert.equal(dmg({ declared: st.active, lingering: st.lingering }), 4);
  assert.equal(ev({ declared: st.active, lingering: st.lingering }), 1);
  st = CS.consumeAttack(st);
  assert.equal(dmg({ declared: st.active, lingering: st.lingering }), 0, "damage bonus is one attack only");
  assert.equal(ev({ declared: st.active, lingering: st.lingering }), 1, "risk lingers");
  assert.equal(RE.weaponExtras(active, { category: "bow" }, { declared: ["power-strike"] }).extraDamage.value, 0, "melee only");
});

test("attack.noStray is a passive flag; equip.rankAllowed checks rank by category", () => {
  const tg = RE.collectRules([feat(load("feats/targeting.json"))]);
  assert.equal(tg.notes.length, 0);
  assert.equal(RE.ruleFlags(tg.active).noStray, true);
  const wpa = load("feats/weapon-proficiency-a.json");
  const choiceKey = wpa.choose ?? "weaponCategory";
  const { active } = RE.collectRules([{ ...feat(wpa), choices: { [choiceKey]: "sword" } }]);
  assert.equal(RE.rankCheck(active, { type: "weapon", category: "sword", rank: "A" }).ok, true);
  assert.equal(RE.rankCheck(active, { type: "weapon", category: "axe", rank: "A" }).ok, false, "other category");
  assert.equal(RE.rankCheck(active, { type: "weapon", category: "sword", rank: "S" }).ok, false, "S needs Proficiency S");
  assert.equal(RE.rankCheck([], { type: "weapon", category: "axe", rank: "B" }).ok, true, "B is free");
  assert.equal(RE.rankCheck([], { type: "armor", category: "metalarmor", rank: "A" }).ok, false);
  const apa = load("feats/armor-proficiency-a.json");
  const a = RE.collectRules([{ ...feat(apa), choices: { [apa.choose]: "Metal Armor" } }]).active;
  assert.equal(RE.rankCheck(a, { type: "armor", category: "metalarmor", rank: "A" }).ok, true, "category names normalised");
  assert.equal(RE.rankCheck(a, { type: "weapon", category: "metalarmor", rank: "A" }).ok, false, "armor feat does not cover weapons");
});

test("Dodge: counter.track defs, manual +/- badge state, @counter value, resets", () => {
  const dg = load("feats/dodge.json");
  const src = (counters) => RE.collectRules([feat(dg)], { data: { counters } });
  const { active, notes } = src({ "dodge.evasions": 2 });
  assert.equal(notes.length, 0, "nothing left unapplied");
  const defs = RE.counterDefs(active);
  assert.deepEqual(defs.map((d) => [d.name, d.reset, d.on, d.firstMelee]), [["dodge.evasions", "round", "evasionSuccess", true]]);
  assert.equal(RE.toLegacy(active).critMod, -2, "crit threshold -1 per counted evasion");
  assert.equal(RE.toLegacy(src({}).active).critMod, 0);
  let c = CS.bumpCounter({}, "dodge.evasions", 1);
  c = CS.bumpCounter(c, "dodge.evasions", 1);
  assert.equal(c["dodge.evasions"], 2);
  assert.equal(CS.bumpCounter({}, "dodge.evasions", -1)["dodge.evasions"], 0, "never below 0");
  assert.equal(CS.resetCounters(c, defs, { reset: "round" })["dodge.evasions"], 0);
  assert.equal(CS.resetCounters(c, defs, { names: ["dodge.evasions"] })["dodge.evasions"], 0);
  assert.equal(CS.resetCounters(c, defs, { reset: "turn" })["dodge.evasions"], 2);
  assert.equal(RE.evalValue("-@counter:dodge.evasions", { counters: { "dodge.evasions": 3 } }), -3);
});

test("Chain Attack: extra attack button only for 1H melee wrestling", () => {
  const { active, notes } = RE.collectRules([feat(load("feats/chain-attack.json"))]);
  assert.equal(notes.length, 0);
  const x = RE.extraAttacks(active, { category: "Wrestling", usage: "1H", ranged: false });
  assert.equal(x.length, 1);
  assert.deepEqual([x[0].count, x[0].maxPerTurn, x[0].sameTarget, x[0].noAccuracyPenalty], [1, 1, true, true]);
  assert.equal(RE.extraAttacks(active, { category: "Wrestling", usage: "2H" }).length, 0, "2H stance");
  assert.equal(RE.extraAttacks(active, { category: "Sword", usage: "1H" }).length, 0, "other category");
  assert.equal(RE.extraAttacks(active, { category: "Wrestling", usage: "1H#", ranged: true }).length, 0, "ranged");
});

test("Cover I: defense.coverAlly is a declared, text-only rule", () => {
  const { active, notes } = RE.collectRules([feat(load("feats/cover-i.json"))], { ctx: { declared: [], lingering: ["cover-i"] } });
  assert.equal(notes.length, 0);
  const r = active.find((x) => x.target === "coverAlly");
  assert.equal(r.kind, "defense");
  assert.deepEqual(CS.declaredSlugs([r]), ["cover-i"]);
});
