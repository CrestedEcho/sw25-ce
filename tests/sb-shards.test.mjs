import { test } from "node:test";
import assert from "node:assert/strict";
import { shardResistBonus, shardBonus, shardTip, shardFollowParts, shardFollowUpdate, mergeSbPreview } from "../module/rules/sb-shards.mjs";
import { prepareStatBlock } from "../module/rules/statblock.mjs";
import { buildStatBlockContext } from "../module/rules/statblock-sheet-data.mjs";

const SB = (n, extra = {}) => ({ swordShards: n, fortitude: { value: 5 }, willpower: { value: 6 },
  parts: [{ name: "Body", hp: 30, mp: 12, isCore: true }, { name: "Arm", hp: 20, mp: null, hpValue: 15 }], ...extra });

test("resistance bonus tiers 1-5/6-10/11-15/16+", () => {
  assert.deepEqual([0, 1, 5, 6, 10, 11, 15, 16, 40, -3].map(shardResistBonus), [0, 1, 1, 2, 2, 3, 3, 4, 4, 0]);
  assert.deepEqual(shardBonus(3), { n: 3, hp: 15, mp: 3, res: 1 });
  assert.equal(shardTip(30, 10, 2), "Base 30 +10 from 2 Sword Shards");
  assert.equal(shardTip(5, 1, 1), "Base 5 +1 from 1 Sword Shard");
});

test("every part gets +5N HP / +N MP; resistances +bonus to value, fixed and dice", () => {
  const raw = SB(7); const v = prepareStatBlock(raw, {}, "monster");
  assert.deepEqual(v.parts.map((p) => [p.hp, p.hpValue, p.mp, p.mpValue]), [[65, 65, 19, 19], [55, 15, null, null]]);
  assert.deepEqual(v.fortitude, { value: 7, fixed: 14 }); assert.deepEqual(v.willpower, { value: 8, fixed: 15 });
  assert.equal(raw.parts[0].hp, 30, "base data untouched"); assert.equal(raw.fortitude.value, 5);
  const ctx = buildStatBlockContext({ type: "monster", view: v, raw });
  const vit = ctx.resistances.find((r) => r.label === "Vitality Resistance");
  assert.equal(vit.fixed, 14); assert.match(vit.formula, /2d6\s*\+\s*7/); assert.match(vit.boost.tip, /Base 12 \+2 from 7 Sword Shards/);
  assert.equal(ctx.parts[0].hp.boost.tip, "Base 30 +35 from 7 Sword Shards"); assert.equal(ctx.parts[0].hp.edit, 30);
  assert.equal(ctx.stats.fortitude.value.boost.tip, "Base 5 +2 from 7 Sword Shards");
  assert.equal(ctx.parts[1].mp.boost, null);
  assert.equal(ctx.shards.label, "Enhanced: 7 shards");
});

test("no shards / locked values are not boosted", () => {
  const v0 = prepareStatBlock(SB(0), {}, "monster"); assert.equal(v0.parts[0].hp, 30); assert.equal(buildStatBlockContext({ type: "monster", view: v0, raw: SB(0) }).shards, null);
  const vl = prepareStatBlock(SB(2, { overrides: { "parts.0.hp": { value: 99, locked: true } } }), {}, "monster");
  assert.equal(vl.parts[0].hp, 99); assert.equal(vl.parts[1].hp, 30);
});

test("current HP follows max only when it was full", () => {
  const old = SB(1); old.parts[0].hpValue = 35; old.parts[1].hpValue = 10;
  const parts = shardFollowUpdate(old, { swordShards: 3 }, prepareStatBlock);
  assert.equal(parts[0].hpValue, 45); assert.equal(parts[1].hpValue, 10);
  assert.equal(shardFollowUpdate(old, { name: "x" }, prepareStatBlock), null);
  assert.equal(shardFollowUpdate(old, { swordShards: 3 }, prepareStatBlock, {}, "npc")[0].hpValue, 45); // NPCs follow too
  const down = shardFollowUpdate({ ...old, swordShards: 3, parts: [{ ...old.parts[0], hpValue: 45 }, old.parts[1]] }, { swordShards: 0 }, prepareStatBlock);
  assert.equal(down[0].hpValue, 30);
  assert.equal(shardFollowParts({ shards: { n: 1 } }, { shards: { n: 1 } }, []), null);
  assert.deepEqual(mergeSbPreview([{ a: 1 }, { a: 2 }], { 1: { a: 3 } }), [{ a: 1 }, { a: 3 }]);
});

test("NPCs get the same Sword Shard boost, display and badge as monsters", () => {
  const raw = SB(7); const v = prepareStatBlock(raw, {}, "npc");
  assert.deepEqual(v.parts.map((p) => p.hp), [65, 55]); // +5 HP per shard on every part
  assert.equal(v.parts[0].mp, 19); assert.equal(v.parts[1].mp, null); // +1 MP per shard only on parts with MP
  assert.deepEqual(v.fortitude, { value: 7, fixed: 14 }); assert.deepEqual(v.willpower, { value: 8, fixed: 15 }); // 6-10 shards: +2
  assert.equal(v.parts[1].hpValue, 15); assert.equal(v.parts[0].hpValue, 65);
  const ctx = buildStatBlockContext({ type: "npc", view: v, raw });
  assert.equal(ctx.isNPC, true); assert.equal(ctx.shards.label, "Enhanced: 7 shards");
  assert.match(ctx.shards.tip, /\+35 max HP \/ \+7 max MP per part, Fortitude & Willpower \+2/);
  assert.ok(ctx.stats.swordShards); // shard tracking field
  for (const n of [0, 3, 8, 12, 20]) assert.deepEqual(prepareStatBlock(SB(n), {}, "npc").shards.res, prepareStatBlock(SB(n), {}, "monster").shards.res);
});
