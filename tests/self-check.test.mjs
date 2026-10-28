import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isSelfCheck, isSelfCheckRoll, isSelfCheckItem, selfCheckNames, stripTargetUI } from "../module/rules/self-check.mjs";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("Willpower, Fortitude and Evasion labels are self checks", () => {
  for (const l of ["Evasion", "Fortitude", "Willpower", "Fortitude (Check)", "Evasion (Fencer Check)/14",
    "Goblin (Evasion)", "Bob: Willpower", "Straight Roll\n        - Fortitude (Check)/12", "生命抵抗力", "精神抵抗力 (判定)", "回避力", "Evasion Check"]) {
    assert.equal(isSelfCheck(l), true, l);
  }
});

test("other rolls (and Defense) are not self checks", () => {
  for (const l of ["", null, "Accuracy", "Defense", "Evasion Ring", "Fortitude Boost (Check)", "Sword (Power)", "Fencer (Check)", "Monster Knowledge", "Weapon (Accuracy)"]) {
    assert.equal(isSelfCheck(l), false, String(l));
  }
});

test("localized names from the running game are included", () => {
  const names = selfCheckNames({ localize: (k) => ({ "SW25.Config.ResVit": "Vitalität" }[k] ?? k) });
  assert.equal(isSelfCheck("Vitalität", names), true);
});

test("data-selfcheck, item names and sub-labels", () => {
  assert.equal(isSelfCheckRoll({ dataset: { selfcheck: "" } }), true);
  assert.equal(isSelfCheckRoll({ dataset: { label: "Willpower" } }), true);
  assert.equal(isSelfCheckRoll({ dataset: { label: "Accuracy" } }), false);
  assert.equal(isSelfCheckItem({ name: "Fortitude", system: {} }, ""), true);
  assert.equal(isSelfCheckItem({ name: "Goblin", system: { label3: "Evasion", label1: "Accuracy" } }, "3"), true);
  assert.equal(isSelfCheckItem({ name: "Goblin", system: { label3: "Evasion", label1: "Accuracy" } }, "1"), false);
  assert.equal(isSelfCheckItem({ name: "Fortitude", system: {} }, "power"), false);
});

test("stripTargetUI removes live line, Target: button and chips", () => {
  const removed = [];
  const root = { querySelectorAll: (sel) => { assert.match(sel, /sw25-live-targets/); assert.match(sel, /chat-target/); return [{ remove: () => removed.push(1) }]; } };
  stripTargetUI(root);
  assert.equal(removed.length, 1);
});

test("every check path skips the target picker and target line for self checks", () => {
  const sheet = src("module/sheets/actor-sheet.mjs");
  assert.match(sheet, /if \(isSelfCheckRoll\(\{ dataset \}\)\) return void \(await this\._onRollExec\(event\)\);\n    const targetTokens/);
  assert.match(sheet, /if \(selfCheck\) targetTokens = undefined;/);
  const item = src("module/documents/item.mjs");
  assert.match(item, /if \(isSelfCheckItem\(this, which\)\) return void \(await this\.rollExec\(\)\);\n      const targetTokens/);
  assert.match(item, /if \(selfCheck\) targetTokens = undefined;/);
  const cb = src("module/helpers/chatbutton.mjs");
  assert.match(cb, /if \(isSelfCheckItem\(item, which\)\) return void \(await chatRoll\(\)\);\n    const targetTokens/);
  assert.match(cb, /if \(selfCheck\) targetTokens = undefined;/);
  assert.match(cb, /selfCheck: true/);
  assert.match(src("templates/roll/roll-check.hbs"), /\{\{#unless selfCheck\}\}(\{\{#if [^}]*\}\})?<div class="sw25-live-targets"/);
  assert.match(src("module/helpers/target-chips.mjs"), /isSelfCheck\(msg\?\.flavor\)\) \{ stripTargetUI\(root\); return; \}/);
});

test("sheet tiles: Evasion, Fortitude, Willpower marked; Defense untouched", () => {
  const pc = src("templates/actor/actor-character-sheet.hbs");
  assert.match(pc, /rollable" data-selfcheck data-roll="2d6\+\{\{system\.dodgebase\}\}"/);
  assert.equal((pc.match(/<span class="rollable" data-selfcheck data-roll="\{\{item\.system\.formula\}\}/g) ?? []).length, 2);
  assert.equal((pc.match(/data-selfcheck/g) ?? []).length, 3);
  const mon = src("templates/actor/actor-monster-sheet.hbs");
  assert.equal((mon.match(/data-selfcheck/g) ?? []).length, 3);
});
