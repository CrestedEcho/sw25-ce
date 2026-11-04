// ce.24: blank race values / A–F scores were added as text in class skill bases ("" + 9 + 0 -> "90").
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { abNum } from "../module/rules/ability-num.mjs";

test("abNum turns blank, null, undefined and junk into 0 and keeps numbers", () => {
  for (const v of ["", null, undefined, "abc", NaN, Infinity]) assert.equal(abNum(v), 0);
  assert.equal(abNum(9), 9);
  assert.equal(abNum("12"), 12);
  assert.equal(abNum(-2), -2);
});

test("fresh-character ability sum stays numeric (template.json defaults + rolled A–F)", () => {
  const tpl = JSON.parse(fs.readFileSync(new URL("../template.json", import.meta.url)));
  const ab = structuredClone(tpl.Actor.templates?.base?.abilities ?? tpl.Actor.character?.abilities ??
    Object.values(tpl.Actor.templates ?? {}).find((t) => t.abilities)?.abilities);
  assert.ok(ab?.dex, "template.json has character abilities");
  assert.equal(ab.dex.racevalue, "", "new characters start with a blank race value");
  ab.dex.valuebase = 9; // A rolled through the race dice button (actor.update), Technique still blank
  const parts = ["racevalue", "valuebase", "valuegrowth", "valuemodify", "efvaluemodify"];
  const fixed = parts.reduce((s, k) => s + abNum(ab.dex[k]), 0);
  assert.equal(Math.floor(fixed / 6), 1);
  assert.equal(ab.dex.racevalue + 9 + 0 + 0 + 0, "9000", "the old raw sum joined text: base 1500 instead of 1");
});

test("item.mjs and actor.mjs never add raw ability parts", () => {
  for (const f of ["module/documents/item.mjs", "module/documents/actor.mjs"]) {
    const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      if (/\.racevalue = /.test(line)) return; // agi/vit/mnd share Technique/Body/Mind (copy, not arithmetic)
      if (/key: "system\.abilities/.test(line)) return; // effect key table
      const re = /(\w+Data|systemData)\.abilities\??\.\w+\??\.(racevalue|valuebase|valuegrowth|valuemodify|efvaluemodify)\b/g;
      for (const m of line.matchAll(re)) {
        const before = line.slice(0, m.index);
        assert.ok(/(abNum|Number)\($/.test(before), `${f}:${i + 1} adds ${m[0]} without abNum(): ${line.trim()}`);
      }
    });
    assert.match(src, /import \{ abNum \} from "\.\.\/rules\/ability-num\.mjs";/);
  }
});
