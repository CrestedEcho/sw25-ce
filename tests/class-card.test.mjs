import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildClassCard, cellBreakdown, classIconFor, signed, CLASS_CARD_STATS } from "../module/rules/class-card.mjs";
const root = new URL("..", import.meta.url).pathname;
const read = (f) => fs.readFileSync(root + f, "utf8");
const en = JSON.parse(read("lang/en.json"));
const localize = (k) => { const v = k.split(".").reduce((o, p) => (o ? o[p] : undefined), en); return typeof v === "string" ? v : k; };
const tipText = (cell) => cell.parts.map((p) => `${p.op ? ` ${p.op} ` : ""}${p.label} ${p.abs}`).join("") + ` = ${cell.total}`;

const B = { dex: 3, agi: 2, str: 2, vit: 2, int: 2, mnd: 1 };
const skill = (id, name, lv, mod = null, eff = 0) => ({ _id: id, name, system: { skilllevel: lv, skillmod: mod, efallskmod: eff, efallscmod: 0, efallacmod: 0,
  skillbase: Object.fromEntries(Object.entries(B).map(([k, b]) => [k, lv + b + (Number(mod) || 0) + eff])) } });
const system = { attributes: { useexp: 2500, totalexp: 3000, advlevel: { value: 2, mod: "0" } },
  abilities: Object.fromEntries(Object.entries(B).map(([k, b]) => [k, { mod: b, advbase: 2 + b }])) };
const checks = [
  { _id: "c1", name: "Danger Sense", system: { checkskill: "adv", checkmethod: "check", formula: "2d6", checkbase: 5, applycheck: "-" } },
  { _id: "c2", name: "Power thing", system: { checkskill: "adv", checkmethod: "power", formula: "r10", checkbase: 0, applypower: "on" } },
  { _id: "c3", name: "Literature", system: { checkskill: "Sage", checkmethod: "check", formula: "2d6", checkbase: 3 } },
];
const card = () => buildClassCard({ system, skills: [skill("a", "Artificer", 2), skill("m", "Marksman", 1, 1), skill("s", "Sage", 1, -2, 1)], checks, localize });

test("class card: each die button's tooltip reads 'Class N + Stat bonus M = X' and adds up", () => {
  const c = card();
  const dex = c.rows[0].cells.find((x) => x.key === "dex");
  assert.equal(dex.value, 5);
  assert.equal(tipText(dex), "Artificer 2 + Dexterity bonus 3 = 5");
  assert.equal(dex.formula, "2d6 + 5");
  for (const row of c.rows) for (const cell of row.cells)
    assert.equal(cell.parts.reduce((s, p) => s + p.value, 0), cell.total, `${row.name}/${cell.key}`);
});

test("class card: a set Mod (and effects) shows in the breakdown, with signs; zero parts are hidden", () => {
  const c = card();
  assert.equal(tipText(c.rows[1].cells[0]), "Marksman 1 + Dexterity bonus 3 + Mod 1 = 5");
  assert.equal(tipText(c.rows[2].cells[5]), "Sage 1 + Spirit bonus 1 − Mod 2 + Effects 1 = 1");
  assert.equal(c.rows[0].cells[0].parts.length, 2);
});

test("class card: Mod is faint unless set (then green 'set'), shown signed", () => {
  const c = card();
  assert.deepEqual(c.rows.map((r) => [r.modSet, r.modText]), [[false, ""], [true, "+1"], [true, "-2"]]);
  assert.equal(c.adv.modSet, false);
  assert.equal(buildClassCard({ system: { ...system, attributes: { ...system.attributes, advlevel: { value: 2, mod: "1" } } } }).adv.modSet, true);
  assert.equal(signed(0), ""); assert.equal(signed(null), ""); assert.equal(signed("3"), "+3");
});

