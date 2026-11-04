// ce.23 sheet layout (Echo-approved mockup): template structure + wiring.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const rd = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const sheet = rd("templates/actor/actor-character-sheet.hbs");
const tab = (name) => { const i = sheet.indexOf(`data-tab="${name}"`, sheet.indexOf("sheet-body")); assert.ok(i > 0, name); const j = sheet.indexOf('<div class="tab ', i + 10); return sheet.slice(i, j > 0 ? j : undefined); };

test("combat tab: weapons, belt, then feats; no combat-check panel; no wallet", () => {
  const c = tab("combat");
  const w = c.indexOf("ce7-weapons"), b = c.indexOf("ce7-belt"), f = c.indexOf("ce7-feats");
  assert.ok(w >= 0 && b > w && f > b, `order w${w} b${b} f${f}`);
  assert.ok(!c.includes("CombatChecks") && !c.includes("battlechecks"));
  assert.ok(!c.includes("ce7-wallet"));
});
test("inventory starts with the wallet instead of the old money line", () => {
  const inv = tab("inventory");
  assert.ok(inv.includes("ce7-wallet"));
  assert.ok(!/class="money"/.test(inv));
});
test("classes tab: skill checks replace Checks + Race Abilities panels", () => {
  const cl = tab("classes");
  assert.ok(cl.includes("actor-skillchecks"));
  assert.ok(!cl.includes("RaceAbilities"));
  assert.ok(!cl.includes("actor-checks.hbs"), "check items are inside the skill-check partial's Custom list");
  const p = rd("templates/actor/parts/actor-skillchecks.hbs");
  assert.ok(p.includes("skc-class") && p.includes("skc-roll") && p.includes("skc-mod") && p.includes("actor-checks.hbs"));
  assert.ok(!/\bname="/.test(p.replace(/actor-checks\.hbs[^}]*}}/, "")), "selects/inputs save via flags, not form names");
});
test("bio tab has the race card; initiative button sits next to Fellow", () => {
  assert.ok(tab("bio").includes("actor-race-bio"));
  const fel = sheet.indexOf("toFellow"), init = sheet.indexOf("sw-init");
  assert.ok(init > 0 && fel > 0 && init > fel && init - fel < 1500);
});
test("new code never hardcodes class names and never auto-rolls", () => {
  const files = ["module/rules/skill-checks.mjs", "module/sheets/skill-check-ui.mjs", "module/data/skill-check-catalog.mjs", "templates/actor/parts/actor-skillchecks.hbs", "templates/roll/skill-check-head.hbs"];
  const classes = /\b(Fighter|Grappler|Fencer|Shooter|Sorcerer|Conjurer|Priest|Fairy ?Tamer|Magitech|Scout|Ranger|Sage|Enhancer|Bard|Rider|Alchemist|Geomancer|Warleader|Dark Hunter|Druid|Demonruler|Abyss ?Gazer)\b/i;
  for (const f of files) assert.ok(!classes.test(rd(f)), f);
  const ui = rd("module/sheets/skill-check-ui.mjs");
  assert.match(ui, /on\("click", "\.skc-roll"/);
  assert.match(ui, /on\("click", "\.sw-init"/);
  const sh = rd("module/sheets/actor-sheet.mjs");
  assert.ok(sh.indexOf("bindSkillCheckListeners(this, html)") > sh.indexOf("if (!this.isEditable) return;"));
});
test("chat card keeps its class header after ± and names the class", () => {
  assert.match(rd("module/helpers/chatbutton.mjs"), /flags\.sw25\.skcHead \?\? ""\) \+ await/);
  const h = rd("templates/roll/skill-check-head.hbs");
  assert.ok(h.includes("className") && h.includes("RolledAs") && h.includes("NotGranted") && h.includes("parts"));
});
test("initiative rule mods reach the combat tracker formula", () => {
  assert.match(rd("module/documents/actor.mjs"), /checks \?\? \[\]\)\.includes\("initiative"\)\) systemData\.initiativeFormula \+=/);
});
