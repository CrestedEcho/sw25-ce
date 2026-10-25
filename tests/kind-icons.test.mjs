import { test } from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { iconImg, iconFolder, DEFAULT_IMG } from "../tools/build-compendia.mjs";
const put = (root, folder, name) => { fs.mkdirSync(path.join(root, folder), { recursive: true }); fs.writeFileSync(path.join(root, folder, `${name}.webp`), "x"); };
test("icon: own file, else folder _placeholder, else Foundry default", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ki-"));
  const cases = [["classes", {}], ["feats", {}], ["spells", {}], ["monsters", {}], ["items", { type: "weapon" }], ["items", { type: "armor" }], ["items", { type: "shield" }], ["items", { type: "accessory" }], ["items", { type: "consumable" }]];
  for (const [kind, extra] of cases) {
    const folder = iconFolder(kind, extra);
    assert.equal(iconImg(kind, { ...extra, slug: "made-up" }, root), DEFAULT_IMG[kind]);
    put(root, folder, "_placeholder");
    assert.equal(iconImg(kind, { ...extra, slug: "made-up" }, root), `assets/icons/${folder}/_placeholder.webp`);
    put(root, folder, "made-up");
    assert.equal(iconImg(kind, { ...extra, slug: "made-up" }, root), `assets/icons/${folder}/made-up.webp`);
  }
  assert.equal(iconFolder("items", { type: "armor" }), "armour");
  put(root, "spells", "divine-x__made-up");
  assert.equal(iconImg("spells", { slug: "divine-x/made-up" }, root), "assets/icons/spells/divine-x__made-up.webp");
  assert.equal(iconImg("items", { type: "weapon", slug: "../escape" }, root), "assets/icons/weapons/_placeholder.webp");
});
