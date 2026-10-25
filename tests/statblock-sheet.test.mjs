import test from "node:test"; import assert from "node:assert/strict";
import { prepareStatBlock } from "../module/rules/statblock.mjs";
import { buildStatBlockContext, foldSubmitData, monsterTypeIcon, sheetTabs, accentFor, roleLine } from "../module/rules/statblock-sheet-data.mjs";

const captain = { title: "Guard Captain", settlement: "Harvesgard", level: 6, attitude: "neutral", hostile: false,
  classLevels: [{ classSlug: "fighter", level: 5 }, { classSlug: "ranger", level: 2 }],
  fortitude: { value: 7 }, willpower: { value: 6 },
  parts: [{ name: "Longsword", accuracy: { value: 8 }, damage: "2d+8", evasion: { value: 7 }, defense: 6, hp: 42, mp: 12, isCore: true }],
  uniqueSkills: [{ name: "Power Strike", tags: ["declared"] }, { name: "Shield Training", tags: ["passive", "major"] }],
  loot: [{ roll: "Always", item: "Badge", price: 100 }], overrides: { parts: { 0: { defense: { value: 7, locked: true } } } } };

test("tabs + accent: NPC teal/Person first, hostile rust/Combat first, monster rust", () => {
  assert.deepEqual(sheetTabs("npc", false), ["person", "combat", "inventory", "notes"]);
  assert.equal(sheetTabs("npc", true)[0], "combat");
  assert.deepEqual(sheetTabs("monster"), ["combat", "lore", "notes"]);
  assert.equal(accentFor("npc", false), "teal"); assert.equal(accentFor("npc", true), "rust"); assert.equal(accentFor("monster"), "rust");
});

test("monster type icon + role lines", () => {
  assert.match(monsterTypeIcon("MythicalBeast"), /_type-mythical\.webp$/);
  assert.match(monsterTypeIcon("Barbarous"), /monsters\/_type-barbarous\.webp$/);
  assert.equal(monsterTypeIcon("Unknownish"), null);
  assert.equal(roleLine("npc", { title: "Guard Captain", settlement: "Harvesgard", level: 6 }), "Guard Captain, Harvesgard · Lv 6");
  assert.equal(roleLine("monster", { level: 1, monsterType: "Barbarous" }), "Lv 1 · Barbarous");
});

test("context: quill on locked part defense, fixed values, class levels, tag glyphs", () => {
  const view = prepareStatBlock(captain, {}, "npc");
  const c = buildStatBlockContext({ type: "npc", view, raw: captain });
  const p = c.parts[0];
  assert.equal(p.defense.locked, true); assert.equal(p.defense.edit, 7);
  assert.equal(p.accuracy.value.edit, 8); assert.equal(p.accuracy.fixed, 15);
  assert.equal(c.stats.fortitude.fixed, 14);
  assert.equal(c.classLevels, "Fighter 5, Ranger 2");
  assert.ok(c.skills[0].tags[0].icon.endsWith("_type-declared.webp"));
  assert.equal(c.skills[1].tags[1].glyph, "►");
  assert.equal(c.tabs[0].key, "person"); assert.equal(c.accent, "teal");
  const h = buildStatBlockContext({ type: "npc", view: prepareStatBlock({ ...captain, hostile: true }, {}, "npc"), raw: captain });
  assert.equal(h.tabs[0].key, "combat"); assert.equal(h.accent, "rust"); assert.equal(h.hostile, true);
});

test("fold submit: arrays stay arrays, locked fields write override value, tags split", () => {
  const out = foldSubmitData({
    "name": "X", "system.sb.parts.0.name": "Greatsword", "system.sb.parts.0.defense": 9, "system.sb.parts.0.accuracy.value": 10,
    "system.sb.uniqueSkills.1.tags": "passive minor", "system.sb.initiative": 15, "system.sb.willpower.value": 4,
  }, captain, ["parts.0.defense", "willpower.value"]);
  assert.ok(Array.isArray(out["system.sb.parts"]));
  assert.equal(out["system.sb.parts"][0].name, "Greatsword"); assert.equal(out["system.sb.parts"][0].accuracy.value, 10);
  assert.equal(out["system.sb.parts"][0].defense, 6, "base untouched when locked");
  assert.equal(out["system.sb.overrides.parts.0.defense.value"], 9);
  assert.equal(out["system.sb.overrides.willpower.value.value"], 4);
  assert.deepEqual(out["system.sb.uniqueSkills"][1].tags, ["passive", "minor"]);
  assert.equal(out["system.sb.initiative"], 15); assert.equal(out.name, "X");
  assert.equal(captain.parts[0].name, "Longsword", "source not mutated");
});

test("legacy monster (no sb) still yields a usable context", () => {
  const legacy = { monlevel: 3, popularity: 9, weakpoint: 14, weakness: "Fire damage +3 points", preemptive: 11, type: "Animal", move: "15/-" };
  const c = buildStatBlockContext({ type: "monster", view: prepareStatBlock({}, legacy, "monster"), raw: {} });
  assert.equal(c.stats.level.value, 3); assert.equal(c.sb.weakPoint, "Fire damage +3 points");
  assert.match(c.typeIcon, /_type-animal/); assert.equal(c.stats.movementText, "15 / —");
});
