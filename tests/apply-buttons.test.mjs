import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

globalThis.foundry ??= { utils: { escapeHTML: (s) => String(s) } };
globalThis.game ??= { i18n: { has: () => false } };
const { renderAttackCard } = await import("../module/rules/combat-ui.mjs");
const { LEGACY_KIND } = await import("../module/rules/apply-damage.mjs");

/** Tiny fake element: the Apply button only exists after insertAdjacentHTML (like the real DOM). */
function fakeEl() {
  const btn = { handlers: {}, addEventListener(t, f) { this.handlers[t] = f; } };
  let inserted = false;
  const el = { querySelector: (sel) => (sel === ".sw-attack-apply" ? (inserted ? btn : null) : sel === ".sw-attack-extras" && inserted ? {} : null),
    querySelectorAll: () => [], insertAdjacentHTML: () => { inserted = true; } };
  return { el, btn };
}

test("Apply damage button gets its click handler (bound after the box is inserted)", () => {
  const { el, btn } = fakeEl();
  const calls = [];
  const msg = { getFlag: () => ({ applyDamage: 7, lines: [], buttons: [], links: [] }) };
  renderAttackCard(msg, el, (n, kind) => calls.push([n, kind]));
  assert.equal(typeof btn.handlers.click, "function", "no click handler -> button did nothing");
  btn.handlers.click({ preventDefault() {} });
  assert.deepEqual(calls, [[7, "physical"]]);
});

test("legacy card buttons map to the shared apply kinds; Heal HP is healing, not damage", () => {
  assert.deepEqual(LEGACY_KIND, { buttonpd: "physical", buttonmd: "magic", buttoncd: "fixed", buttonhr: "heal" });
  const en = JSON.parse(fs.readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
  assert.equal(en.SW25.Card.hr, "Heal HP"); assert.equal(en.SW25.Card.mr, "Restore MP");
  assert.doesNotMatch(JSON.stringify(en), /Hits [HM]P/);
});
