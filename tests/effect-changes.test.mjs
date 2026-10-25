import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeChanges, prepareEffectData } from "../module/rules/effect-changes.mjs";

test("status-effect documents (Dead / Mark Defeated) pass through untouched", () => {
  const doc = { toObject() { return {}; }, get changes() { return []; }, set changes(v) { throw new Error("cannot assign"); } };
  assert.equal(prepareEffectData(doc), doc);
  assert.equal(prepareEffectData([doc])[0], doc);
});

test("plain data and arrays get normalized keys without mutating input", () => {
  const raw = { name: "x", changes: [{ keyname: "abi.str", value: 1 }] };
  const out = prepareEffectData([raw])[0];
  assert.equal(out.changes[0].key, "system.abi.str");
  assert.equal(raw.changes[0].key, undefined);
  assert.equal(prepareEffectData({ name: "y" }).changes, undefined);
  assert.equal(normalizeChanges([{ key: "checkinput,foo" }])[0].key, "system.effect.checkinputmod.foo");
});
