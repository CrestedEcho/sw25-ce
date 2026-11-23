// ce.28: player character tokens must be linked to their actor (sheet and token are the same character).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tokenDefaultsFor, passedTokenValue, charactersToLink, unlinkedPlacedTokens } from "../module/rules/token-link.mjs";

const rd = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("new character from the sidebar is linked with character display defaults", () => {
  const u = tokenDefaultsFor("character", { name: "Rin", type: "character" });
  assert.equal(u["prototypeToken.actorLink"], true);
  assert.equal(u["prototypeToken.disposition"], 1);
  assert.equal(u["prototypeToken.displayBars"], 50);
});

test("character created in a folder is linked (the ce.27 bug)", () => {
  const u = tokenDefaultsFor("character", { name: "Rin", type: "character", folder: "abc123" });
  assert.equal(u["prototypeToken.actorLink"], true);
});

test("character copied from a compendium or duplicated with actorLink:false is still linked", () => {
  const u = tokenDefaultsFor("character", { name: "Rin", type: "character", _stats: { compendiumSource: "Compendium.x.y.Actor.z" }, prototypeToken: { actorLink: false, disposition: -1 } });
  assert.equal(u["prototypeToken.actorLink"], true);
  assert.equal(u["prototypeToken.disposition"], -1, "other passed token settings are kept");
});

test("monster defaults to unlinked but keeps a passed value", () => {
  assert.equal(tokenDefaultsFor("monster", { name: "Goblin" })["prototypeToken.actorLink"], false);
  assert.equal(tokenDefaultsFor("monster", { name: "Boss", prototypeToken: { actorLink: true } })["prototypeToken.actorLink"], true);
  assert.deepEqual(Object.keys(tokenDefaultsFor("monster", {})), ["prototypeToken.actorLink"], "monsters only get the link default");
});

test("npc defaults to linked but keeps a passed value", () => {
  assert.equal(tokenDefaultsFor("npc", { folder: "f" })["prototypeToken.actorLink"], true);
  assert.equal(tokenDefaultsFor("npc", { prototypeToken: { actorLink: false } })["prototypeToken.actorLink"], false);
  assert.equal(tokenDefaultsFor("npc", { "prototypeToken.actorLink": false })["prototypeToken.actorLink"], false);
});

test("unknown actor type gets nothing", () => {
  assert.deepEqual(tokenDefaultsFor("vehicle", {}), {});
});

test("passedTokenValue reads nested and dotted data, ignores missing/undefined", () => {
  assert.deepEqual(passedTokenValue({ prototypeToken: { actorLink: false } }, "actorLink"), { set: true, value: false });
  assert.deepEqual(passedTokenValue({ "prototypeToken.actorLink": true }, "actorLink"), { set: true, value: true });
  assert.deepEqual(passedTokenValue({ prototypeToken: { actorLink: undefined } }, "actorLink"), { set: false });
  assert.deepEqual(passedTokenValue(null, "actorLink"), { set: false });
});

test("one-time fix picks only unlinked characters", () => {
  const list = charactersToLink([
    { id: "a", type: "character", linked: false }, { id: "b", type: "character", linked: true },
    { id: "c", type: "monster", linked: false }, { id: "d", type: "npc", linked: false },
  ]);
  assert.deepEqual(list.map((a) => a.id), ["a"]);
});

test("report lists placed unlinked tokens of characters only", () => {
  const stale = unlinkedPlacedTokens([
    { tokenName: "Rin", actorId: "a", linked: false }, { tokenName: "Rin", actorId: "a", linked: true },
    { tokenName: "Goblin", actorId: "m", linked: false },
  ], ["a"]);
  assert.deepEqual(stale.map((t) => t.tokenName), ["Rin"]);
});

test("preCreateActor uses the raw creation data, not the document's prototypeToken", () => {
  const src = rd("module/sw25.mjs");
  assert.match(src, /Hooks\.on\("preCreateActor", \(actor, data, options, userId\) => \{\s*const update = tokenDefaultsFor\(actor\.type, data\)/);
  assert.doesNotMatch(src, /prototypeToken\.hasOwnProperty\("actorLink"\)/);
  assert.match(src, /await runCharacterTokenLinkFix\(\);/);
  assert.match(src, /registerTokenLinkSettings\(\);/);
});

test("English strings exist for the GM report", () => {
  const en = JSON.parse(rd("lang/en.json"));
  for (const k of ["Title", "Fixed", "Stale", "StaleHow"]) assert.ok(en.SW25.TokenLink[k], k);
});
