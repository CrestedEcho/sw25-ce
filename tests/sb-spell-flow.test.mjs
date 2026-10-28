import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { usesSbPool, sbMagicPower, sbPoolInfo, sbSpellItem, powerRowFor, spellHasPower, sbCastExtraHTML } from "../module/rules/sb-spell.mjs";
import { castWindowHTML, spellInfo } from "../module/rules/spell-card.mjs";
import { payPlan, mpLine, shortLine } from "../module/rules/spell-pay.mjs";
import { applySbCost } from "../module/rules/sb-cast.mjs";
import { powerLookup } from "../module/rules/power-lookup.mjs";
import { rollSpellDamage } from "../module/rules/spell-power.mjs";
import { POWER_TABLE } from "../module/data/power-table.mjs";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

test("stat block pool only when the NPC/monster has parts", () => {
  assert.equal(usesSbPool({ type: "monster", system: { sbView: { parts: [{}] } } }), true);
  assert.equal(usesSbPool({ type: "monster", system: { sbView: { parts: [] } } }), false);
  assert.equal(usesSbPool({ type: "character", system: { sbView: { parts: [{}] } } }), false);
});
test("Magic Power = fixed − 7 (check pair, number, magic.power)", () => {
  assert.deepEqual(sbMagicPower({ check: { value: 8, fixed: 15 } }), { fixed: 15, value: 8 });
  assert.deepEqual(sbMagicPower({ check: { fixed: 12 } }), { fixed: 12, value: 5 });
  assert.deepEqual(sbMagicPower({ magic: { school: "truespeech", level: 5, power: 6 } }), { fixed: 13, value: 6 });
  assert.equal(sbMagicPower({ name: "Truespeech Magic 5" }), null);
});
test("pool: core part by default, picker choices, current MP from raw", () => {
  const view = [{ name: "Head", mp: 20, isCore: true }, { name: "Body", mp: 10 }];
  const p = sbPoolInfo([{ mpValue: 12 }, {}], view);
  assert.equal(p.index, 0); assert.equal(p.mp, 12); assert.equal(p.mpMax, 20); assert.equal(p.choices[1].mp, 10);
  assert.equal(sbPoolInfo([{}, {}], view, 1).name, "Body");
  assert.match(sbCastExtraHTML({ pool: p }), /name="part"[\s\S]*Head ★/);
  assert.equal(sbCastExtraHTML({ pool: sbPoolInfo([{}], [{ name: "Body", mp: 5 }]) }), "");
});
test("spell item gets the caster's Magic Power for check and power", () => {
  const it = sbSpellItem({ _id: "x", name: "Energy Bolt", system: { power: { rate: 10 }, checkbase: 0 } }, { fixed: 13, value: 6 });
  assert.equal(it.system.checkbase, 6); assert.equal(it.system.powerbase, 6); assert.equal(it.type, "spell");
  assert.equal(spellInfo(it).name, "Energy Bolt");
});
test("power row from the lookup when the spell lists only a rate", () => {
  const row = powerRowFor({ rate: 10 }, (r, t) => powerLookup(r, t));
  assert.deepEqual(row, POWER_TABLE[10]);
  assert.equal(powerRowFor({ rate: 10, table: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }, () => null), null);
  assert.equal(spellHasPower({ power: { rate: 20 } }), true); assert.equal(spellHasPower({ power: null }), false);
});
test("damage roll uses the fallback row + Magic Power", async () => {
  const rolls = [7]; const d = await rollSpellDamage({ power: { rate: 10 }, crit: 10, magicPower: 6, fallbackRow: POWER_TABLE[10] }, async () => rolls.shift());
  assert.equal(d.total, Number(POWER_TABLE[10][4]) + 6);
});
test("cast window for stat blocks: Spend MP ticked even at 0 max, pool label, extra rows", () => {
  const h = castWindowHTML({ info: { name: "Sleep", target: "1", range: "10m" }, base: 5, mp: 0, mpMax: 0, poolLabel: "Head MP", spendLabel: "Spend MP (stat block)", allowNoMP: true, extraHTML: "<x-part>" });
  assert.match(h, /name="spendMP"\s+checked/); assert.match(h, /Head MP/); assert.match(h, /<x-part>/); assert.doesNotMatch(h, /Mako Stones/);
});
test("short MP: allowed with warning, stat block goes to 0", () => {
  const p = payPlan({ cost: 10, mp: 4, mpMax: null, spendMP: true, stones: [] });
  assert.equal(p.fromMP, 4); assert.equal(p.short, true); assert.match(shortLine(p), /needed 10/); assert.match(mpLine(p), /MP paid: 4/);
  const out = applySbCost([{ mpValue: 4 }], [{ mp: 20, isCore: true }], { mp: p.fromMP });
  assert.equal(out.parts[0].mpValue, 0);
});
test("wiring: stat block Cast and old monster sheet go through castSpellFlow", () => {
  const sb = read("../module/sheets/statblock-sheet.mjs"); const fl = read("../module/rules/spell-flow.mjs");
  assert.match(sb, /castSpellFlow\(actor, doc, \{ sb: \{ skill: skills\[index\], spellDoc: doc \} \}\)/);
  assert.doesNotMatch(sb, /castChatHTML/);
  assert.match(fl, /usesSbPool\(actor\)/); assert.match(fl, /takeSbPayment/); assert.match(fl, /castIsWhisper\(/);
  assert.match(fl, /const stones = sb \? \[\] :/);
  assert.match(read("../module/documents/item.mjs"), /castSpellFlow\(this\.actor, this\)/);
});
