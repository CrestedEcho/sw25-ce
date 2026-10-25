import test from "node:test"; import assert from "node:assert/strict";
import { prepareFellow, rowIndexForDie, resolveFellowRoll, fellowChatHTML, buildFellowContext, languageText } from "../module/rules/fellow.mjs";

const rin = { enabled: true, race: "Human", gender: "Female", age: 19, level: 3, classes: "Fencer 3, Scout 2, Sage 1",
  languages: [{ name: "Trade Common", speak: true, read: true }, { name: "Harvesgard Dialect", speak: true, read: false }],
  mp: { value: 9, max: 12 },
  rows: [{ action: "Scout Observation Check", kind: "check", dialogue: "Hm?", value: 11, effect: "Spots traps", mp: 0 },
    { action: "Rapier thrust", value: 10, effect: "Power 10 / Crit 10 + 4" },
    { action: "Power Strike", value: 11, effect: "Power 25" }, { action: "Field Aid", value: 9, effect: "Heal", mp: 3 }],
  consumables: ["Healing Potion"] };

test("die -> row ranges 1-2 / 3-4 / 5 / 6", () => assert.deepEqual([1, 2, 3, 4, 5, 6].map(rowIndexForDie), [0, 0, 1, 1, 2, 3]));

test("prepareFellow: 4 fixed rows with results 7-10, no HP field, string lists upgraded", () => {
  const f = prepareFellow({ rows: [{ action: "A" }] });
  assert.equal(f.rows.length, 4); assert.deepEqual(f.rows.map((r) => r.result), [7, 8, 9, 10]);
  assert.equal(f.rows[0].action, "A"); assert.equal("hp" in f, false);
  const g = prepareFellow(rin); assert.deepEqual(g.consumables[0], { name: "Healing Potion", qty: 1, from: "" });
  assert.equal(languageText(g.languages[0]), "Trade Common (Speak/Read)"); assert.equal(languageText(g.languages[1]), "Harvesgard Dialect (Speak)");
});

test("roll: any row succeeds when nothing wanted; MP spent on success", () => {
  const r = resolveFellowRoll(rin, 6); assert.equal(r.success, true); assert.equal(r.mpCost, 3); assert.equal(r.mpAfter, 6);
});

test("roll: mismatch with wanted row = failure, no MP spent", () => {
  const r = resolveFellowRoll(rin, 6, 1); assert.equal(r.failure, true); assert.equal(r.success, false); assert.equal(r.mpCost, 0);
  assert.equal(resolveFellowRoll(rin, 4, 1).success, true);
});

test("roll: not enough MP cancels", () => {
  const r = resolveFellowRoll({ ...rin, mp: { value: 2, max: 12 } }, 6); assert.equal(r.cancelled, true); assert.equal(r.mpAfter, 2);
});

test("chat HTML carries dialogue, value, effect, MP, failure note; escapes", () => {
  const f = prepareFellow(rin);
  const ok = fellowChatHTML("Rin", resolveFellowRoll(rin, 1));
  assert.match(ok, /Scout Observation Check/); assert.match(ok, /“Hm\?”/); assert.match(ok, /Value <b>11<\/b>/); assert.match(ok, /\(check\)/);
  const bad = fellowChatHTML("<Rin>", resolveFellowRoll(rin, 6, 0), f.rows[0]);
  assert.match(bad, /Failure/); assert.match(bad, /&lt;Rin&gt;/);
});

test("card context: subline, MP bar %, highlighted + wanted rows", () => {
  const c = buildFellowContext({ name: "Rin", fellow: rin, lastRoll: resolveFellowRoll(rin, 3), wanted: 1 });
  assert.equal(c.subLine, "Human · Female · 19 · Adventurer Lv 3");
  assert.equal(c.mpPct, 75); assert.equal(c.rows[1].hit, true); assert.equal(c.rows[1].wanted, true); assert.equal(c.rows[3].mpText, 3); assert.equal(c.rows[1].mpText, "—");
});
