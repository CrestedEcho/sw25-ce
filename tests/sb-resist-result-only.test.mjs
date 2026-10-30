import { test } from "node:test";
import assert from "node:assert/strict";
import { skillCardHtml, resultLabel } from "../module/rules/sb-skill.mjs";
import { buildStatBlockContext } from "../module/rules/statblock-sheet-data.mjs";

// "Can't" resistance with no check named (e.g. Inspiring Flag Spear / Can't): resist empty, resistResult "decide".
const skill = { name: "Inspiring Flag Spear", tags: ["minor"], check: null, resist: null, resistResult: "decide", description: "" };

test("stat block shows the resistance result even when resist is empty", () => {
  const ctx = buildStatBlockContext({ type: "monster", view: { uniqueSkills: [skill], parts: [] }, raw: { uniqueSkills: [skill] }, isGM: true });
  const s = ctx.skills.find((x) => x.name === "Inspiring Flag Spear");
  assert.equal(s.resist, resultLabel("decide"));
  assert.ok(s.resist.length > 0);
  const none = buildStatBlockContext({ type: "monster", view: { uniqueSkills: [{ ...skill, resistResult: null }], parts: [] }, raw: {}, isGM: true });
  assert.equal(none.skills[0].resist, "");
});

test("skill chat card shows the result alone when resist is empty", () => {
  const html = skillCardHtml(skill);
  assert.match(html, /sw25-sk-resist">Resist: <b>Can(&#0?39;|&apos;|')t<\/b><\/div>/);
  assert.doesNotMatch(skillCardHtml({ ...skill, resistResult: null }), /sw25-sk-resist/);
  // with a resist the old "Check / Result" form is unchanged
  assert.match(skillCardHtml({ ...skill, resist: "Mndres", resistResult: "decide" }), / \/ /);
});
