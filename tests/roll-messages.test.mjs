import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readRoll, checkRollHTML, linkedRolls, accuracyOutcomes, outcomeLinesHTML, check } from "../module/rules/attack-card.mjs";
import { rollModeFields, rollMessageData } from "../module/rules/dice-fx.mjs";

const chk = check("Accuracy", 5, [{ label: "Fighter + Dex", value: 5 }]);
const m = (id, flag) => ({ id, flag });

test("checkRollHTML: roll total, dice, breakdown, outcome lines and note", () => {
  const h = checkRollHTML({ kind: "evasion", title: "Short Sword", who: "Goblin", chk, roll: readRoll([3, 4], 12), outs: [{ vs: "Ellen 12", result: "miss", why: "12 ties 12: a tie is a miss" }] });
  assert.match(h, /data-sw25-acr="evasion"/); assert.match(h, /Evasion: Goblin/); assert.match(h, /\(3 \+ 4\)/);
  assert.match(h, /MISS/); assert.match(h, /vs Ellen 12/); assert.match(h, /tie is a miss/); assert.match(h, /sw25-acr-out/);
  const a = checkRollHTML({ kind: "accuracy", who: "Ellen", chk, roll: readRoll([6, 6], 17), note: "Waiting for Evasion…" });
  assert.match(a, /Accuracy: Ellen/); assert.match(a, /natural 12/); assert.match(a, /Waiting for Evasion/); assert.doesNotMatch(a, /HIT|MISS/);
});

test("linkedRolls: latest Accuracy of the card, Evasions linked to one Accuracy", () => {
  const list = [m("a1", { kind: "accuracy", cardId: "c", roll: readRoll([3, 3], 11) }), m("x", { kind: "accuracy", cardId: "other" }),
    m("e1", { kind: "evasion", cardId: "c", accMsgId: "a1", who: "Goblin", roll: readRoll([2, 3], 9) }),
    m("a2", { kind: "accuracy", cardId: "c", roll: readRoll([1, 1], 7) }),
    m("e2", { kind: "evasion", cardId: "c", accMsgId: "a2", who: "Kobold", roll: readRoll([4, 4], 10) })];
  const L = linkedRolls(list, "c");
  assert.equal(L.lastAccuracy.id, "a2");
  assert.deepEqual(L.evasionsFor("a1").map((x) => x.id), ["e1"]);
  assert.equal(linkedRolls(list, "none").lastAccuracy, null);
  // a1 (11) vs Goblin 9 -> hit; a2 natural 2 vs Kobold -> miss
  assert.deepEqual(accuracyOutcomes(list[0].flag.roll, L.evasionsFor("a1")).map((o) => [o.vs, o.result]), [["Goblin", "hit"]]);
  const o2 = accuracyOutcomes(list[3].flag.roll, L.evasionsFor("a2"));
  assert.equal(o2[0].result, "miss"); assert.match(o2[0].why, /natural 2/);
  assert.match(outcomeLinesHTML(o2), /MISS.*vs Kobold/);
});

test("tie is a miss, natural 12 on Evasion beats a higher Accuracy", () => {
  const L = linkedRolls([m("e", { kind: "evasion", cardId: "c", accMsgId: "a", who: "G", roll: readRoll([5, 5], 14) })], "c");
  assert.equal(accuracyOutcomes(readRoll([5, 4], 14), L.evasionsFor("a"))[0].result, "miss");
  const L2 = linkedRolls([m("e", { kind: "evasion", cardId: "c", accMsgId: "a", who: "G", roll: readRoll([6, 6], 13) })], "c");
  assert.equal(accuracyOutcomes(readRoll([5, 4], 20), L2.evasionsFor("a"))[0].result, "miss");
});

test("rollModeFields: public / gm / blind / self", () => {
  const o = { selfId: "me", gmIds: ["gm"] };
  assert.deepEqual(rollModeFields("publicroll", o), { whisper: [], blind: false });
  assert.deepEqual(rollModeFields("gmroll", o), { whisper: ["me", "gm"], blind: false });
  assert.deepEqual(rollModeFields("blindroll", o), { whisper: ["gm"], blind: true });
  assert.deepEqual(rollModeFields("selfroll", o), { whisper: ["me"], blind: false });
});

test("rollMessageData: dice sound + roll mode via ChatMessage.applyRollMode, fallback without it", () => {
  const saved = { CONFIG: globalThis.CONFIG, ChatMessage: globalThis.ChatMessage, game: globalThis.game };
  try {
    globalThis.CONFIG = { sounds: { dice: "sounds/dice.wav" } };
    let seen = null; globalThis.ChatMessage = { applyRollMode: (d, mode) => { seen = mode; if (mode === "blindroll") { d.whisper = ["gm"]; d.blind = true; } } };
    const d = rollMessageData({ content: "x", rolls: [] }, { mode: "blindroll" });
    assert.equal(d.sound, "sounds/dice.wav"); assert.equal(seen, "blindroll"); assert.equal(d.blind, true);
    globalThis.ChatMessage = {}; globalThis.game = { user: { id: "me" }, users: [{ id: "gm", isGM: true }, { id: "me" }] };
    const e = rollMessageData({}, { mode: "selfroll" }); assert.deepEqual(e.whisper, ["me"]); assert.equal(e.sound, "sounds/dice.wav");
    const p = rollMessageData({}, { mode: "publicroll" }); assert.equal(p.whisper, undefined);
  } finally { Object.assign(globalThis, saved); }
});

test("card buttons post new roll messages; no in-place roll writes, no manual 3D/sound hack", () => {
  const src = fs.readFileSync(new URL("../module/rules/attack-flow.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /showForRoll|AudioHelper|patchAttack|attackUpdate/);
  assert.match(src, /async function postCheckRoll[\s\S]*?ChatMessage\.create\(data\)/);
  assert.match(src, /rolls: \[r\]/);
  assert.match(src, /rollMessageData\(\{ speaker: ChatMessage\.getSpeaker\(\{ actor \}\), content: damageCardHTML/);
  for (const f of ["../module/rules/spell-flow.mjs", "../module/sheets/statblock-sheet.mjs"]) {
    const s = fs.readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(s, /rollMessageData\(/); assert.match(s, /dmgRolls\.push\(x\)/);
  }
  assert.doesNotMatch(fs.readFileSync(new URL("../module/sw25.mjs", import.meta.url), "utf8"), /attackUpdate/);
});
