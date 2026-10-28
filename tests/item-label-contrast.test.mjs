import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Item sheets get form.sw25v2-lite, whose `div/label {color:inherit}` turned the black label boxes' white text into dark ink.
const css = readFileSync(new URL("../css/sw25-sheet-v2.css", import.meta.url), "utf8");
const rule = (sel) => { const i = css.indexOf(sel + "{"); assert.ok(i >= 0, `missing rule ${sel}`); return css.slice(i, css.indexOf("}", i)); };

test("overview label boxes: tan + dark ink (parchment), dark + parchment text (dark theme)", () => {
  assert.match(rule("form.sw25v2-lite .overview--label"), /background:#d9c39a!important;color:#2b1c10!important/);
  assert.match(rule("form.sw25v2-lite.theme-dark .overview--label"), /background:rgba\(0,0,0,\.5\)!important;color:#eadcc0!important/);
});

test("power-table labels and fairy element badges keep readable colours on themed item sheets", () => {
  assert.match(rule("form.sw25v2-lite .pt-label"), /color:#2b1c10!important/);
  assert.match(rule("form.sw25v2-lite.theme-dark .pt-label"), /color:#eadcc0!important/);
  for (const el of ["earth", "ice", "fire", "wind", "light", "dark"]) assert.match(css, new RegExp(`form\\.sw25v2-lite \\.fairy${el}\\{color:rgb\\(var\\(--fairy-${el}-color\\)\\)!important\\}`));
});
