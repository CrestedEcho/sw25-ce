import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultPart, partIndex, partSelectHTML, partLabel, isMultiPart, partPicksFrom, pickFor, partDefense } from "../module/rules/part-pick.mjs";
import { applyPanelHTML, applyRow } from "../module/rules/damage-card.mjs";

const parts = [
  { name: "Head", isCore: false, hp: 20, hpValue: 12, defense: 3, evasion: { sv: 11 } },
  { name: "Body", isCore: true, hp: 40, hpValue: 40, defense: 6, evasion: { sv: 9 } },
  { name: "Tail", isCore: false, hp: 15, hpValue: 0, defense: 2 },
];
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("default part: core when alive, else first part above 0 HP; valid preference wins", () => {
  assert.equal(defaultPart(parts), 1);
  const deadCore = parts.map((p, i) => (i === 1 ? { ...p, hpValue: 0 } : p));
  assert.equal(defaultPart(deadCore), 0);
  assert.equal(defaultPart(parts.map((p) => ({ ...p, hpValue: 0 }))), 1);
  assert.equal(defaultPart(parts, 2), 2);
  assert.equal(defaultPart(parts, "0"), 0);
  assert.equal(defaultPart(parts, 9), 1);
  assert.equal(defaultPart(parts, null), 1);
  assert.equal(partIndex([], 1), null);
});

test("picker lists names with current/max HP and selects the chosen part", () => {
  assert.equal(partLabel(parts[1]), "Body ★ (HP 40/40)");
  const h = partSelectHTML(parts, 0, { id: "tok1" });
  assert.match(h, /class="sw25-dc-part"/); assert.match(h, /data-id="tok1"/);
  assert.match(h, /<option value="0" selected>Head \(HP 12\/20\)<\/option>/);
  assert.match(h, /Tail \(HP 0\/15\)/);
  assert.match(partSelectHTML(parts, null), /<option value="1" selected>Body ★/);
  assert.equal(partDefense(parts, 0), 3);
});

test("multi-part detection", () => {
  assert.equal(isMultiPart({ system: { sb: {}, sbView: { parts } } }), true);
  assert.equal(isMultiPart({ system: { sb: {}, sbView: { parts: [parts[0]] } } }), false);
  assert.equal(isMultiPart({ type: "character", system: {} }), false);
});

test("Evasion part picks are remembered per token / actor, later rolls win", () => {
  const picks = partPicksFrom([{ tokenId: "t1", actorId: "a1", part: 0 }, { tokenId: "t1", actorId: "a1", part: 2 }, { tokenId: "t9", actorId: "a9", part: null }]);
  assert.equal(pickFor(picks, { id: "t1" }), 2);
  assert.equal(pickFor(picks, { id: "other", actorId: "a1" }), 2);
  assert.equal(pickFor(picks, { id: "t9", actorId: "a9" }), null);
});

test("Apply panel: part picker only on multi-part rows; preview uses that part's Defense", () => {
  const rows = [
    { id: "t1", name: "Drake", defense: partDefense(parts, 0), parts, part: 0 },
    { id: "t2", name: "Ellen", defense: 4 },
  ];
  const h = applyPanelHTML(10, rows, { kind: "physical" });
  assert.equal((h.match(/sw25-dc-part/g) ?? []).length, 1);
  assert.match(h, /10 damage − 3 Defense = 7 ×1 → 7/);
  assert.match(h, /10 damage − 4 Defense = 6/);
  const h2 = applyPanelHTML(10, [{ ...rows[0], defense: partDefense(parts, 1), part: 1 }], { kind: "physical" });
  assert.match(h2, /10 damage − 6 Defense = 4/); assert.match(h2, /<option value="1" selected>/);
  assert.equal(applyRow(10, 6, { mult: -1 }).heal, true);
});

test("wiring: part flows through Defense, local apply, heal, GM socket and the Evasion roll", () => {
  const af = src("module/rules/attack-flow.mjs");
  assert.match(af, /targetDefense\(r\.actor, part\)/);
  assert.match(af, /applyFinalToActor\(r\.actor, a\.final, \{ pool: st\.pool, heal: a\.heal, part \}\)/);
  assert.match(af, /heal: a\.heal, part \}\);/); // remote list
  assert.match(af, /uiFor\(msg\)\.parts\[i\.dataset\.id\] = v/);
  assert.match(af, /evasionFor\(actor, part\)/);
  assert.match(af, /tokenId: token\?\.id \?\? null, part \}/);
  assert.match(af, /partPicks: evasionPartPicks\(cardId\)/);
  const ad = src("module/rules/apply-damage.mjs");
  assert.match(ad, /export function targetDefense\(a, part = null\)/);
  assert.match(ad, /return healActor\(a, n, part\)/);
  assert.match(ad, /part: Number\.isInteger\(x\.part\) \? x\.part : null/);
});
