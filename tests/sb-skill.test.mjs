import { test } from "node:test";
import assert from "node:assert/strict";
import { skillEditorData, skillFromForm, skillCardHtml, normResist, normResult, tagInfo, TAG_ORDER } from "../module/rules/sb-skill.mjs";
import { SKILL_TAGS, buildStatBlockContext } from "../module/rules/statblock-sheet-data.mjs";
import { prepareStatBlock } from "../module/rules/statblock.mjs";

test("tag labels/tooltips: passive key shown as Constant", () => {
  assert.equal(SKILL_TAGS.passive.label, "Constant"); assert.equal(SKILL_TAGS.passive.tip, "Constant (always active)");
  assert.equal(SKILL_TAGS.prep.tip, "Preparation (before combat)"); assert.equal(SKILL_TAGS.declared.tip, "Declaration (declared as part of the attack or action it modifies)");
  assert.deepEqual(TAG_ORDER, ["passive", "major", "minor", "prep", "declared"]);
  assert.deepEqual(tagInfo(["declared", "bogus", "passive", "passive"]).map((t) => t.key), ["passive", "declared"]);
});

test("editor data: parts optional, toggles, check fixed = value + 7, resist options incl. legacy text", () => {
  const d = skillEditorData({ name: "Breath", tags: ["major", "declared"], part: "Head", check: { value: 9 }, resist: "Vitality Resistance", resistResult: "Half" }, [{ name: "Body" }, { name: "Head" }]);
  assert.equal(d.parts[0].value, ""); assert.equal(d.parts.find((p) => p.selected).value, "Head");
  assert.deepEqual(d.tags.filter((t) => t.on).map((t) => t.key), ["major", "declared"]);
  assert.equal(d.checkFixed, 16);
  assert.equal(d.resists.find((o) => o.selected).value, "Vitres"); assert.equal(d.results.find((o) => o.selected).value, "halving");
  const e = skillEditorData({ resist: "Special" }, []); assert.equal(e.resists.find((o) => o.selected).label, "Special");
  assert.equal(skillEditorData(undefined, []).checkFixed, "");
});

test("form -> skill: multi tags, optional fields, keeps magic fields", () => {
  const s = skillFromForm({ name: " Tail Sweep ", "tag.major": "on", "tag.prep": "on", part: "", checkValue: "11", resist: "Dodge", resistResult: "disappear", description: "<p>Hits all</p>" }, { magic: { school: "x" }, tags: ["passive"] });
  assert.deepEqual(s, { magic: { school: "x" }, name: "Tail Sweep", tags: ["major", "prep"], part: null, check: { value: 11, fixed: 18 }, resist: "Dodge", resistResult: "disappear", description: "<p>Hits all</p>" });
  const b = skillFromForm({ name: "", checkValue: "" }); assert.equal(b.name, "Unnamed skill"); assert.equal(b.check, null); assert.deepEqual(b.tags, []);
  assert.equal(normResist("Mental"), "Mndres"); assert.equal(normResult("Negates"), "disappear");
});

test("chat card: icons with tooltips, part, check buttons, resist, description, escaping", () => {
  const h = skillCardHtml({ name: "Breath <b>", tags: ["major"], part: "Head", check: { value: 9, fixed: 16 }, resist: "Vitres", resistResult: "halving" }, { actorName: "Wyvern", description: "<p>Fire</p>", gmOnly: true });
  assert.match(h, /tag-major\.webp/); assert.match(h, /title="Major action"/); assert.match(h, /Breath &lt;b&gt;/);
  assert.match(h, /sw25-sk-part">Head/); assert.match(h, /data-sw25-skchk="dice" data-fixed="16"/); assert.match(h, /2d6\+9/);
  assert.match(h, /Fortitude<\/b> \/ Half/); assert.match(h, /<p>Fire<\/p>/); assert.match(h, /GM only/);
  assert.doesNotMatch(skillCardHtml({ name: "Aura", tags: ["passive"] }), /data-sw25-skchk/);
});

test("sheet rows: tooltips, readable resist, gm-only key (default GM only)", () => {
  const raw = { parts: [{ name: "Body", hp: 10 }], uniqueSkills: [{ name: "Fire Breath", tags: ["passive"], part: "Body", check: { value: 9 }, resist: "Vitres", resistResult: "halving" }] };
  const ctx = buildStatBlockContext({ type: "monster", view: prepareStatBlock(raw, {}, "monster"), raw, skillGmMap: {} });
  const s = ctx.skills[0];
  assert.equal(s.tags[0].tip, "Constant (always active)"); assert.equal(s.resist, "Fortitude / Half"); assert.equal(s.check, "9(16)");
  assert.equal(s.key, "fire-breath"); assert.equal(s.gmOnly, true); assert.equal(s.part, "Body");
  assert.equal(buildStatBlockContext({ type: "monster", view: prepareStatBlock(raw, {}, "monster"), raw, skillGmMap: { "fire-breath": false } }).skills[0].gmOnly, false);
});
