/**
 * ce.21 F1: Race items.
 * Dropping a race on a character sets the race name, fills the A-F creation dice FORMULAS (never rolls them),
 * adds the race's abilities as linked cards (enhanced Lv6/Lv11 cards stay inactive until that adventurer level),
 * and keeps languages / restricted classes as plain text. Dropping another race replaces everything the old one added;
 * deleting the race removes it. Players roll each score with the per-score buttons (or Roll all A-F); results post
 * to chat and fill that score. Manual entry is still possible in edit mode.
 */
export const ABIL_KEYS = ["dex", "agi", "str", "vit", "int", "mnd"];
export const ABIL_LETTERS = { dex: "A", agi: "B", str: "C", vit: "D", int: "E", mnd: "F" };
const FLAG = "sw25-ce";

/** "2d" -> "2d6", "1d+3" -> "1d6+3"; already-sized dice kept; blank stays blank. */
export function diceFormula(s) {
  const t = String(s ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return "";
  return t.replace(/(\d*)d(?!\d)/g, (_, n) => `${n || 1}d6`);
}

/** Linked entries of a race (racial abilities at level 1, enhanced ones at their level), cleaned up. */
export function raceLinks(sys = {}) {
  const norm = (list, def) => (Array.isArray(list) ? list : Object.values(list ?? {}))
    .filter((e) => e && (e.uuid || e.name))
    .map((e) => ({ uuid: e.uuid ?? "", name: e.name ?? "", level: Math.max(1, Number(e.level) || def), enhanced: def > 1 || Number(e.level) > 1 }));
  return [...norm(sys.abilities, 1), ...norm(sys.enhanced, 6)];
}

/** Actor update for a race drop: name and dice formulas only (scores are never touched). */
export function raceActorUpdate(race) {
  const u = { "system.race": race?.name ?? "" };
  const dice = race?.system?.dice ?? {};
  for (const k of ABIL_KEYS) u[`system.abilities.${k}.dice`] = String(dice[k] ?? "").trim();
  return u;
}
/** Actor update clearing what a race set (only if that race is still the one named). */
export function raceClearUpdate(actor, race) {
  if ((actor?.system?.race ?? "") !== (race?.name ?? "")) return null;
  const u = { "system.race": "" };
  for (const k of ABIL_KEYS) u[`system.abilities.${k}.dice`] = "";
  return u;
}

/** Item data for one linked card on the actor. `src` is the linked item's data or null (then a description-only card). */
export function raceCardData(src, link, raceId, raceName) {
  const base = src ? JSON.parse(JSON.stringify(src)) : { name: link.name || "Racial ability", type: "raceability", system: { description: "" } };
  delete base._id;
  base.system ??= {};
  if (base.type === "raceability" && !base.system.race) base.system.race = raceName ?? "";
  base.flags ??= {};
  base.flags[FLAG] = { ...(base.flags[FLAG] ?? {}), fromRace: raceId, raceLevel: link.level, ...(link.uuid ? { raceLink: link.uuid } : {}) };
  return base;
}

export const raceOf = (item) => item?.flags?.[FLAG]?.fromRace ?? item?.getFlag?.(FLAG, "fromRace") ?? null;
export const raceLevelOf = (item) => Number(item?.flags?.[FLAG]?.raceLevel ?? item?.getFlag?.(FLAG, "raceLevel")) || 1;
/** Ids of cards a given race added. */
export function raceCardIds(items, raceId) {
  return [...(items ?? [])].filter((i) => raceId && raceOf(i) === raceId).map((i) => i.id ?? i._id);
}
/** An enhanced card is active once adventurer level reaches its level (a blank level counts as 1). */
export function raceCardActive(item, adv) {
  return raceLevelOf(item) <= Math.max(1, Number(adv) || 0);
}

/** Apply a race that is now owned by `actor`: replace any other race (and its cards), set name + dice, add cards. */
export async function applyRace(actor, race, { resolve = (u) => globalThis.fromUuid?.(u) } = {}) {
  const others = actor.items.filter((i) => i.type === "race" && i.id !== race.id);
  const del = [...others.map((o) => o.id), ...others.flatMap((o) => raceCardIds(actor.items, o.id)), ...raceCardIds(actor.items, race.id)];
  if (del.length) await actor.deleteEmbeddedDocuments("Item", del, { sw25RaceSwap: true });
  await actor.update(raceActorUpdate(race));
  const cards = [];
  for (const link of raceLinks(race.system)) {
    let src = null;
    if (link.uuid) { try { src = (await resolve(link.uuid))?.toObject?.() ?? null; } catch { src = null; } }
    cards.push(raceCardData(src, link, race.id, race.name));
  }
  if (cards.length) await actor.createEmbeddedDocuments("Item", cards, { sw25RaceCards: true });
  return cards.length;
}
/** The race was deleted: remove its cards and clear the name / dice it set. */
export async function removeRace(actor, race) {
  const ids = raceCardIds(actor.items, race.id).filter((id) => actor.items.get(id));
  if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids, { sw25RaceSwap: true });
  const u = raceClearUpdate(actor, race);
  if (u) await actor.update(u);
}

