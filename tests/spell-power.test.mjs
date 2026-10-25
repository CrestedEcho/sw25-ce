import { test } from "node:test"; import assert from "node:assert/strict";
import { spellDamage, tableValue, magicWeakBonus, magicDamageTaken } from "../module/rules/spell-power.mjs";
import { parseMagicSkill } from "../module/rules/sb-cast.mjs";
const P10 = { rate: 10, table: [1, 2, 3, 3, 4, 5, 6, 7, 8, 9] }; // 3..12 (illustrative)
test("table lookup 3..12, 2 = 0", () => { assert.equal(tableValue(P10, 3), 1); assert.equal(tableValue(P10, 12), 9); assert.equal(tableValue(P10, 2), 0); });
test("damage = table + magic power, half rounds up", () => {
  const d = spellDamage({ power: P10, crit: 10, magicPower: 4, rolls: [7] }); assert.equal(d.total, 4 + 4); assert.equal(d.half, 4);
  const e = spellDamage({ power: P10, crit: 10, magicPower: 4, rolls: [8] }); assert.equal(e.total, 9); assert.equal(e.half, 5); });
test("crit rerolls and adds; fumble = 0", () => {
  const d = spellDamage({ power: P10, crit: 10, magicPower: 0, rolls: [10, 11, 5, 9] }); assert.deepEqual(d.rolls, [10, 11, 5]); assert.equal(d.crits, 2); assert.equal(d.table, 7 + 8 + 3);
  assert.equal(spellDamage({ power: P10, magicPower: 4, rolls: [2] }).total, 0); });
test("magic weak point", () => { assert.equal(magicWeakBonus("Magic Damage +2 points"), 2); assert.equal(magicWeakBonus("Wind type damage +3 points"), 0);
  assert.equal(magicDamageTaken(5, "Magic Damage +2 points"), 7); assert.equal(magicDamageTaken(0, "Magic Damage +2 points"), 0); });
test("magic power is value, not fixed", () => { assert.equal(parseMagicSkill({ name: "Truespeech Magic 3", magic: { school: "truespeech", level: 3, power: { value: 4, fixed: 11 } } }).magicPower, 4); });
