import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareStatBlock, parseMovement, dispositionFor, statBlockFromData, STAT_DEFAULTS } from "../module/rules/statblock.mjs";
import { toDoc } from "../tools/build-compendia.mjs";
const kobold = JSON.parse(fs.readFileSync(new URL("../../gen/data/monsters/kobold.json", import.meta.url)));
const tpl = JSON.parse(fs.readFileSync(new URL("../template.json", import.meta.url)));

test("template: sb on npc and monster, loot+weakness on both", () => {
  for (const t of ["npc", "monster"]) { const sb = tpl.Actor[t].sb; assert.ok(Array.isArray(sb.loot) && "weakness" in sb && "weakPoint" in sb && "overrides" in sb && "hostile" in sb); }
  assert.deepEqual(Object.keys(tpl.Actor.monster.sb).sort(), Object.keys(STAT_DEFAULTS()).filter((k) => k !== "movementSpeed").sort());
});

test("movement: legacy movementSpeed (kobold) and object/string forms", () => {
  const sb = prepareStatBlock(statBlockFromData(kobold));
  assert.equal(sb.movement.ground, 12); assert.equal(sb.movementSpeed, 12);
  assert.deepEqual(parseMovement("10(Quadrupedal)/20(Flight)"), { ground: 10, groundMode: "Quadrupedal", other: 20, otherMode: "Flight" });
  assert.deepEqual(parseMovement("-/15").ground, null);
  assert.equal(prepareStatBlock({ movement: { ground: 13, groundMode: "", other: null, otherMode: "" } }).movement.ground, 13);
});

test("fixed = value+7 unless locked; flat and nested overrides; misc mod", () => {
  const sb = prepareStatBlock({ fortitude: { value: 7, fixed: 99 }, parts: [{ name: "Longsword", defense: 6, hp: 42, accuracy: { value: 8 } }],
    overrides: { "parts.0.defense": { value: 7, locked: true }, willpower: { fixed: { value: 20, locked: true } }, level: { mod: 1 } }, level: 6 });
  assert.equal(sb.fortitude.fixed, 14);
  assert.equal(sb.willpower.fixed, 20);
  assert.equal(sb.parts[0].defense, 7);
  assert.equal(sb.parts[0].accuracy.fixed, 15);
  assert.equal(sb.level, 7);
  assert.ok(sb.locked.includes("parts.0.defense") && sb.locked.includes("willpower.fixed"));
  assert.equal(sb.parts[0].isCore, true); assert.equal(sb.partCount, 1); assert.equal(sb.coreParts, "Longsword");
});

test("existing legacy monster actor loads via fallbacks", () => {
  const legacy = { monlevel: 3, popularity: 9, weakpoint: 14, weakness: "Fire damage +3 points", preemptive: 11, type: "Animal", reaction: "Hungry", habitat: "Forests, Plains", move: "15/-", impurity: 0 };
  const sb = prepareStatBlock(tpl.Actor.monster.sb, legacy, "monster");
  assert.deepEqual([sb.level, sb.reputation, sb.weakness, sb.weakPoint, sb.initiative, sb.monsterType, sb.movement.ground], [3, 9, 14, "Fire damage +3 points", 11, "Animal", 15]);
  assert.deepEqual(sb.habitat, ["Forests", "Plains"]);
  assert.equal(dispositionFor(sb, "monster"), "HOSTILE");
});

test("hostile toggle / attitude -> disposition", () => {
  assert.equal(dispositionFor({ hostile: true, attitude: "friendly" }, "npc"), "HOSTILE");
  assert.equal(dispositionFor({ hostile: false, attitude: "neutral" }, "npc"), "NEUTRAL");
  assert.equal(dispositionFor({ hostile: false }, "npc"), "FRIENDLY");
  assert.equal(dispositionFor({ disposition: "Neutral" }, "monster"), "NEUTRAL");
});

test("kobold builds into monster with sb, loot, prototype disposition", () => {
  const d = toDoc("monsters", { ...kobold, slug: "kobold" });
  assert.equal(d.type, "monster");
  assert.equal(d.system.sb.loot.length, kobold.loot.length);
  assert.equal(d.system.sb.weakness, 11);
  assert.equal(d.prototypeToken.disposition, 0);
  assert.deepEqual(d.flags["sw25-ce"].data.slug, "kobold");
});
