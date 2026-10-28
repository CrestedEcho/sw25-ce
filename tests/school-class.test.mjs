import { test } from "node:test";
import assert from "node:assert/strict";
import { classSchools, schoolClass, schoolSkillName, SCHOOLS } from "../module/rules/school-class.mjs";
import { magicPowerText, schoolBlankLabel } from "../module/rules/magic-power.mjs";

// Class items as the compendium/import ships them: the school link is flags.sw25-ce.data.classSkills.
const cls = (name, level, schools, { slug, noData } = {}) => ({
  type: "skill", name, system: { skilllevel: level },
  flags: { "sw25-ce": { slug: slug ?? name.toLowerCase(), ...(noData ? {} : { data: { classSkills: schools.map((s) => ({ check: "spellcasting", limit: [s] })) } }) } },
});
const fighter = { type: "skill", name: "Fighter", system: { skilllevel: 3 }, flags: { "sw25-ce": { slug: "fighter", data: { classSkills: [] } } } };

// Every single-school code, keyed by the school word the class data carries (names here are arbitrary on purpose).
const WORDS = { sc: "truespeech", cn: "spiritualism", pr: "divine", mt: "magitech", fr: "fairy", dr: "nature", dm: "summoning", ab: "abyssal", bm: "arcane" };

test("classSchools: read from classSkills spellcasting limit, not the class name", () => {
  assert.deepEqual(classSchools(cls("Gadgeteer (renamed)", 2, ["magitech"])), ["mt"]);
  assert.deepEqual(classSchools(fighter), []);
  assert.deepEqual(classSchools({ type: "spell", name: "x" }), []);
  // hand-made class without import data: existing SCHOOL_NAMES config via slug, then name
  assert.deepEqual(classSchools(cls("My Artificer", 1, [], { slug: "artificer", noData: true })), ["mt"]);
  assert.deepEqual(classSchools({ type: "skill", name: "Priest", system: { skilllevel: 1 } }), ["pr"]);
});

test("all 10 schools: empty drop-down uses the actor's casting class; none -> ''", () => {
  for (const [code, word] of Object.entries(WORDS)) {
    const c = cls(`Class-${code}`, 2, [word]);
    assert.equal(schoolSkillName({}, [fighter, c], code), `Class-${code}`, code);
    assert.equal(schoolSkillName({ [`${code}skill`]: "" }, [fighter, c], code), `Class-${code}`, code);
    assert.equal(schoolSkillName({}, [fighter], code), "", code);
  }
  const so = cls("Sorcerer", 4, ["truespeech"]), co = cls("Conjurer", 2, ["spiritualism"]);
  assert.equal(schoolSkillName({}, [so, co], "wz"), "Conjurer", "wizardry uses the lower of the two");
  assert.equal(schoolSkillName({}, [so], "wz"), "", "wizardry needs both");
  assert.equal(SCHOOLS.length, 10);
  for (const s of SCHOOLS) assert.ok(s === "wz" || WORDS[s], s);
});

test("Echo's case: Artificer 2, Magitech drop-down empty", () => {
  const items = [cls("Artificer", 2, ["magitech"]), cls("Marksman", 1, []), cls("Sage", 1, [])];
  assert.equal(schoolSkillName({ mtskill: "" }, items, "mt"), "Artificer");
  assert.equal(schoolClass(items, "pr"), null);
});

test("explicit drop-down choice wins; a stale choice falls back to the auto class", () => {
  const a = cls("Artificer", 2, ["magitech"]), b = cls("Artificer II", 5, ["magitech"]);
  assert.equal(schoolSkillName({ mtskill: "Artificer" }, [a, b], "mt"), "Artificer");
  assert.equal(schoolSkillName({}, [a, b], "mt"), "Artificer II", "highest level when automatic");
  assert.equal(schoolSkillName({ mtskill: "Fighter" }, [a, fighter], "mt"), "Fighter", "explicit wins even for an odd pick");
  assert.equal(schoolSkillName({ mtskill: "Deleted Class" }, [a], "mt"), "Artificer");
});

test("magicPowerText / drop-down label follow the class actually used", () => {
  const sys = { mtskill: "", mtskillUsed: "Artificer", mtbase: 4, attributes: { mtpower: 4 } };
  assert.equal(magicPowerText(sys, "mt"), "4");
  assert.equal(schoolBlankLabel(sys, "mt"), "Auto (Artificer)");
  assert.equal(schoolBlankLabel({ mtskill: "Artificer", mtskillUsed: "Artificer" }, "mt"), "-");
  assert.equal(magicPowerText({ mtskill: "", mtskillUsed: "", attributes: { mtpower: 0 } }, "mt"), "—");
  assert.equal(schoolBlankLabel({ mtskillUsed: "" }, "mt"), "-");
});