test("class card: Adventurer Level row uses advbase per stat and lists its own checks", () => {
  const c = card();
  assert.equal(c.adv.level, 2);
  assert.deepEqual(c.adv.cells.map((x) => x.value), [5, 4, 4, 4, 4, 3]);
  assert.equal(tipText(c.adv.cells[1]), "Adventurer Level 2 + Agility bonus 2 = 4");
  assert.deepEqual(c.adv.checks.map((x) => [x.name, x.power]), [["Danger Sense", false], ["Power thing", true]]);
  assert.deepEqual(c.rows[2].checks.map((x) => x.name), ["Literature"]);
  assert.deepEqual(c.rows[0].checks, []);
});

test("class card: headers carry full and short stat names; exp bar is clamped", () => {
  const c = card();
  assert.deepEqual(c.stats.map((s) => s.longLabel), ["Dexterity", "Agility", "Strength", "Vitality", "Intelligence", "Spirit"]);
  assert.equal(c.stats[5].abbrLabel, "spi");
  assert.deepEqual(c.exp, { used: 2500, total: 3000, over: false, pct: 83 });
  assert.equal(buildClassCard({ system: { attributes: { useexp: 4000, totalexp: 3000 } } }).exp.pct, 100);
  assert.equal(buildClassCard({ system: { attributes: { useexp: 4000, totalexp: 3000 } } }).exp.over, true);
  assert.equal(buildClassCard().rows.length, 0);
});

test("class card: class chips get a class icon (English or Japanese), unknown -> generic skill icon", () => {
  assert.equal(classIconFor("Artificer"), "magitech");
  assert.equal(classIconFor("Marksman"), "accuracy");
  assert.equal(classIconFor("Sage"), "truespeech");
  assert.equal(classIconFor("ファイター"), "fighter");
  assert.equal(classIconFor("Mystery"), "skill");
  for (const s of CLASS_CARD_STATS) assert.ok(fs.existsSync(root + `assets/icons/${s.icon}.svg`));
  for (const n of ["Fighter", "Priest", "Druid", "Scout", "Ranger", "Enhancer", "Bard", "Rider", "Alchemist", "Dark Hunter", "Conjurer", "Fairy Tamer"])
    assert.ok(fs.existsSync(root + `assets/icons/${classIconFor(n)}.svg`), n);
});

test("class card template keeps every roll and data binding of the old table", () => {
  const t = read("templates/actor/parts/actor-checkskills.hbs");
  // rolls: same formulas and labels as before
  assert.match(t, /class="cc-roll rollable" data-stat="\{\{cell\.key\}\}" data-roll="2d6\+@abilities\.\{\{cell\.key\}\}\.advbase" data-label="\{\{localize "SW25\.Attributes\.Advlevel"\}\}\+\{\{cell\.statLong\}\}\{\{localize "SW25\.Ability\.Bonus"\}\}" data-checktype="">/);
  assert.match(t, /class="cc-roll rollable" data-stat="\{\{cell\.key\}\}" data-roll="2d6\+\{\{cell\.value\}\}" data-label="\{\{row\.name\}\}\+\{\{cell\.statLong\}\}\{\{localize "SW25\.Ability\.Bonus"\}\}" data-checktype="">/);
  // inputs and controls the sheet listens to
  assert.match(t, /name="system\.attributes\.advlevel\.mod"/);
  assert.match(t, /name="system\.attributes\.totalexp"/);
  assert.match(t, /class="cc-mod sc-change[^"]*" type="text" name="skillModInput"/);
  assert.match(t, /<input class="sl-change" type="text" name="skilllevelInput" value="\{\{row\.level\}\}" data-dtype="Number"\/>/);
  assert.match(t, /class="changesl-button" data-action="decrease" data-property="item\.system\.skilllevel"/);
  assert.match(t, /class="changesl-button" data-action="increase" data-property="item\.system\.skilllevel"/);
  assert.match(t, /class="item-control item-edit"/);
  assert.match(t, /class="item-control item-delete"/);
  assert.match(t, /class="item-control item-create" data-type="skill"/);
  assert.match(t, /<li class="item cc-row cls sw25-class-row" data-item-id="\{\{row\.id\}\}">/);
  assert.match(t, /skill-open/);
  assert.match(t, /class="item-description"/);
  // check chips keep both roll kinds and their data
  assert.match(t, /small-checkitem powerrollable[^>]*data-item-id='\{\{chk\.id\}\}' data-roll="\{\{chk\.formula\}\}"[^>]*data-pt="\{\{chk\.powertable\}\}" data-apply="\{\{chk\.applypower\}\}" data-powertype="\{\{chk\.powerTypesButton\}\}"/);
  assert.match(t, /small-checkitem rollable[^>]*data-item-id='\{\{chk\.id\}\}' data-roll="\{\{chk\.formula\}\}\+\{\{chk\.checkbase\}\}"[^>]*data-apply="\{\{chk\.applycheck\}\}" data-checktype="\{\{chk\.checkTypesButton\}\}"/);
  // edit-only bits
  const edit = (s) => new RegExp(`\\{\\{#if (@root\\.)?system\\.isEdit\\}\\}[\\s\\S]{0,400}${s}`);
  for (const s of ["changesl-button", "item-delete", "item-create"]) assert.match(t, edit(s), s);
  // mockup pieces: d6 icon, tooltip, hint, star badge, chips with icon, level badge, stat icons with full + short names
  for (const s of ['class="d6"', 'class="cc-tip"', 'class="cc-hint"', 'class="star">★', 'class="cc-chip', 'class="cc-lv"', 'st st-full', 'st st-abbr', "assets/icons/{{st.icon}}.svg", "+ {{localize \"SW25.V2.ClassCard.AddClass\"}}"])
    assert.ok(t.includes(s), s);
  // no .items-list: its overflow would clip the tooltips
  assert.doesNotMatch(t, /items-list/);
});

