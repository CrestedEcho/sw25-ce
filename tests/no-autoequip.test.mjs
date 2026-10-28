import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldUnequipOnCreate, registerNoAutoEquip, GEAR_TYPES } from "../module/rules/no-autoequip.mjs";

test("template default: new weapons/armor/accessories are not equipped", () => {
  const t = JSON.parse(readFileSync(new URL("../template.json", import.meta.url)));
  assert.equal(t.Item.templates.battle.equip, false);
  for (const ty of GEAR_TYPES) assert.ok(t.Item[ty].templates.includes("battle"), ty);
});

test("pure rule: gear with equip=true created on an existing actor is unequipped", () => {
  for (const type of GEAR_TYPES) assert.equal(shouldUnequipOnCreate({ type, equip: true, parentPersisted: true }), true, type);
  assert.equal(shouldUnequipOnCreate({ type: "weapon", equip: false, parentPersisted: true }), false);
  assert.equal(shouldUnequipOnCreate({ type: "combatability", equip: true, parentPersisted: true }), false, "feats use equip as 'active'");
  assert.equal(shouldUnequipOnCreate({ type: "item", equip: true, parentPersisted: true }), false);
  assert.equal(shouldUnequipOnCreate({ type: "armor", equip: true, parentPersisted: false }), false, "actor import keeps its state");
  assert.equal(shouldUnequipOnCreate({ type: "armor", equip: true, parentPersisted: true, keepEquip: true }), false);
});

test("preCreateItem hook forces equip=false on drops (world + token actors), leaves others", () => {
  const hooks = {};
  class FakeActor { constructor(id, isToken = false) { this.id = id; this.isToken = isToken; } }
  globalThis.Actor = FakeActor;
  globalThis.Hooks = { on: (n, fn) => { hooks[n] = fn; } };
  globalThis.game = { actors: new Map([["a1", {}]]) };
  registerNoAutoEquip();
  const mk = (type, parent, equip = true) => ({ type, parent, system: { equip }, updateSource(p) { this.system.equip = p["system.equip"]; } });
  const run = (it, opts = {}) => (hooks.preCreateItem(it, {}, opts), it.system.equip);
  assert.equal(run(mk("weapon", new FakeActor("a1"))), false);
  assert.equal(run(mk("armor", new FakeActor("t1", true))), false);
  assert.equal(run(mk("accessory", new FakeActor("a1")), { sw25Slot: true }), false, "class grants / internal creates too");
  assert.equal(run(mk("weapon", new FakeActor("new"))), true, "actor being created with its items");
  assert.equal(run(mk("weapon", null)), true, "world/sidebar item, no actor");
  assert.equal(run(mk("combatability", new FakeActor("a1"))), true);
  assert.equal(run(mk("weapon", new FakeActor("a1")), { sw25KeepEquip: true }), true);
});

test("equipment card: createItem no longer auto-slots gear; slot drops still equip via equipToSlot", () => {
  const src = readFileSync(new URL("../module/ce7/equipcard.mjs", import.meta.url), "utf8");
  const create = src.slice(src.indexOf('Hooks.on("createItem"'), src.indexOf('Hooks.on("updateItem"'));
  assert.ok(!/equipToSlot|autoSlotFor/.test(create));
  assert.match(src, /case "slot": \{[\s\S]*?return equipToSlot\(actor, slot, it\);/);
  assert.match(src, /obj\.system\.equip = false;/);
  const main = readFileSync(new URL("../module/sw25.mjs", import.meta.url), "utf8");
  assert.match(main, /registerNoAutoEquip\(\);/);
});
