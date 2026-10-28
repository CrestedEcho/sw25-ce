import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { cardUsesTargets, appliesToTargets, targetChipsHtml } from "../module/helpers/target-chips.mjs";
const root = new URL("..", import.meta.url).pathname;
const read = (f) => fs.readFileSync(root + f, "utf8");

test("class x stat checks: card speaker is the sheet's actor, never a target", () => {
  const src = read("module/sheets/actor-sheet.mjs");
  const exec = src.slice(src.indexOf("async _sw25OnRollExec("), src.indexOf("async _onPowerRoll("));
  assert.match(exec, /speaker: ChatMessage\.getSpeaker\(\{ actor: this\.actor \}\)/);
  assert.doesNotMatch(exec, /getSpeaker\(\s*\)/);
  assert.doesNotMatch(exec, /getSpeaker\(\{[^}]*(token|actor):\s*(target|targetToken|t)\b/);
});

test("no check-roll path takes its speaker from a target token", () => {
  for (const f of ["module/sheets/actor-sheet.mjs", "module/documents/item.mjs", "module/helpers/chatbutton.mjs", "module/helpers/actionroll.mjs", "module/rules/attack-flow.mjs", "module/rules/spell-flow.mjs"]) {
    const src = read(f);
    assert.doesNotMatch(src, /getSpeaker\(\{\s*(token|actor):\s*(targetToken|targetTokens|targets?)\b/, f);
    assert.doesNotMatch(src, /speaker:\s*ChatMessage\.getSpeaker\(\)/, f);
  }
});

test("class table / Adventurer Level / skill checks have no apply, so their cards list no targets", () => {
  const t = read("templates/actor/parts/actor-checkskills.hbs");
  const stat = t.split("\n").filter((l) => /rollable/.test(l) && /Ability\.\w+\.long/.test(l));
  assert.ok(stat.length >= 12, "class x stat and Adventurer Level x stat cells");
  for (const l of stat) assert.doesNotMatch(l, /data-apply="(on|custom)"/);
  // flags as stored for such a card (undefined apply is dropped by JSON)
  assert.equal(cardUsesTargets({ checktype: "", total: 9 }), false);
  assert.equal(cardUsesTargets({ checktype: "", apply: "-" }), false);
});

test("cardUsesTargets: applying checks, resist checks and non-check cards keep the Applies-to line", () => {
  assert.equal(cardUsesTargets({ checktype: ["pd"], apply: "on" }), true);
  assert.equal(cardUsesTargets({ checktype: ["pd"], apply: "custom" }), true);
  assert.equal(cardUsesTargets({ checktype: "", resist: { name: "Evasion" } }), true);
  assert.equal(cardUsesTargets({ checktype: "", apply: "on", selfCheck: true }), false);
  assert.equal(cardUsesTargets({ powertype: "" }), true);
  assert.equal(cardUsesTargets(undefined), true);
  assert.equal(appliesToTargets("-"), false);
  assert.equal(appliesToTargets(undefined), false);
});

test("roll-check.hbs only renders the live line when something applies to targets", () => {
  const t = read("templates/roll/roll-check.hbs");
  assert.match(t, /\{\{#unless selfCheck\}\}\{\{#if \(or \(or \(eq apply "on"\) \(eq apply "custom"\)\) resist\)\}\}<div class="sw25-live-targets"/);
});

test("live-line target chips are sized: token art is a small round icon, not a full portrait", () => {
  const css = read("css/sw25.css");
  const rule = css.match(/\.sw25-live-targets \.target-portrait\{([^}]*)\}/);
  assert.ok(rule, "live-line portrait rule");
  assert.match(rule[1], /width:18px/); assert.match(rule[1], /max-height:18px/); assert.match(rule[1], /border-radius:50%/);
  assert.match(targetChipsHtml([{ name: "Human Warrior", img: "w.webp" }]), /class="target-portrait"/);
});
