import { test } from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { featImg } from "../tools/build-compendia.mjs";
test("feat icon used when file exists, else sword default", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fi-")); fs.writeFileSync(path.join(dir, "made-up-feat.webp"), "x");
  assert.equal(featImg("made-up-feat", dir), "assets/icons/feats/made-up-feat.webp");
  assert.equal(featImg("missing-feat", dir), "icons/svg/sword.svg");
  assert.equal(featImg(undefined, dir), "icons/svg/sword.svg");
});
