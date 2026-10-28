import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { weaponRoute } from "../module/rules/weapon-route.mjs";

const pc = { type: "character" }, npc = { type: "npc" }, mon = { type: "monster" };
const w = { type: "weapon" }, acc = { type: "accessory" };
const src = (f) => readFileSync(new URL(`../module/${f}`, import.meta.url), "utf8");

test("character weapon: Check -> attack card, Power -> damage card", () => {
  for (const k of ["check", "dice", "buttoncheck"]) assert.equal(weaponRoute(pc, w, k), "attack");
  for (const k of ["power", "buttonpower"]) assert.equal(weaponRoute(pc, w, k), "damage");
});
test("other clicks, other items and non-character actors keep the old behaviour", () => {
  for (const k of ["dice1", "buttoncheck2", "card", "", undefined]) assert.equal(weaponRoute(pc, w, k), null);
  assert.equal(weaponRoute(pc, acc, "check"), null);
  assert.equal(weaponRoute(npc, w, "check"), null);
  assert.equal(weaponRoute(mon, w, "power"), null);
  assert.equal(weaponRoute(null, w, "check"), null);
  assert.equal(weaponRoute(pc, null, "check"), null);
});
test("sheet Weapons list buttons route through attackWithWeapon (shift-click keeps the old roll)", () => {
  const s = src("sheets/actor-sheet.mjs");
  assert.match(s, /_sw25WeaponRoute\(event, "check"\)/);
  assert.match(s, /_sw25WeaponRoute\(event, "power"\)/);
  assert.match(s, /if \(event\.shiftKey \|\| ds\.needweapon !== undefined \|\| ds\.rollType\) return null;/);
  assert.match(s, /return attackWithWeapon\(this\.actor, item, route\)/);
});
test("item image click and old item-card buttons route too", () => {
  assert.match(src("documents/item.mjs"), /weaponRoute\(this\.actor, this, this\.system\.clickitem\)/);
  const c = src("helpers/chatbutton.mjs");
  assert.match(c, /const wr = weaponRoute\(actor, item, buttonType\);/);
  assert.ok(c.indexOf("weaponRoute(actor, item, buttonType)") < c.indexOf("isSelfCheckItem(item, which)"));
});
test("attackWithWeapon posts the cards for that weapon by item id (no hitweapon rename dance)", () => {
  const a = src("rules/attack-flow.mjs");
  const body = a.slice(a.indexOf("export async function attackWithWeapon"), a.indexOf("export async function postAttackCard"));
  assert.doesNotMatch(body, /system\.hitweapon/);
  assert.doesNotMatch(body, /same name/);
  assert.match(body, /route === "damage" \? rollWeaponDamage\(actor, \{ itemId: item\.id \}\) : postAttackCard\(actor, \{ itemId: item\.id \}\)/);
  assert.match(body, /actor\.isOwner/);
});
