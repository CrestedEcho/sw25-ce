import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePowerCommand, parsePowerFormula, powerTableFor, powerFormulaText, POWER_ALIASES } from "../module/rules/power-command.mjs";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const f = (s) => parsePowerCommand(s)?.formula;

test("/r and /roll take p<N> / k<N>; plain dice stay with core", () => {
  for (const s of ["/r p10", "/r k10", "/roll p10", "/R P10"]) assert.equal(f(s).power, 10, s);
  for (const s of ["/r 2d6", "/r 2d6+3", "/roll 1d20 + 5", "/r", "/r d6", "/r 2d6 power 10", "/rx k10", "hello k10", "/w Bob k10", "/gmr 2d6"]) assert.equal(parsePowerCommand(s), null, s);
});

test("all aliases take k or p", () => {
  for (const a of POWER_ALIASES) { assert.equal(f(`${a} p10`).power, 10, a); assert.equal(f(`${a} k20@9`).crit, 9, a); }
});

test("crit and bonus in any order, glued or spaced, bonuses summed", () => {
  for (const s of ["/rp k10@9+3", "/rp k10+3@9", "/rp @9+3k10", "/r p10 @9 +3", "/r p10 +3 @9", "/rp p10 +5 -2 @9", "/r k10@9 +1+2"]) {
    const x = f(s); assert.deepEqual([x.power, x.crit, x.bonus], [10, 9, 3], s);
  }
  const d = f("/rp k10"); assert.deepEqual([d.crit, d.bonus, d.half], [10, 0, false]);
  assert.equal(f("/rp k10-2").bonus, -2);
});

test("old extended modifiers still parse", () => {
  const x = f("/rp k10+2h-1#1$+2tf4r5");
  assert.equal(x.half, true); assert.equal(x.halfBonus, -1); assert.equal(x.bonus, 2);
  assert.equal(x.lethalTech, 1); assert.equal(x.criticalRay, "2"); assert.equal(x.pharmTool, 4); assert.equal(x.powup, 5);
  assert.equal(f("/rp k10h").half, true);
  assert.equal(f("/rp k10$f9").criticalRay, "f9");
  assert.equal(f("/rp k10$f+9").criticalRay, "f9");
  assert.equal(f("/rp k10$-1").criticalRay, "-1");
});

test("comment after the expression; roll modes from /gmr /br /sr", () => {
  const p = parsePowerCommand("/rp k10@9+3 Fire  sword cut");
  assert.equal(p.comment, "Fire sword cut"); assert.equal(p.mode, null); assert.equal(p.text, "k10@9+3");
  assert.equal(parsePowerCommand("/r p10 @9 Big hit").comment, "Big hit");
  assert.equal(parsePowerCommand("/gmr p10").mode, "gmroll");
  assert.equal(parsePowerCommand("/br k10").mode, "blindroll");
  assert.equal(parsePowerCommand("/sr k10").mode, "selfroll");
});

test("bad power expressions give a warning instead of falling to core", () => {
  for (const s of ["/rp", "/rp Sword", "/rp @9+3", "/rp k10k20", "/r p10abc", "/rp k101"]) assert.ok(parsePowerCommand(s)?.error, s);
  assert.equal(parsePowerFormula("x"), null);
});

test("power table hands every table row to the Reference Power Table (no numbers in code)", () => {
  const pt = powerTableFor(f("/rp k10@9+3h+1#1"));
  assert.equal(pt.length, 20); assert.equal(pt[0], 10); assert.equal(pt[1], 9);
  for (let i = 2; i <= 12; i++) assert.equal(pt[i], null);
  assert.deepEqual(pt.slice(13, 17), [3, 1, 1, 1]);
  assert.equal(powerFormulaText(f("/r p10 @9 +5 -2")), "k10@9+3");
});

test("wired natively: chatMessage hook, damage card with Apply, roll message; no Chat Commander", () => {
  const af = src("module/rules/attack-flow.mjs");
  assert.match(af, /Hooks\.on\("chatMessage"/);
  assert.match(af, /const p = parsePowerCommand\(message\); if \(!p\) return;/);
  assert.match(af, /return false;\n  \}\);/);
  assert.match(af, /export async function postPowerCommand[\s\S]*?damageCardHTML\(state\)[\s\S]*?dmgcard[\s\S]*?rollMessageData\(/);
  const main = src("module/sw25.mjs");
  assert.doesNotMatch(main, /chatCommands\.register|_chatcommands|customCommand/);
});
