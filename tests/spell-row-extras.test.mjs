import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { rowData, hasSpellEffects, hasItemMacro } from "../module/rules/spell-card.mjs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ROW = read("templates/actor/parts/actor-spell-item.hbs");

test("hasSpellEffects: sheet-context arrays and live Collections, empty or missing => false", () => {
  assert.equal(hasSpellEffects({ effects: [{ name: "Blessing" }] }), true);
  assert.equal(hasSpellEffects({ effects: new Map([["a", {}]]) }), true); // Collection-like (.size)
  assert.equal(hasSpellEffects({ effects: [] }), false);
  assert.equal(hasSpellEffects({ effects: new Map() }), false);
  assert.equal(hasSpellEffects({}), false);
  assert.equal(hasSpellEffects(null), false);
});

test("hasItemMacro: only a non-blank Item Macro command counts", () => {
  assert.equal(hasItemMacro({ flags: { itemacro: { macro: { command: "console.log(1)" } } } }), true);
  assert.equal(hasItemMacro({ flags: { itemacro: { macro: { command: "  " } } } }), false);
  assert.equal(hasItemMacro({ flags: { itemacro: { macro: {} } } }), false);
  assert.equal(hasItemMacro({ flags: {} }), false);
  assert.equal(hasItemMacro(undefined), false);
});

test("rowData exposes hasEffects / hasMacro", () => {
  const base = { name: "X", type: "spell", system: { type: "priest", level: 1 }, flags: {} };
  assert.deepEqual([rowData(base).hasEffects, rowData(base).hasMacro], [false, false]);
  const r = rowData({ ...base, effects: [{ name: "E" }], flags: { itemacro: { macro: { command: "x" } } } });
  assert.deepEqual([r.hasEffects, r.hasMacro], [true, true]);
});

test("shared spell row: effect and macro buttons are conditional, use the existing handler classes, sit before Cast", () => {
  assert.match(ROW, /\{\{#if row\.hasEffects\}\}<a class="applyeffect sw25-sr-xbtn sw25-sr-effect"/);
  assert.match(ROW, /\{\{#if row\.hasMacro\}\}<a class="execitemmacro sw25-sr-xbtn sw25-sr-macro"/);
  const cast = ROW.indexOf("sw25-spell-cast sw25-sr-cast");
  assert.ok(ROW.indexOf("applyeffect") < cast && ROW.indexOf("execitemmacro") < cast);
  assert.ok(ROW.includes('<li class=\'item spell sw25-spellrow-li\' data-item-id='), "handlers find the item via li.item[data-item-id]");
  const sheet = read("module/sheets/actor-sheet.mjs");
  assert.match(sheet, /html\.on\("click", "\.applyeffect", this\._onApplyEffect\.bind\(this\)\)/);
  assert.match(sheet, /html\.on\("click", "\.execitemmacro", this\._onItemMacro\.bind\(this\)\)/);
});

test("both lists get the buttons: All Spells and every school list use the shared row", () => {
  const parts = fs.readdirSync(new URL("../templates/actor/parts/", import.meta.url)).filter((f) => /^actor-spells(-.+)?\.hbs$/.test(f));
  assert.ok(parts.length >= 11, parts.join());
  for (const f of parts) assert.match(read(`templates/actor/parts/${f}`), /actor-spell-item\.hbs" item=item/, f);
  const css = read("css/sw25.css");
  assert.match(css, /--sw25-sr-cols:40px minmax\(120px,1fr\) 64px 96px 96px 96px 190px/);
  assert.match(css, /\.theme-dark \.sw25-sr-effect/);
});
