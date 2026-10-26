import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import path from "node:path"; import os from "node:os";
import { execFileSync } from "node:child_process";

// Builds the packs (JSON only) into a temp dir and reads the built private test actors. Skipped when the private
// test-actor data is not present (it is never committed).
const DATA = new URL("../../gen/data/", import.meta.url).pathname;
const has = fs.existsSync(path.join(DATA, "test-actors", "pcs"));

test("built test-actor PCs ship ready to play (equipped, Attack/Evasion Class set)", { skip: !has && "no private test-actor data" }, () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "sw25-ta-"));
  execFileSync(process.execPath, [new URL("../tools/build-compendia.mjs", import.meta.url).pathname, "--data", DATA, "--out", out, "--json-only"], { stdio: "ignore" });
  const dir = path.join(out, "src", "sw25-test-actors");
  const pcs = fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))).filter((a) => a.type === "character");
  assert.ok(pcs.length > 0);
  const FIGHTERS = ["fighter", "grappler", "fencer", "battle-dancer"];
  for (const a of pcs) {
    const gear = a.items.filter((i) => i.type === "weapon" || i.type === "armor");
    for (const g of gear) assert.equal(g.system.equip, true, `${a.name}: ${g.name} not equipped`);
    const classes = a.items.filter((i) => i.type === "skill");
    const slugOf = (n) => classes.find((c) => c.name === n)?.flags["sw25-ce"].slug;
    const weapons = a.items.filter((i) => i.type === "weapon");
    if (weapons.length) assert.equal(a.system.hitweapon, weapons[0].name, `${a.name}: Accuracy tile weapon`);
    if (a.system.attackskill) assert.ok(slugOf(a.system.attackskill), `${a.name}: attack class ${a.system.attackskill} not owned`);
    if (classes.some((c) => FIGHTERS.includes(c.flags["sw25-ce"].slug))) {
      assert.ok(FIGHTERS.includes(slugOf(a.system.dodgeskill)), `${a.name}: evasion class "${a.system.dodgeskill}"`);
      assert.ok(a.system.attackskill, `${a.name}: attack class unset`);
    }
  }
  const hw = pcs.find((a) => a.name === "Human Warrior");
  if (hw) {
    assert.equal(hw.system.attackskill, "Fighter"); assert.equal(hw.system.dodgeskill, "Fighter");
    const sword = hw.items.find((i) => i.type === "weapon");
    assert.equal(sword.system.equip, true); assert.equal(sword.system.checkskill, "Fighter");
  }
  fs.rmSync(out, { recursive: true, force: true });
});
