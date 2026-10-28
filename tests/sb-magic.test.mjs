import { test } from "node:test";
import assert from "node:assert/strict";
import { magicBlocks, migrateMagic, newMagicEntry, fairyAllows, blockSpells, buildMagicContext, skillLike, MAGIC_SCHOOLS } from "../module/rules/sb-magic.mjs";
import { parseMagicSkill } from "../module/rules/sb-cast.mjs";
import { sbMagicPower } from "../module/rules/sb-spell.mjs";
import { buildStatBlockContext } from "../module/rules/statblock-sheet-data.mjs";

const sp = (name, school, level, extra = {}) => ({ name, uuid: `U.${name}`, img: "", system: { school, level, mpcost: 5, ...extra } });
const DOCS = [sp("Bolt", "truespeech", 1, { power: { rate: 10 } }), sp("Sleep", "truespeech", 2), sp("High", "truespeech", 9),
  sp("Spark", "spiritualism", 1), sp("Basic", "fairy", 1, { fairytype: "basicfairy" }), sp("Fire Bolt", "fairy", 2, { fairyprop: "fairyfire" }),
  sp("Rock", "fairy", 2, { fairyprop: "fairyearth" }), sp("All", "fairy", 3, { fairytype: "specialfairy" })];

test("migration moves magic Unique skills non-destructively and is idempotent", () => {
  const raw = { uniqueSkills: [{ name: "Truespeech Magic 5", check: { value: 8, fixed: 15 }, description: "keep me" }, { name: "Bite" }, { name: "Divine Magic (Lumiere) 7", check: { value: 9 } }] };
  const m = migrateMagic(raw);
  assert.equal(m.changed, true);
  assert.deepEqual(m.magic.map((e) => [e.school, e.level, e.power.fixed]), [["truespeech", 5, 15], ["divine", 7, 16]]);
  assert.equal(m.uniqueSkills.length, 3); assert.equal(m.uniqueSkills[0].description, "keep me");
  assert.equal(m.uniqueSkills[0].magicMoved, true); assert.equal(m.uniqueSkills[1].magicMoved, undefined);
  assert.equal(raw.uniqueSkills[0].magicMoved, undefined, "input not mutated");
  const again = migrateMagic({ magic: m.magic, uniqueSkills: m.uniqueSkills });
  assert.equal(again.changed, false); assert.equal(again.magic.length, 2);
});

test("blocks show saved entries and not-yet-moved skills (legacy) the same way", () => {
  const before = magicBlocks({ uniqueSkills: [{ name: "Wizardry Magic 4", check: { value: 6, fixed: 13 } }] });
  assert.equal(before.length, 1); assert.equal(before[0].legacy, true);
  assert.deepEqual(before[0].schools.sort(), ["spiritualism", "truespeech"]);
  const m = migrateMagic({ uniqueSkills: [{ name: "Wizardry Magic 4", check: { value: 6, fixed: 13 } }] });
  const after = magicBlocks(m);
  assert.equal(after.length, 1); assert.equal(after[0].legacy, false);
  assert.deepEqual([after[0].label, after[0].level, after[0].value, after[0].fixed], ["Wizardry", 4, 6, 13]);
});

test("skillLike plugs into the 6948c6d cast flow parsers", () => {
  const s = skillLike({ school: "truespeech", level: 5, power: { fixed: 15 } });
  assert.deepEqual(parseMagicSkill(s).schools, ["truespeech"]); assert.equal(parseMagicSkill(s).level, 5);
  assert.deepEqual(sbMagicPower(s), { fixed: 15, value: 8 });
});

test("add row: school from the list only, Magic Power value -> fixed +7", () => {
  assert.equal(newMagicEntry({ school: "Truespeech Magic", level: 3, power: 4 }), null);
  assert.equal(newMagicEntry({ school: "", level: 3, power: 4 }), null);
  assert.deepEqual(newMagicEntry({ school: "fairy", level: "4", power: "7" }), { school: "fairy", level: 4, power: { fixed: 14 }, fairies: [], from: "" });
  assert.equal(MAGIC_SCHOOLS.length, 7);
});

test("fairy contracts filter the spell list", () => {
  assert.equal(fairyAllows(DOCS[4], []), true);
  assert.equal(fairyAllows(DOCS[5], ["fire"]), true); assert.equal(fairyAllows(DOCS[5], ["earth"]), false);
  assert.equal(fairyAllows(DOCS[7], ["earth", "fire", "ice", "wind", "light"]), false);
  assert.equal(fairyAllows(DOCS[7], ["earth", "fire", "ice", "wind", "light", "dark"]), true);
  const [b] = magicBlocks({ magic: [{ school: "fairy", level: 4, power: { fixed: 14 }, fairies: ["fire"] }] });
  assert.deepEqual(blockSpells(b, DOCS).map((x) => x.meta.name), ["Basic", "Fire Bolt"]);
});

