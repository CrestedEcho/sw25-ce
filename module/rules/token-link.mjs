// Default prototype-token settings for new actors, and the one-time fix for player characters whose tokens
// were created unlinked (ce.27 and older: a character made inside a folder or copied from a compendium kept
// Foundry's default actorLink=false, so edits on a placed token never reached the actor sheet).
//
// Rules:
//  - character: always linked. A player character must share one sheet with its token.
//  - npc / monster: keep a value the creator actually passed in the creation data (compendium copy, duplicate,
//    import), otherwise use the type default (npc linked, monster unlinked).
//  - display fields: keep what the creation data passed, otherwise use the type default.

export const TOKEN_DEFAULTS = {
  character: { displayName: 50, actorLink: true, appendNumber: false, prependAdjective: false, disposition: 1, displayBars: 50 },
  npc: { displayName: 30, actorLink: true, appendNumber: false, prependAdjective: false, disposition: 0, displayBars: 0 },
  monster: { actorLink: false },
};

const has = (o, k) => o != null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;

/** Read prototypeToken.<key> from raw creation data, supporting nested and dotted ("prototypeToken.actorLink") forms. */
export function passedTokenValue(data, key) {
  if (!data || typeof data !== "object") return { set: false };
  const dotted = `prototypeToken.${key}`;
  if (has(data, dotted)) return { set: true, value: data[dotted] };
  const pt = data.prototypeToken;
  if (has(pt, key)) return { set: true, value: pt[key] };
  return { set: false };
}

/**
 * The prototypeToken update to apply in preCreateActor.
 * @param {string} type   actor type
 * @param {object} data   the raw creation data (2nd hook argument), NOT the document
 * @returns {object} flat "prototypeToken.*" update (empty when nothing to set)
 */
export function tokenDefaultsFor(type, data) {
  const defs = TOKEN_DEFAULTS[type];
  if (!defs) return {};
  const out = {};
  for (const [key, def] of Object.entries(defs)) {
    if (type === "character" && key === "actorLink") { out[`prototypeToken.${key}`] = true; continue; }
    const passed = passedTokenValue(data, key);
    out[`prototypeToken.${key}`] = passed.set ? passed.value : def;
  }
  return out;
}

/** Characters (as plain {id,name,type,linked}) whose prototype token needs linking. */
export function charactersToLink(actors) {
  return (actors ?? []).filter((a) => a?.type === "character" && a.linked === false);
}

/** Placed tokens (plain {sceneName, tokenName, actorId, linked}) of the given characters that are still unlinked. */
export function unlinkedPlacedTokens(tokens, characterIds) {
  const ids = new Set(characterIds);
  return (tokens ?? []).filter((t) => t && t.linked === false && ids.has(t.actorId));
}

/* ------------------------------------------------------------------ */
/* Foundry glue                                                        */
/* ------------------------------------------------------------------ */
const SYS = "sw25-ce";

export function registerTokenLinkSettings() {
  game.settings.register(SYS, "characterTokensLinked", { scope: "world", config: false, type: Boolean, default: false });
}

/** One-time, active GM only: link every character's prototype token and whisper the GM a report. Placed tokens are not changed. */
export async function runCharacterTokenLinkFix() {
  if (!game.user.isGM || game.user.id !== game.users.activeGM?.id) return;
  if (game.settings.get(SYS, "characterTokensLinked")) return;
  const plain = game.actors.map((a) => ({ id: a.id, name: a.name, type: a.type, linked: !!a.prototypeToken?.actorLink }));
  const todo = charactersToLink(plain);
  const fixed = [];
  for (const a of todo) {
    try { await game.actors.get(a.id)?.update({ "prototypeToken.actorLink": true }); fixed.push(a.name); }
    catch (err) { console.error(`sw25-ce | could not link token for ${a.name}`, err); }
  }
  const charIds = plain.filter((a) => a.type === "character").map((a) => a.id);
  const placed = [];
  for (const scene of game.scenes) for (const t of scene.tokens) placed.push({ sceneName: scene.name, tokenName: t.name, actorId: t.actorId, linked: !!t.actorLink });
  const stale = unlinkedPlacedTokens(placed, charIds);
  await game.settings.set(SYS, "characterTokensLinked", true);
  if (!fixed.length && !stale.length) return;
  const esc = (s) => foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(s)) : String(s);
  const L = (k, d) => game.i18n.format(`SW25.TokenLink.${k}`, d ?? {});
  let html = `<h3>${L("Title")}</h3>`;
  if (fixed.length) html += `<p>${L("Fixed", { n: fixed.length })}</p><ul>${fixed.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`;
  if (stale.length) html += `<p>${L("Stale", { n: stale.length })}</p><ul>${stale.map((t) => `<li>${esc(t.tokenName)} (${esc(t.sceneName)})</li>`).join("")}</ul><p>${L("StaleHow")}</p>`;
  await ChatMessage.create({ content: html, whisper: game.users.filter((u) => u.isGM).map((u) => u.id), speaker: { alias: "sw25-ce" } });
  if (fixed.length) ui.notifications.info(L("Fixed", { n: fixed.length }));
}