test("class card: sheet builds context.classCard; CSS has hover glow, tooltip, narrow fallback and dark theme", () => {
  const src = read("module/sheets/actor-sheet.mjs");
  assert.match(src, /import \{ buildClassCard \} from "\.\.\/rules\/class-card\.mjs";/);
  assert.match(src, /context\.classCard = buildClassCard\(\{ system: context\.system, skills, checks, localize: \(k\) => game\.i18n\.localize\(k\) \}\)/);
  const css = read("css/sw25-sheet-v2.css");
  assert.match(css, /\.sw25v2 \.cc-roll:hover,\.sw25v2 \.cc-roll:focus-visible\{z-index:20;[^}]*box-shadow:[^}]*rgba\(214,150,60/);
  assert.match(css, /\.sw25v2 \.cc-roll:hover \.cc-tip\{display:block\}/);
  assert.match(css, /container:cc \/ inline-size/);
  assert.match(css, /@container cc \(max-width:640px\)\{\s*\.sw25v2 \.cc-head \.st-full\{display:none\}\.sw25v2 \.cc-head \.st-abbr\{display:inline/);
  assert.match(css, /\.sw25v2 \.cc input\.cc-mod\.set\{[^}]*color:#0f6f0f/);
  assert.match(css, /\.sw25v2\.theme-dark \.cc\{/);
  assert.match(css, /\.sw25v2\.theme-dark \.cc input\.cc-mod\.set\{/);
  for (const k of ["Bonus", "Mod", "Effects", "ClickRoll", "HintClick", "HintFormula", "HintHover", "LvTip", "ModTip", "AdvChecks", "OpenTip", "AddClass"])
    assert.equal(typeof en.SW25.V2.ClassCard[k], "string", k);
});

test("class card is only on the PC sheet (NPC/monster sheets don't include it)", () => {
  assert.match(read("templates/actor/actor-character-sheet.hbs"), /actor-checkskills\.hbs/);
  for (const f of fs.readdirSync(root + "templates/actor").filter((f) => f.endsWith(".hbs") && f !== "actor-character-sheet.hbs"))
    assert.doesNotMatch(read("templates/actor/" + f), /actor-checkskills/, f);
});
