import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { portraitSrc, isUsableTokenArt, actorPortrait } from "../module/rules/token-portrait.mjs";

test("usable token art: not empty, not mystery-man, not a wildcard", () => {
  assert.equal(isUsableTokenArt("tokens/wyvern.webp"), true);
  for (const s of ["", null, undefined, "  ", "icons/svg/mystery-man.svg", "/icons/svg/mystery-man.svg?x=1", "monsters/*.webp"]) assert.equal(isUsableTokenArt(s), false, String(s));
});

test("portrait source: synced token > prototype token > actor portrait", () => {
  assert.deepEqual(portraitSrc({ actorImg: "a.webp", protoSrc: "p.webp" }), { src: "p.webp", from: "prototype" });
  assert.deepEqual(portraitSrc({ actorImg: "a.webp", protoSrc: "p.webp", tokenSrc: "t.webp" }), { src: "t.webp", from: "token" });
  assert.deepEqual(portraitSrc({ actorImg: "a.webp", protoSrc: "p.webp", tokenSrc: "icons/svg/mystery-man.svg" }), { src: "p.webp", from: "prototype" });
  assert.deepEqual(portraitSrc({ actorImg: "a.webp", protoSrc: "icons/svg/mystery-man.svg" }), { src: "a.webp", from: "actor" });
  assert.deepEqual(portraitSrc({ actorImg: "a.webp", protoSrc: "" }), { src: "a.webp", from: "actor" });
  assert.equal(portraitSrc({}).src, "icons/svg/mystery-man.svg");
});

test("actorPortrait reads prototype or the unlinked token's texture", () => {
  const base = { img: "a.webp", prototypeToken: { texture: { src: "p.webp" } }, isToken: false };
  assert.equal(actorPortrait(base).src, "p.webp");
  assert.equal(actorPortrait({ ...base, isToken: true, token: { texture: { src: "t.webp" } } }).src, "t.webp");
  assert.equal(actorPortrait({ ...base, isToken: true, token: { texture: { src: "" } } }).src, "p.webp");
  assert.equal(actorPortrait({ img: "a.webp" }).src, "a.webp");
});

test("sheets: portraits no longer edit actor.img; sheets use the token portrait", () => {
  const sb = readFileSync(new URL("../templates/actor/actor-statblock-sheet.hbs", import.meta.url), "utf8");
  const fw = readFileSync(new URL("../templates/actor/actor-fellow-card.hbs", import.meta.url), "utf8");
  assert.match(sb, /class="sb-por-img"/); assert.doesNotMatch(sb, /sb-por-img[^>]*data-edit/);
  assert.match(fw, /class="fw-por-img"/); assert.doesNotMatch(fw, /fw-por-img[^>]*data-edit/);
  const sheet = readFileSync(new URL("../module/sheets/statblock-sheet.mjs", import.meta.url), "utf8");
  assert.match(sheet, /img: actorPortrait\(this\.actor\)\.src/); assert.match(sheet, /bindPortrait\(this, root, "\.sb-por-img"/);
  const fsheet = readFileSync(new URL("../module/sheets/fellow-sheet.mjs", import.meta.url), "utf8");
  assert.match(fsheet, /img: actorPortrait\(this\.actor\)\.src/); assert.match(fsheet, /bindPortrait\(this, root, "\.fw-por-img", game\.user\.isGM/);
});
