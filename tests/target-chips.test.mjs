import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { targetChipsHtml, targetButtonInner, tokenTargetInfo } from "../module/helpers/target-chips.mjs";
const root = new URL("..", import.meta.url).pathname;
test("target chips: one chip per target, portrait when available, names escaped", () => {
  const h = targetChipsHtml([{ name: "Kobold", img: "k.png" }, { name: "<b>Gob</b>" }]);
  assert.equal((h.match(/class="target-chip"/g) || []).length, 2);
  assert.match(h, /<img class="target-portrait" src="k.png"/);
  assert.match(h, /&lt;b&gt;Gob/);
  assert.ok(!h.includes(">>>"));
});
test("target button: label + empty state", () => {
  assert.match(targetButtonInner(""), /Target:.*No target, click to pick/);
  assert.equal(tokenTargetInfo({ document: { name: "K", texture: { src: "t.png" } } }).img, "t.png");
});
test("both roll templates use the labelled target button with tooltip", () => {
  for (const f of ["roll-power.hbs", "roll-check.hbs"]) {
    const t = fs.readFileSync(root + "templates/roll/" + f, "utf8");
    assert.match(t, /chat-target[^>]*data-tooltip=/); assert.match(t, /SW25.Card.TargetLabel/); assert.match(t, /SW25.Card.NoTarget/);
  }
});
