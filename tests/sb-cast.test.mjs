import test from "node:test"; import assert from "node:assert/strict";
import { parseMagicSkill, parseCostText, spellMeta, spellsForSkill, defaultCost, applySbCost, castChatHTML } from "../module/rules/sb-cast.mjs";

test("magic skill parsing", () => {
  assert.deepEqual(parseMagicSkill({ name: "Truespeech Magic 5" }), { schools: ["truespeech"], level: 5 });
  assert.deepEqual(parseMagicSkill({ name: "Divine Magic (Lumiere) 7" }), { schools: ["divine"], level: 7 });
  assert.deepEqual(parseMagicSkill({ name: "Wizardry Magic 3" }).schools, ["truespeech", "spiritualism"]);
  assert.equal(parseMagicSkill({ name: "Power Strike" }), null);
  assert.deepEqual(parseMagicSkill({ name: "x", magic: { school: "Fairy", level: 4 } }), { schools: ["fairy"], level: 4 });
});

test("cost text", () => {
  assert.deepEqual(parseCostText("MP5", 5), { raw: "MP5", base: 5, max: null, hp: 0, open: false });
  const r = parseCostText("MP50-200"); assert.equal(r.base, 50); assert.equal(r.max, 200); assert.equal(r.open, true);
  assert.equal(parseCostText("MP1+").open, true); assert.equal(parseCostText("MP10 + Level").open, true);
  const h = parseCostText("MP5 + HP5"); assert.equal(h.hp, 5); assert.equal(h.open, false); assert.equal(h.base, 5);
});

const comp = [
  { _id: "1", name: "Energy Bolt", system: { mpcost: 5, mpcostText: "MP5" }, flags: { "sw25-ce": { data: { school: "truespeech", level: 1 } } } },
  { _id: "2", name: "Lightning", system: { mpcost: 7, mpcostText: "MP7" }, flags: { "sw25-ce": { data: { school: "truespeech", level: 6 } } } },
  { _id: "3", name: "Fist of God", system: { mpcost: 8, mpcostText: "MP8", mpRule: { base: 8, variable: true, byDeityRank: { ancient: 12, major: 10, minor: 8 } } }, flags: { "sw25-ce": { data: { school: "divine", level: 8 } } } },
  { _id: "4", name: "Perfect Cancellation", system: { mpcost: 33, mpcostText: "MP33", mpRule: { base: 33, ritualCasting: { castingTime: "1 hour", effect: "can also strip magic items" } } }, flags: { "sw25-ce": { data: { school: "truespeech", level: 15 } } } },
  { _id: "e", name: "Energy Bolt", system: { mpcost: 5, school: "truespeech", level: 1 } },
];
test("picker lists school spells up to level, de-duplicated", () => {
  assert.deepEqual(spellsForSkill({ schools: ["truespeech"], level: 5 }, comp).map((s) => s.name), ["Energy Bolt"]);
  assert.deepEqual(spellsForSkill({ schools: ["truespeech"], level: 15 }, comp).map((s) => s.name), ["Energy Bolt", "Lightning", "Perfect Cancellation"]);
});
test("dialog triggers: deity rank, ritual, open cost", () => {
  const fog = spellMeta(comp[2]); assert.equal(fog.needsDialog, true); assert.equal(defaultCost(fog, "major"), 10); assert.equal(defaultCost(fog), 8);
  const pc = spellMeta(comp[3]); assert.equal(pc.needsDialog, true); assert.match(pc.ritual.effect, /strip/);
  assert.equal(spellMeta(comp[0]).needsDialog, false);
});

test("deducts current MP of main part, never max (locked override untouched); shortage warns", () => {
  const raw = [{ name: "Arm", hp: 10, mp: 5 }, { name: "Body", hp: 40, hpValue: 30, mp: 20, mpValue: 9, isCore: true }];
  const view = [{ ...raw[0] }, { ...raw[1], mp: 25 }]; // locked override raised max to 25
  const r = applySbCost(raw, view, { mp: 5, hp: 5 });
  assert.equal(r.index, 1); assert.equal(r.parts[1].mpValue, 4); assert.equal(r.parts[1].hpValue, 25); assert.equal(r.parts[1].mp, 20, "max untouched");
  const fresh = applySbCost([{ hp: 10, mp: 12 }], [{ hp: 10, mp: 15, isCore: true }], { mp: 3 }); assert.equal(fresh.parts[0].mpValue, 12, "starts from (overridden) max when no current");
  const s = applySbCost(raw, view, { mp: 50 }); assert.equal(s.mpShort, true); assert.equal(s.parts[1].mpValue, 0);
  const html = castChatHTML("Kobold <Mage>", spellMeta(comp[0]), { mp: 50, hp: 0 }, s);
  assert.match(html, /Cost spent: <b>MP 50<\/b>/); assert.match(html, /Not enough MP/); assert.match(html, /&lt;Mage&gt;/);
});

test("applySbCost: partIndex picks the paying part, max untouched", () => {
  const raw = [{ name: "Torso", mp: 20, mpValue: 20 }, { name: "Head", mp: 24, mpValue: 18, isCore: true }];
  const view = [{ ...raw[0] }, { ...raw[1] }];
  const def = applySbCost(raw, view, { mp: 5 }); assert.equal(def.index, 1); assert.equal(def.parts[1].mpValue, 13);
  const r = applySbCost(raw, view, { mp: 5, partIndex: 0 }); assert.equal(r.index, 0); assert.equal(r.parts[0].mpValue, 15); assert.equal(r.parts[0].mp, 20); assert.equal(r.parts[1].mpValue, 18);
});

test("castChatHTML names the paying part and cost", () => {
  const meta = spellMeta({ name: "Energy Bolt", system: { mpcost: 5, mpcostText: "MP5" }, flags: { "sw25-ce": { data: { school: "truespeech", level: 1 } } } });
  const h = castChatHTML("Wyvern", meta, { mp: 5, hp: 0, partName: "Head" }, { mpBefore: 18, mpAfter: 13, hpBefore: 31, hpAfter: 31 });
  assert.match(h, /Paid by: Head/); assert.match(h, /MP 5/); assert.match(h, /18 → 13/);
});