test("context: aligned cards, Power vs GM-only toggle, MP bar of the paying part", () => {
  const rawSb = { parts: [{ name: "Body", mp: 50, mpValue: 32 }, { name: "Head", mp: 20 }], magic: [{ school: "truespeech", level: 5, power: { fixed: 15 } }] };
  const viewParts = [{ name: "Body", isCore: true, mp: 50 }, { name: "Head", mp: 20 }];
  const c = buildMagicContext({ rawSb, viewParts, docs: DOCS, gmMap: { sleep: false } });
  assert.deepEqual(c.mp, { cur: 32, max: 50, pct: 64, name: "Body" }); assert.equal(c.multiPart, true);
  const [b] = c.blocks; assert.equal(b.castFormula, "2d6+8");
  assert.deepEqual(b.shown.map((s) => s.name), ["Bolt", "Sleep"]);
  assert.equal(b.shown[0].hasPower, true); assert.equal(b.shown[0].power, 10);
  assert.equal(b.shown[1].hasPower, false); assert.equal(b.shown[1].gmOnly, false);
  assert.equal(b.shown[0].img, null);
  const c2 = buildMagicContext({ rawSb, viewParts, docs: DOCS, partIndex: 1 });
  assert.equal(c2.mp.name, "Head"); assert.equal(c2.mp.cur, 20);
});

test("Unique skills: magic ones are flagged inMagic (hidden in Play), deleted Magic entry shows the skill again", () => {
  const base = { parts: [{ name: "Body", isCore: true }] };
  const ctx = (raw) => buildStatBlockContext({ type: "monster", view: { ...base, uniqueSkills: raw.uniqueSkills }, raw, isGM: true });
  const m = migrateMagic({ uniqueSkills: [{ name: "Truespeech Magic 5" }, { name: "Bite" }] });
  assert.deepEqual(ctx(m).skills.map((s) => s.inMagic), [true, false]);
  assert.deepEqual(ctx({ ...m, magic: [] }).skills.map((s) => s.inMagic), [false, false]);
});

test("dropped spell items: shown under their school's block (legacy system.type too), owned copy wins, above level kept", () => {
  const owned = [{ _id: "i1", name: "Sleep", uuid: "Actor.a.Item.i1", system: { type: "sorcerer", level: 2, mpcost: 5 } },
    { _id: "i2", name: "Meteor", uuid: "Actor.a.Item.i2", system: { school: "truespeech", level: 9, mpcost: 20 } }];
  const [b] = magicBlocks({ magic: [{ school: "truespeech", level: 5, power: { fixed: 15 } }] });
  const rows = blockSpells(b, DOCS, owned);
  assert.deepEqual(rows.map((r) => r.meta.name), ["Bolt", "Sleep", "Meteor"]);
  assert.equal(rows[1].meta.owned, true); assert.equal(rows[1].doc.uuid, "Actor.a.Item.i1");
  assert.equal(rows[2].meta.aboveLevel, true);
});

test("owned spells with no matching magic skill go to Unassigned with an Add <School> prompt", () => {
  const owned = [{ _id: "i1", name: "Heal", system: { school: "divine", level: 3 } }, { _id: "i2", name: "Bolt2", system: { school: "truespeech", level: 1 } },
    { _id: "i3", name: "Odd", system: {} }];
  const c = buildMagicContext({ rawSb: { parts: [{ name: "Body", mp: 10 }], magic: [{ school: "truespeech", level: 3, power: { fixed: 10 } }] },
    viewParts: [{ name: "Body", isCore: true, mp: 10 }], docs: [], owned });
  assert.deepEqual(c.unassigned.map((g) => [g.school, g.label, g.canAdd, g.level, g.cards.map((x) => x.name)]),
    [["divine", "Divine", true, 3, ["Heal"]], ["", "", false, 1, ["Odd"]]]);
  assert.equal(c.unassigned[0].cards[0].castable, false);
  assert.deepEqual(c.blocks[0].shown.map((s) => s.name), ["Bolt2"]);
  const only = buildMagicContext({ rawSb: { parts: [] }, viewParts: [], owned: [owned[0]] });
  assert.equal(only.has, true); assert.equal(only.blocks.length, 0);
});

test("owned spells are never folded into '+ N more'", () => {
  const many = Array.from({ length: 6 }, (_, k) => sp(`S${k}`, "truespeech", 1));
  const c = buildMagicContext({ rawSb: { magic: [{ school: "truespeech", level: 9, power: { fixed: 15 } }] }, docs: many,
    owned: [{ _id: "o", name: "Zz", system: { school: "truespeech", level: 9 } }] });
  assert.equal(c.blocks[0].shown.length, 5); assert.ok(c.blocks[0].shown.some((x) => x.name === "Zz")); assert.equal(c.blocks[0].more.length, 2);
});
