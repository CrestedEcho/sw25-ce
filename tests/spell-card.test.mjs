import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../module/rules/spell-card.mjs";
import { payPlan } from "../module/rules/spell-pay.mjs";

const spell = (sys = {}, name = "Energy Bolt") => ({ id: "s1", name, img: "i.png", system: { mpcost: 5, target: "1 character", rangeshape: "30m/Target", time: "Instant", resistname: "Half", description: "<p>Bolt.</p>", ...sys } });

test("statusOf: data-driven, empty id = no status", () => {
  assert.equal(C.statusOf({}), null);
  assert.equal(C.statusOf({ status: { id: "" } }), null);
  assert.deepEqual(C.statusOf({ status: { id: "poison", rounds: 3 } }), { id: "poison", label: "Poison", rounds: 3, review: false, note: "" });
});

test("spellInfo: range field wins over rangeshape; plain duration", () => {
  assert.equal(C.spellInfo(spell()).range, "30m/Target");
  assert.equal(C.spellInfo(spell({ range: "Touch" })).range, "Touch");
  assert.equal(C.spellInfo(spell()).duration, "Instant");
});

test("rowData: list row fields", () => {
  const r = C.rowData(spell({ status: { id: "curse" } }));
  assert.equal(r.mp, "5 MP"); assert.equal(r.target, "1 character"); assert.equal(r.hasStatus, true);
});

test("descCardHTML: description only, no buttons or MP", () => {
  const h = C.descCardHTML(C.spellInfo(spell()));
  assert.match(h, /Bolt\./); assert.doesNotMatch(h, /data-sw25-magic-dmg|sw25-sc-mp/);
});

test("castCardHTML: damage spell has apply buttons, live targets, MP line", () => {
  const pay = payPlan({ cost: 6, mp: 24, mpMax: 30, stones: [{ id: "a", name: "Mako Stone", value: 5 }] });
  const dmg = { rate: 10, rolls: [8], crits: 0, table: 5, magicPower: 4, total: 9, half: 5, fumble: false };
  const { html, whisperDefault } = C.castCardHTML(C.spellInfo(spell()), { cast: { formula: "2d6+5", total: 13 }, damage: dmg, pay });
  assert.equal(whisperDefault, false);
  assert.match(html, /data-sw25-magic-dmg="9"/); assert.match(html, /data-sw25-magic-dmg="5"/);
  assert.match(html, /sw25-live-targets/); assert.match(html, /MP paid: 6/); assert.doesNotMatch(html, /sw25-sc-short/);
});

test("castCardHTML: healing spell gets Apply Healing", () => {
  const dmg = { rate: 10, rolls: [8], crits: 0, table: 5, magicPower: 4, total: 9, half: 5 };
  const { html } = C.castCardHTML(C.spellInfo(spell({ resistname: "" }, "Cure Wounds")), { damage: dmg });
  assert.match(html, /data-sw25-heal="9"/); assert.doesNotMatch(html, /data-sw25-magic-dmg/);
});

test("castCardHTML: no damage -> GM whisper default; status button when data set; short flag", () => {
  const pay = payPlan({ cost: 10, mp: 2, mpMax: 20 });
  const { html, whisperDefault } = C.castCardHTML(C.spellInfo(spell({ status: { id: "fear", label: "Fear", rounds: 2 } })), { cast: { formula: "2d6", total: 7 }, pay });
  assert.equal(whisperDefault, true);
  assert.match(html, /data-sw25-status="fear"/); assert.match(html, /data-rounds="2"/);
  assert.match(html, /sw25-sc-short/);
});

test("castCardHTML: Spend MP unticked says No MP spent", () => {
  const { html } = C.castCardHTML(C.spellInfo(spell()), { pay: payPlan({ cost: 5, mp: 9, mpMax: 9, spendMP: false }) });
  assert.match(html, /No MP spent/);
});

test("castCardHTML: escapes names", () => {
  const { html } = C.castCardHTML(C.spellInfo(spell({}, "<b>x</b>")), {});
  assert.doesNotMatch(html, /<b>x<\/b>/);
});

test("castWindowHTML: Spend MP ticked by default, disabled with no MP; stones listed", () => {
  const info = C.spellInfo(spell());
  const st = [{ id: "a", name: "Mako 5", value: 5, max: 5, qty: 1, daily: false }];
  const h = C.castWindowHTML({ info, base: 5, mp: 10, mpMax: 20, stones: st });
  assert.match(h, /name="spendMP" checked/); assert.match(h, /value="a"/); assert.match(h, /Cast Energy Bolt/);
  const g = C.castWindowHTML({ info, base: 5, mp: 0, mpMax: 0, stones: st });
  assert.match(g, /name="spendMP" disabled/); assert.match(g, /value="a" checked/);
});
