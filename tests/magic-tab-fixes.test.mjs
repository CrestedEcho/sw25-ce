import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resistKey, resistLabel } from "../module/rules/resist-label.mjs";
import { magicPowerText, SCHOOLS } from "../module/rules/magic-power.mjs";
import * as C from "../module/rules/spell-card.mjs";

const EN = JSON.parse(fs.readFileSync(new URL("../lang/en.json", import.meta.url)));
const flat = (o, p = "", out = {}) => { for (const [k, v] of Object.entries(o)) (v && typeof v === "object") ? flat(v, `${p}${k}.`, out) : (out[`${p}${k}`] = v); return out; };
const KEYS = flat(EN);
const loc = (k) => KEYS[k] ?? k;

test("resistKey: stored keys and printed English words map to existing lang keys", () => {
  for (const [v, k] of [["decide", "Decide"], ["Can't", "Decide"], ["Can’t", "Decide"], ["Optional", "Any"], ["N/A", "None"],
    ["Negates", "Disappear"], ["Half", "Halving"], ["Temporary", "Shortening"], ["any", "Any"]]) {
    assert.equal(resistKey(v), `SW25.Item.${k}`, v);
    assert.ok(KEYS[`SW25.Item.${k}`], `lang key SW25.Item.${k} exists`);
  }
  assert.equal(resistKey("Something odd"), null);
});

test("resistLabel: localized, compound check/result, unknown kept, empty blank", () => {
  assert.equal(resistLabel("Can't", loc), KEYS["SW25.Item.Decide"]);
  assert.equal(resistLabel("Optional", loc), KEYS["SW25.Item.Any"]);
  assert.equal(resistLabel("N/A", loc), KEYS["SW25.Item.None"]);
  assert.equal(resistLabel("Fortitude / Half", loc), `${KEYS["SW25.Resist.Check.Vitres"]}/${KEYS["SW25.Item.Halving"]}`);
  assert.equal(resistLabel("Special rule", loc), "Special rule");
  for (const e of ["", null, undefined, "-", "—"]) assert.equal(resistLabel(e, loc), "");
  for (const v of ["Can't", "Can’t", "Optional", "N/A", "Negates", "Half", "Temporary", "Fortitude/Negates"]) assert.doesNotMatch(resistLabel(v, loc), /SW25\./, v);
});

test("magicPowerText: '—' without a linked class, number with one; never NaN", () => {
  for (const s of SCHOOLS) {
    assert.equal(magicPowerText({ attributes: { [`${s}power`]: NaN } }, s), "—");
    assert.equal(magicPowerText({ [`${s}skill`]: "Magitech", attributes: { [`${s}power`]: NaN } }, s), "—");
    assert.equal(magicPowerText({ [`${s}skill`]: "Priest", [`${s}base`]: 4, attributes: { [`${s}power`]: 7 } }, s), "7");
    assert.equal(magicPowerText({ [`${s}skill`]: "Priest", [`${s}base`]: 4, attributes: { [`${s}power`]: NaN } }, s), "0");
  }
});

const imported = (sys = {}, data = {}) => ({ id: "x", name: "Shotgun Bullet", system: { mpcost: 2, target: "1 bullet", time: "10 seconds (1 round)", resist: "N/A", typename: "Magitech", level: 5, ...sys }, flags: { "sw25-ce": { data: { rangeArea: "Caster", ...data } } } });

test("spellInfo: imported range comes from flags rangeArea; real range fields still win", () => {
  assert.equal(C.rowData(imported()).range, "Caster");
  assert.equal(C.rowData(imported({ range: "Touch" })).range, "Touch");
  assert.equal(C.rowData(imported({ rangeshape: "-" })).range, "Caster");
  assert.equal(C.rowData(imported({}, { rangeArea: "" })).range, "—");
});

test("rowData subline: printed resist words never leak SW25.* keys", () => {
  for (const r of ["N/A", "Can't", "Optional", "Negates", "Fortitude/Half"]) assert.doesNotMatch(C.rowData(imported({ resist: r })).sub, /SW25\./, r);
  assert.match(C.rowData(imported({ resist: "Optional" })).sub, /resist: Optional/);
});

test("spell list header and rows share one grid with the same 7 cells", () => {
  const cells = (f) => { const h = fs.readFileSync(new URL(`../templates/actor/parts/${f}`, import.meta.url), "utf8");
    const i = h.indexOf('class="sw25-spellrow'); assert.ok(i >= 0, f);
    return (h.slice(i).match(/class="sw25-sr-(icon|name|cell|actions)/g) ?? []).map((c) => c.replace('class="', "")); };
  const head = cells("actor-spell-header.hbs"); const row = cells("actor-spell-item.hbs");
  assert.deepEqual(head.slice(0, 7), ["sw25-sr-icon", "sw25-sr-name", "sw25-sr-cell", "sw25-sr-cell", "sw25-sr-cell", "sw25-sr-cell", "sw25-sr-actions"]);
  assert.deepEqual(row.slice(0, 7), head.slice(0, 7));
});

test("character sheet: Magic Power uses the NaN-safe helper for every school", () => {
  const h = fs.readFileSync(new URL("../templates/actor/actor-character-sheet.hbs", import.meta.url), "utf8");
  assert.doesNotMatch(h, /\{\{system\.attributes\.[a-z]{2}power\}\}/);
  for (const s of SCHOOLS) assert.match(h, new RegExp(`sw25MagicPower system "${s}"`), s);
});
