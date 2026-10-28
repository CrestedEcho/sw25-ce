import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const EN = JSON.parse(read("lang/en.json"));
const LIST = read("templates/actor/parts/actor-spells.hbs");
const HEADER = read("templates/actor/parts/actor-spell-header.hbs");
const SHEET = read("templates/actor/actor-character-sheet.hbs");
const SHEETJS = read("module/sheets/actor-sheet.mjs");

test("Show All Spells: label is plural and the new strings exist", () => {
  assert.equal(EN.SW25.Attributes.Showspell, "Show All Spells");
  assert.equal(EN.SW25.V2.AllSpells, "All Spells");
  assert.ok(EN.SW25.V2.NoSpells);
});

test("Show All Spells: list uses the same header and row partials as the school sections", () => {
  assert.match(LIST, /actor-spell-header\.hbs" title=\(localize "SW25\.V2\.AllSpells"\)/);
  assert.match(LIST, /\{\{#each spells as \|item id\|\}\}\s*\{\{> "systems\/sw25-ce\/templates\/actor\/parts\/actor-spell-item\.hbs" item=item isOwner=\.\.\/isOwner\}\}/);
  const school = read("templates/actor/parts/actor-spells-magitech.hbs");
  assert.match(school, /actor-spell-item\.hbs" item=item isOwner=\.\.\/isOwner/);
});

test("Show All Spells: old dice / burst buttons are gone; Cast goes through the shared cast flow", () => {
  for (const old of ["actor-useitems", "usedice", "usepower", "powerrollable", "data-roll-type", "flexrow"]) assert.ok(!LIST.includes(old), old);
  const row = read("templates/actor/parts/actor-spell-item.hbs");
  assert.match(row, /sw25-spell-cast sw25-sr-cast/);
  assert.match(SHEETJS, /"\.sw25-spell-cast"[\s\S]{0,300}castSpellFlow\(/);
});

test("Show All Spells: create button only when asked for (owner), school headers unchanged", () => {
  assert.match(LIST, /create=isOwner/);
  assert.match(HEADER, /\{\{#if create\}\}<a class='item-control item-create' data-type='spell'/);
  for (const f of fs.readdirSync(new URL("../templates/actor/parts/", import.meta.url)).filter((f) => /^actor-spells-.+\.hbs$/.test(f)))
    assert.ok(!read(`templates/actor/parts/${f}`).includes("create="), f);
});

test("Show All Spells: checkbox toggle is unchanged", () => {
  assert.match(SHEET, /name="system\.attributes\.showspell" data-dtype="Boolean" \{\{#if system\.attributes\.showspell\}\}checked\{\{\/if\}\}/);
  assert.match(SHEET, /\{\{#if system\.attributes\.showspell\}\}<div class="panel">\{\{> "systems\/sw25-ce\/templates\/actor\/parts\/actor-spells\.hbs"\}\}/);
});
