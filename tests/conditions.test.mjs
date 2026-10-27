import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as K from "../module/rules/conditions.mjs";
import { effectData, statusOf } from "../module/rules/spell-card.mjs";

const lang = JSON.parse(fs.readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
const WANT = ["prone", "unconscious", "asleep", "petrified", "entangled", "blinded", "invisible", "flying", "stun", "fear", "frenzy", "confused", "charmed", "hungry", "intoxicated", "poison", "curse", "disease", "dead"];

test("status palette: the SW2.5 list, stable unique ids, dead kept", () => {
  const cfg = K.statusEffectsConfig();
  assert.deepEqual(cfg.map((c) => c.id), WANT);
  assert.equal(new Set(cfg.map((c) => c.id)).size, cfg.length);
});

test("markers only: no changes on any status entry; core icons only", () => {
  for (const c of K.statusEffectsConfig()) {
    assert.equal(c.changes, undefined, c.id);
    assert.match(c.img, /^icons\/svg\/[a-z-]+\.svg$/, c.id);
  }
});

test("every condition has an English name and one-line description in lang/en.json", () => {
  for (const c of K.statusEffectsConfig()) {
    const [, , id] = c.name.split(".");
    const e = lang.SW25.Condition[id];
    assert.ok(e?.Name && e?.Desc, id); assert.doesNotMatch(e.Desc, /\n/);
    assert.equal(c.name, `SW25.Condition.${id}.Name`); assert.equal(c.description, `SW25.Condition.${id}.Desc`);
  }
});

test("conditionId: aliases from old/core ids", () => {
  assert.equal(K.conditionId("sleep"), "asleep"); assert.equal(K.conditionId("blind"), "blinded");
  assert.equal(K.conditionId("Petrifaction"), "petrified"); assert.equal(K.conditionId("stun"), "stun");
  assert.equal(K.conditionId("burning"), ""); assert.equal(K.conditionId(""), "");
});

test("spell Apply Effect: matching condition via statuses, spell duration, combat start", () => {
  const e = effectData(statusOf({ time: "10 seconds (1 round)", status: { id: "stun" } }), { combat: { id: "c1", round: 3, turn: 2 } });
  assert.deepEqual(e.statuses, ["stun"]); assert.equal(e.img, "icons/svg/daze.svg"); assert.equal(e.name, "Stunned");
  assert.deepEqual(e.duration, { rounds: 1, combat: "c1", startRound: 3, startTurn: 2 });
  assert.deepEqual(e.changes, []);
  const p = effectData({ id: "", label: "Petrifaction", rounds: 18, description: "Dexterity or Agility -6", changes: [] });
  assert.deepEqual(p.statuses, ["petrified"]); assert.equal(p.img, "icons/svg/stoned.svg");
  const b = effectData({ id: "", label: "Blood Mist", rounds: 1, changes: [{ key: "accuracy", value: -2 }] });
  assert.deepEqual(b.statuses, []); assert.equal(b.changes.length, 1);
});

test("isEffectExpired: ends at the start turn, N rounds later", () => {
  const d = { rounds: 3, startRound: 1, startTurn: 2 };
  assert.equal(K.isEffectExpired(d, { round: 4, turn: 1 }), false);
  assert.equal(K.isEffectExpired(d, { round: 4, turn: 2 }), true);
  assert.equal(K.isEffectExpired(d, { round: 5, turn: 0 }), true);
  assert.equal(K.isEffectExpired({ rounds: 0, startRound: 1 }, { round: 9 }), false);
  assert.equal(K.isEffectExpired({ rounds: 2 }, { round: 9 }), false);
});
