import test from "node:test"; import assert from "node:assert/strict"; import { readFileSync } from "node:fs";
const hbs = readFileSync(new URL("../templates/actor/actor-statblock-sheet.hbs", import.meta.url), "utf8");
const css = readFileSync(new URL("../css/sw25-statblock.css", import.meta.url), "utf8");
test("stat-block portrait is clickable (data-edit=img) for NPCs and monsters alike", () => {
  const header = hbs.slice(0, hbs.indexOf("</header>"));
  const first = header.indexOf('data-edit="img"');
  assert.ok(first > 0);
  assert.ok(header.indexOf("{{#if isNPC}}") === -1 || header.indexOf("{{#if isNPC}}") > first, "portrait must not be behind an isNPC branch");
  assert.ok(!/<img[^>]*typeIcon[^>]*>/.test(header) || /sb-type-badge/.test(header), "type icon is a badge, not a portrait replacement");
});
test("overlays on the portrait do not swallow clicks", () => {
  for (const cls of ["sb-por-frame", "sb-type-badge"]) assert.match(css, new RegExp(`\\.${cls} \\{[^}]*pointer-events:none`));
});
