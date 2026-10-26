import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { targetChipsHtml, targetButtonInner, tokenTargetInfo, resolveTargetTokens, resolveTargetTokensOrWarn, NO_TOKENS_MSG } from "../module/helpers/target-chips.mjs";
const root = new URL("..", import.meta.url).pathname;
test("target chips: one chip per target, portrait when available, names escaped", () => {
  const h = targetChipsHtml([{ name: "Kobold", img: "k.png" }, { name: "<b>Gob</b>" }]);
  assert.equal((h.match(/class="target-chip"/g) || []).length, 2);
  assert.match(h, /<img class="target-portrait" src="k.png"/);
  assert.match(h, /&lt;b&gt;Gob/);
  assert.ok(!h.includes(">>>"));
});
test("target button: label + empty state", () => {
  assert.match(targetButtonInner(""), /Target:.*No target\. Select tokens on the map/);
  assert.equal(tokenTargetInfo({ document: { name: "K", texture: { src: "t.png" } } }).img, "t.png");
});
test("both roll templates show the live Applies-to line with tooltip (ce.16)", () => {
  for (const f of ["roll-power.hbs", "roll-check.hbs"]) {
    const t = fs.readFileSync(root + "templates/roll/" + f, "utf8");
    assert.match(t, /sw25-live-targets[^>]*data-tooltip=/); assert.match(t, /SW25.Card.LiveTargetTip/);
  }
});

test("resolveTargetTokens: selected first, then targets, then none", () => {
  const a = { id: "a" }, b = { id: "b" }, c = { id: "c" };
  const g = (t) => ({ user: { targets: new Set(t) } });
  const cv = (sel) => ({ tokens: { controlled: sel } });
  assert.deepEqual(resolveTargetTokens(g([c]), cv([a, b])), [a, b]);
  assert.deepEqual(resolveTargetTokens(g([c]), cv([])), [c]);
  assert.deepEqual(resolveTargetTokens(g([]), cv([])), []);
  assert.deepEqual(resolveTargetTokens(undefined, undefined), []);
});
test("resolveTargetTokensOrWarn notifies only when nothing selected or targeted", () => {
  const warns = []; globalThis.ui = { notifications: { warn: (m) => warns.push(m) } };
  resolveTargetTokensOrWarn({ user: { targets: new Set([{ id: "x" }]) } }, { tokens: { controlled: [] } });
  assert.equal(warns.length, 0);
  assert.deepEqual(resolveTargetTokensOrWarn({ user: { targets: new Set() } }, { tokens: { controlled: [] } }), []);
  assert.deepEqual(warns, [NO_TOKENS_MSG]); assert.equal(NO_TOKENS_MSG, "Select tokens on the map first");
  delete globalThis.ui;
});
test("no actor list dialog left anywhere", () => {
  for (const f of ["module/helpers/chatbutton.mjs", "module/sheets/actor-sheet.mjs", "module/helpers/dialogs.mjs", "module/sw25.mjs", "module/documents/item.mjs"])
    assert.doesNotMatch(fs.readFileSync(root + f, "utf8"), /targetSelectDialog/, f);
  assert.match(fs.readFileSync(root + "module/rules/apply-damage.mjs", "utf8"), /resolveTargetTokens\(\)/);
});