/** Roll one creation score (player-initiated): post to chat, fill that score's A-F value. */
export async function rollAbilityScore(actor, key, { RollCls = globalThis.Roll, Chat = globalThis.ChatMessage } = {}) {
  const ab = actor?.system?.abilities?.[key];
  const formula = diceFormula(ab?.dice);
  if (!formula) return null;
  const roll = await new RollCls(formula).evaluate();
  await roll.toMessage({ speaker: Chat?.getSpeaker?.({ actor }), flavor: `${actor.name}: creation roll ${ABIL_LETTERS[key]} (${ab.dice})` });
  await actor.update({ [`system.abilities.${key}.valuebase`]: roll.total });
  return roll.total;
}
export async function rollAllScores(actor, opts) {
  const out = {};
  for (const k of ABIL_KEYS) if (diceFormula(actor?.system?.abilities?.[k]?.dice)) out[k] = await rollAbilityScore(actor, k, opts);
  return out;
}

export function registerRaceHooks() {
  Hooks.on("createItem", (item, options, userId) => {
    if (item.type !== "race" || userId !== game.user.id || item.parent?.documentName !== "Actor") return;
    applyRace(item.parent, item).catch((e) => { console.error("sw25-ce | race drop failed", e); ui.notifications?.error(`SW2.5: race drop failed: ${e.message}`); });
  });
  Hooks.on("deleteItem", (item, options, userId) => {
    if (item.type !== "race" || options?.sw25RaceSwap || userId !== game.user.id || item.parent?.documentName !== "Actor") return;
    removeRace(item.parent, item).catch((e) => console.error("sw25-ce | race removal failed", e));
  });
}

/** Race item sheet view data. */
export function raceSheetData(sys = {}) {
  const labels = { dex: "Dex", agi: "Agi", str: "Str", vit: "Vit", int: "Int", mnd: "Mnd" };
  const list = (l) => (Array.isArray(l) ? l : Object.values(l ?? {})).map((e, idx) => ({ ...e, idx }));
  return {
    raceDice: ABIL_KEYS.map((key) => ({ key, letter: ABIL_LETTERS[key], label: labels[key], value: sys.dice?.[key] ?? "" })),
    raceAbilities: list(sys.abilities),
    raceEnhanced: list(sys.enhanced),
  };
}
/** New list after linking a dropped item (no duplicates by uuid). Enhanced links default to level 6. */
export function addRaceLink(list, { uuid, name }, which = "abilities") {
  const cur = Array.isArray(list) ? [...list] : Object.values(list ?? {});
  if (!uuid || cur.some((e) => e.uuid === uuid)) return cur;
  const next = which === "enhanced" ? (cur.some((e) => Number(e.level) === 6) ? 11 : 6) : 1;
  cur.push({ uuid, name: name ?? "", level: next });
  return cur;
}
