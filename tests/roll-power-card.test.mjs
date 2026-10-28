import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const root = new URL("..", import.meta.url).pathname;
const tpl = fs.readFileSync(root + "templates/roll/roll-power.hbs", "utf8");
const en = JSON.parse(fs.readFileSync(root + "lang/en.json", "utf8"));
const get = (k) => k.split(".").reduce((o, p) => o?.[p], en);
let Handlebars = null;
try { Handlebars = createRequire(import.meta.url)("handlebars"); } catch {}

test("power card: no k@ formula line, every localize key exists in en.json", () => {
  assert.ok(!tpl.includes('class="dice-formula"'), "formula line removed");
  const keys = [...tpl.matchAll(/localize "([^"]+)"/g)].map((m) => m[1]);
  for (const k of keys) assert.equal(typeof get(k), "string", `missing ${k}`);
  for (const t of ["pd", "md", "cd", "hr", "mr"]) { assert.equal(typeof get(`SW25.Card.${t}`), "string"); assert.equal(typeof get(`SW25.Card.${t}Tip`), "string"); }
  assert.deepEqual(["pd", "md", "cd", "hr", "mr"].map((t) => get(`SW25.Card.${t}`)), ["Physical", "Magic", "Fixed", "Heal HP", "Restore MP"]);
});
test("power card: every button has a tooltip", () => {
  for (const m of tpl.matchAll(/<button[^>]*>/g)) assert.match(m[0], /data-tooltip=/, m[0]);
});
test("power card renders labelled rows and spelled-out buttons", { skip: !Handlebars && "handlebars not installed" }, () => {
  const H = Handlebars.create();
  H.registerHelper("localize", (k, o) => { let s = get(k) ?? k; for (const [a, b] of Object.entries(o?.hash ?? {})) s = s.replaceAll(`{${a}}`, b); return s; });
  H.registerHelper("concat", (...a) => a.slice(0, -1).join(""));
  H.registerHelper("eq", (a, b) => a === b); H.registerHelper("or", (...a) => a.slice(0, -1).some(Boolean));
  H.registerHelper("sw25dmgf", () => "17 / 10 / +4");
  const html = H.compile(tpl)({ formula: "k17@10+4", tooltip: "<div class='dice-tooltip'>6 3</div>", power: 17, result: [6], results: 6, mod: 4, total: 10, showhalf: true, apply: "on" });
  assert.ok(!html.includes("k17@10"));
  for (const s of ["Dice", "Table result", "Bonus", "Crits", "Power 17", "Physical", "Magic", "Fixed", "Heal HP", "Restore MP", "Half"]) assert.ok(html.includes(s), s);
  assert.ok(!/>\s*(PD|MD|FD|HPR|MPR)\s*</.test(html));
});
