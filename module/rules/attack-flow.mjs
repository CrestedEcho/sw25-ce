/**
 * sw25-ce attack flow (Foundry glue): attack card (Accuracy / Evasion / Damage buttons) and the damage card
 * (breakdown + Apply panel for the live selected tokens, else the user's own character).
 * Numbers and HTML come from the pure attack-card.mjs / damage-card.mjs.
 */
import { check, pcEvasion, monsterCheck, readRoll, attackCardHTML, checkRollHTML, contest, linkedRolls, accuracyOutcomes, outcomeLinesHTML } from "./attack-card.mjs";
import { rollMessageData } from "./dice-fx.mjs";
import { damageBreakdown, damageCardHTML, applyPanelHTML, applyRow, validMult } from "./damage-card.mjs";
import { formatDamage } from "./damage-display.mjs";
import { parseSbDamage } from "./sb-play.mjs";
import { pcWeaponBattle } from "./weapon-battle.mjs";
import { powerRoll } from "../helpers/powerroll.mjs";
import { powerTableFor, parsePowerCommand } from "./power-command.mjs";
import { resolveTargetTokens } from "../helpers/target-chips.mjs";
import { targetDefense, weakBonus, applyFinalToActor, appliedCard } from "./apply-damage.mjs";
import { annotateAttackCard, afterWeaponDamage } from "./combat-ui.mjs";
import { sbParts, isMultiPart, defaultPart, partIndex as clampPart, partSelectHTML, partPicksFrom, pickFor } from "./part-pick.mjs";

const SYS = "sw25-ce";
const SOCKET = "system.sw25";
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const gmOnline = () => game.users.some((u) => u.isGM && u.active);
const diceOf = (roll) => (roll?.dice?.[0]?.results ?? []).filter((r) => r.active !== false).map((r) => r.result);

function corePart(actor) {
  const parts = actor?.system?.sbView?.parts ?? [];
  return parts.find((p) => p.isCore) ?? parts[0] ?? null;
}
function evasionFor(actor, part = null) {
  if (!actor) return null;
  if (actor.type === "character") return pcEvasion(actor.system);
  if (actor.system?.sb) {
    const p = part == null ? corePart(actor) : sbParts(actor)[part];
    return p ? monsterCheck(part == null ? "Evasion" : `Evasion (${p.name || "Part"})`, p.evasion) : null;
  }
  return null;
}
/** Multi-part defender: ask which part dodges (2d6 + that part's Evasion Standard Value). null = cancelled. */
export async function pickEvasionPart(actor, preferred) {
  const parts = sbParts(actor); const DV2 = foundry.applications?.api?.DialogV2;
  if (!DV2) return defaultPart(parts, preferred);
  const content = `<p>${esc(actor.name)} has several parts. Which part rolls Evasion?</p><label>Part ${partSelectHTML(parts, preferred, { cls: "sw25-eva-part" })}</label>`;
  const v = await DV2.prompt({ window: { title: `Evasion: ${actor.name}` }, content,
    ok: { label: "Roll Evasion", callback: (_e, b) => Number(b.form.elements.part.value) }, rejectClose: false }).catch(() => null);
  return v == null || !Number.isInteger(v) ? null : clampPart(parts, v);
}
/** Part picks remembered from this attack's Evasion rolls (for the damage card's Apply part picker). */
function evasionPartPicks(cardId) {
  if (!cardId) return {};
  const evs = game.messages.contents.map((m) => rollFlag(m)).filter((x) => x?.kind === "evasion" && x.cardId === cardId);
  return partPicksFrom(evs);
}

/** Attack data for one PC weapon by item id (default: the Accuracy-tile weapon). null + warning when none. */
async function pcAttackData(actor, itemId = null) {
  const sys = actor.system; const id = itemId ?? sys.itemid; const item = id ? actor.items.get(id) : null;
  if (!item || item.type !== "weapon") { ui.notifications.warn(game.i18n.localize("SW25.V2.NeedWeapon")); return null; }
  const b = item.system._battle ?? pcWeaponBattle(item.system, sys);
  const label = formatDamage(b.power, b.crit, b.bonus);
  const damage = { type: "power", formula: b.formula, pt: [...(b.pt ?? [])], label, bonusParts: b.dmgParts ?? [] };
  const desc = item.system.description ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description, { relativeTo: item }) : "";
  const state = { name: item.name, img: item.img, sub: [item.system.category, item.system.usage].filter(Boolean).join(" · "), desc, acc: check("Accuracy", b.acc, b.accParts ?? []), damageLabel: `${label} (power / crit / bonus)` };
  const resuse = item.system.autouseres && item.system.resuse ? { id: item.system.resuse, n: Number(item.system.resusequantity) || 0 } : null;
  return { state, damage, itemId: item.id, item, resuse };
}
/** Damage tile / Weapons list Damage button: roll that weapon's damage straight to a damage card. */
export async function rollWeaponDamage(actor, { itemId = null } = {}) {
  const w = await pcAttackData(actor, itemId); if (!w) return;
  const msg = await postDamageCard(actor, w);
  await afterWeaponDamage(actor, w.item);
  return msg;
}
/**
 * Weapons list / item card click on a character's weapon: post the card for THAT weapon (by item id, so
 * duplicate names are fine). The Accuracy-tile choice (system.hitweapon) is left alone.
 * route: "attack" (attack card) or "damage" (damage card).
 */
export async function attackWithWeapon(actor, item, route) {
  if (!actor || !item) return;
  if (!actor.isOwner) return ui.notifications.warn(`Only the owner of ${actor.name} can attack with ${item.name}.`);
  return route === "damage" ? rollWeaponDamage(actor, { itemId: item.id }) : postAttackCard(actor, { itemId: item.id });
}
/** Post the attack card for a PC weapon (opts.itemId, default the Accuracy-tile weapon), or for a stat-block part (opts.partIndex). */
export async function postAttackCard(actor, { partIndex = null, itemId: wantId = null } = {}) {
  let state, damage, itemId = null, resuse = null, item = null;
  if (partIndex != null && actor.system?.sb) {
    const p = (actor.system.sbView?.parts ?? [])[partIndex];
    if (!p) return;
    const acc = monsterCheck("Accuracy", p.accuracy);
    if (!acc) return ui.notifications.warn(`${p.name || actor.name}: no Accuracy on the stat block.`);
    const d = parseSbDamage(p.damage);
    damage = d ? { type: "dice", formula: d.formula, text: p.damage } : null;
    state = { name: `${actor.name}${p.name ? `: ${p.name}` : ""}`, img: actor.img, sub: "Attack", acc, damageLabel: d ? `Damage ${p.damage}` : "No damage on the stat block" };
  } else {
    const w = await pcAttackData(actor, wantId); if (!w) return;
    ({ state, damage, itemId, resuse, item } = w);
  }
  const flag = { resuse, actorId: actor.id, tokenId: actor.token?.id ?? actor.getActiveTokens?.()[0]?.id ?? null, itemId, partIndex, damage, state };
  const msg = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: attackCardHTML(state), flags: { [SYS]: { attack: flag } } });
  if (itemId) await annotateAttackCard(actor, msg?.id, "hit", item);
  return msg;
}

const rollFlag = (m) => m?.getFlag?.(SYS, "attackRoll") ?? m?.flags?.[SYS]?.attackRoll ?? null;
const linkedFor = (cardId) => linkedRolls(game.messages.contents.map((m) => ({ id: m.id, flag: rollFlag(m) })).filter((m) => m.flag), cardId);

/** Roll a 2d6 check and post it as its own roll message (dice sound + Dice So Nice + roll mode come from core). */
async function postCheckRoll(card, kind, chk, { actor, who, outs = [], note = "", extra = {} }) {
  const r = await new Roll(chk.formula).evaluate();
  const roll = readRoll(diceOf(r), r.total);
  const f = card.getFlag(SYS, "attack");
  const html = checkRollHTML({ kind, title: f.state.name, who, chk, roll, outs: typeof outs === "function" ? outs(roll) : outs, note: typeof note === "function" ? note(roll) : note });
  const data = rollMessageData({ speaker: ChatMessage.getSpeaker({ actor }), content: html, rolls: [r],
    flags: { [SYS]: { attackRoll: { kind, cardId: card.id, roll, who, ...extra } } } });
  return ChatMessage.create(data);
}

async function onAccuracy(msg) {
  const f = msg.getFlag(SYS, "attack"); const actor = game.actors.get(f.actorId);
  if (!actor?.isOwner || !msg.isOwner) return ui.notifications.warn("Only the attacker rolls Accuracy.");
  // Ammunition is spent on the first Accuracy roll of a card only (rerolls are free, as before).
  const first = !f.accRolled && !f.state.accRoll && !linkedFor(msg.id).lastAccuracy;
  if (f.resuse && first && !(await spendAmmo(actor, f.resuse))) return;
  const out = await postCheckRoll(msg, "accuracy", f.state.acc, { actor, who: actor.name, note: "Waiting for Evasion…" });
  if (first) await msg.setFlag(SYS, "attack.accRolled", true);
  return out;
}
/** Ammunition / resource used by the weapon (same rule as the old Accuracy roll). False = not enough. */
async function spendAmmo(actor, { id, n }) {
  const it = actor.items.get(id); if (!it || !n) return true;
  const have = Number(it.system.quantity) || 0; const left = have - n; const min = Number(it.system.qmin) || 0;
  if (have < n || left < min) { ui.notifications.warn(game.i18n.localize("SW25.Item.Noresquantitiywarn") + it.name); return false; }
  await it.update({ "system.quantity": left });
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div style="text-align:right">${esc(it.name)}: ${have} >>> ${left}</div>` });
  return true;
}
/** Who rolls Evasion: players use their assigned character; the GM uses the selected token. */
function evaderActor() {
  return evader()?.actor ?? null;
}
/** { actor, token } of whoever is rolling Evasion. */
function evader() {
  if (game.user.isGM) { const t = canvas.tokens?.controlled?.[0]; return t?.actor ? { actor: t.actor, token: t } : null; }
  const c = game.user.character;
  if (c) return { actor: c, token: canvas.tokens?.controlled?.find((t) => t.actor?.id === c.id) ?? c.getActiveTokens?.()[0] ?? null };
  const t = canvas.tokens?.controlled?.find((x) => x.actor?.isOwner); return t ? { actor: t.actor, token: t } : null;
}
/** Evasion posts its own roll message, with HIT/MISS against the card's latest Accuracy roll (tie = miss, natural 2/12). */
async function onEvasion(msg) {
  const ev = evader(); const actor = ev?.actor ?? null; const token = ev?.token ?? null;
  if (!actor) return ui.notifications.warn(game.user.isGM ? "Select the target's token, then click Evasion." : "You have no assigned character (User Configuration) to roll Evasion.");
  let part = null;
  if (isMultiPart(actor)) {
    const prev = pickFor(evasionPartPicks(msg.id), { id: token?.id, actorId: actor.id });
    part = await pickEvasionPart(actor, prev); if (part == null) return;
  }
  const eva = evasionFor(actor, part);
  if (!eva) return ui.notifications.warn(`${actor.name}: no Evasion value.`);
  const accMsg = linkedFor(msg.id).lastAccuracy; const accDoc = accMsg && game.messages.get(accMsg.id);
  const visible = !!accDoc && accDoc.isContentVisible !== false;
  const out = await postCheckRoll(msg, "evasion", eva, {
    actor, who: part == null ? actor.name : `${actor.name} (${sbParts(actor)[part]?.name || "Part"})`,
    extra: { accMsgId: accMsg?.id ?? null, actorId: actor.id, tokenId: token?.id ?? null, part },
    outs: (roll) => { if (!visible) return []; const c = contest(accMsg.flag.roll, roll); return c ? [{ vs: `${accMsg.flag.who ?? "Accuracy"} ${accMsg.flag.roll.total}`, ...c }] : []; },
    note: () => (!accMsg ? "No Accuracy roll on this attack yet." : !visible ? "The Accuracy roll is hidden; the GM sees the result on it." : ""),
  });
  if (accDoc) ui.chat?.updateMessage?.(accDoc); // re-render the Accuracy message so it shows the new outcome
  return out;
}
/** Accuracy message: show HIT/MISS per linked Evasion roll (computed at render time, nothing is written). */
function annotateAccuracy(msg, root) {
  const f = rollFlag(msg); const box = root.querySelector(".sw25-acr-out"); if (!f || !box) return;
  const outs = accuracyOutcomes(f.roll, linkedFor(f.cardId).evasionsFor(msg.id));
  if (outs.length) box.innerHTML = outcomeLinesHTML(outs);
}
async function onDamage(msg) {
  const f = msg.getFlag(SYS, "attack"); const actor = game.actors.get(f.actorId);
  if (!actor?.isOwner) return ui.notifications.warn("Only the attacker rolls damage.");
  if (!f.damage) return ui.notifications.warn("This attack has no damage.");
  await postDamageCard(actor, f, { cardId: msg.id });
  if (f.itemId) await afterWeaponDamage(actor, actor.items.get(f.itemId) ?? null);
}

/** Power roll -> damage card state (power, crits, bonus breakdown) + the dice roll for the message. */
async function rollPowerState(formula, pt, { name, img, label, bonusParts = [] }) {
  const r = await powerRoll(formula, [...pt]);
  const res = r.fakeResult?.terms?.[0]?.results?.map((x) => x.result) ?? [];
  const each = (r.eachPowerResult ?? []).map((v, i) => { const dice = res.slice(i * 2, i * 2 + 2); return { dice, natural: dice.reduce((a, x) => a + x, 0), value: v }; });
  const bonus = (Number(r.powMod) || 0) + (Number(r.halfPowMod) || 0);
  const breakdown = damageBreakdown({ rolls: each, bonusParts, bonus, power: r.power, crit: r.cValue, half: r.halfPow == 1, fumble: r.fumble == 1 });
  const state = { name, img, total: Number(r.powerResult) || 0, label, fumble: r.fumble == 1, breakdown,
    formula: `Power ${r.power} · crit ${r.cValue >= 13 ? "—" : `${r.cValue}+`} · bonus ${bonus >= 0 ? "+" : ""}${bonus}` };
  return { state, rolls: r.fakeResult ? [r.fakeResult] : [] }; // all dice incl. crit rerolls
}

/** Native /rp (and /r p10 ...) chat command: post the same damage card (with Apply panel) as a real roll message. */
export async function postPowerCommand(p, chatData = {}) {
  const speaker = chatData.speaker ?? ChatMessage.getSpeaker();
  const actor = ChatMessage.getSpeakerActor?.(speaker) ?? null;
  const { state, rolls } = await rollPowerState("2d6", powerTableFor(p.formula), {
    name: p.comment || actor?.name || speaker.alias || game.user.name, img: actor?.img ?? null,
    label: p.text, bonusParts: [{ label: "Bonus", value: p.formula.bonus }, { label: p.formula.half ? "Bonus after halving" : "Extra bonus", value: p.formula.halfBonus }],
  });
  if (p.comment && actor) state.name = `${actor.name}: ${p.comment}`;
  const data = { speaker, content: damageCardHTML(state), rolls, flags: { [SYS]: { dmgcard: { actorId: actor?.id ?? null, total: state.total, kind: "physical", pool: "hp", command: p.text } } } };
  return ChatMessage.create(rollMessageData(data, p.mode ? { mode: p.mode } : undefined));
}

/** Roll damage (power table for weapons, dice for stat blocks) and post a NEW damage card. */
export async function postDamageCard(actor, f, { cardId = null } = {}) {
  const d = f.damage; let state, rolls = [];
  if (d.type === "power") {
    ({ state, rolls } = await rollPowerState(d.formula, d.pt, { name: f.state.name, img: f.state.img, label: d.label, bonusParts: d.bonusParts }));
  } else {
    const r = await new Roll(d.formula).evaluate();
    const dice = diceOf(r); const bonus = r.total - dice.reduce((a, x) => a + x, 0);
    const breakdown = damageBreakdown({ rolls: [{ dice, natural: dice.reduce((a, x) => a + x, 0), value: dice.reduce((a, x) => a + x, 0) }], bonusParts: [{ label: "Damage bonus", value: bonus }], bonus, rollLabel: "Damage dice" });
    state = { name: f.state.name, img: f.state.img, total: r.total, label: d.text, formula: d.formula, breakdown, fumble: false };
    rolls = [r];
  }
  const msg = await ChatMessage.create(rollMessageData({ speaker: ChatMessage.getSpeaker({ actor }), content: damageCardHTML(state), rolls, flags: { [SYS]: { dmgcard: { actorId: actor.id, total: state.total, kind: "physical", pool: "hp", cardId, partPicks: evasionPartPicks(cardId) } } } }));
  if (f.itemId) await annotateAttackCard(actor, msg?.id, "damage", actor.items.get(f.itemId) ?? null);
  return msg;
}

/* ---------- damage card Apply panel (client-side state per message) ---------- */
const UI = new Map(); // messageId -> { kind, pool, mults }
const uiFor = (msg) => { const f = msg.getFlag(SYS, "dmgcard") ?? {}; if (!UI.has(msg.id)) UI.set(msg.id, { kind: f.kind ?? "physical", pool: f.pool ?? "hp", mults: {}, parts: {} }); return UI.get(msg.id); };
/** Chosen part for one Apply row: this client's pick, else the part that rolled Evasion on the attack, else core / first alive. null for PCs and single-part blocks. */
function rowPart(msg, st, r) {
  if (!isMultiPart(r.actor)) return null;
  const parts = sbParts(r.actor); const f = msg.getFlag(SYS, "dmgcard") ?? {};
  const picks = { ...(f.partPicks ?? {}), ...evasionPartPicks(f.cardId) }; // Evasion rolled after the damage card counts too
  return clampPart(parts, st.parts?.[r.id] ?? pickFor(picks, { id: r.id, actorId: r.actor.id }));
}
/** Live selected (or targeted) tokens, else the user's assigned character. */
export function applyTargets() {
  const toks = resolveTargetTokens().filter((t) => t.actor);
  if (toks.length) return toks.map((t) => ({ id: t.id, token: t, actor: t.actor, name: t.document?.name ?? t.actor.name, img: t.document?.texture?.src ?? t.actor.img }));
  const c = game.user.character; if (!c) return [];
  const t = c.getActiveTokens?.()[0];
  return [{ id: t?.id ?? `actor-${c.id}`, token: t ?? null, actor: c, name: c.name, img: c.img }];
}
function fillPanel(msg, panel) {
  const f = msg.getFlag(SYS, "dmgcard"); if (!f) return;
  const st = uiFor(msg);
  const rows = applyTargets().map((r) => {
    const part = rowPart(msg, st, r); const defense = targetDefense(r.actor, part);
    return { ...r, defense, weak: weakBonus(r.actor, f.total, defense), parts: part == null ? null : sbParts(r.actor), part };
  });
  panel.innerHTML = applyPanelHTML(f.total, rows, { kind: st.kind, pool: st.pool, mults: st.mults });
}
async function onApply(msg) {
  const f = msg.getFlag(SYS, "dmgcard"); const st = uiFor(msg);
  const rows = applyTargets(); if (!rows.length) return ui.notifications.warn("Select tokens on the map first.");
  const lines = []; const remote = [];
  for (const r of rows) {
    const part = rowPart(msg, st, r); const defense = targetDefense(r.actor, part);
    const a = applyRow(f.total, defense, { kind: st.kind, mult: st.mults[r.id] ?? 1, weak: weakBonus(r.actor, f.total, defense)[st.kind] ?? 0 });
    if (!a.final) { lines.push(`${esc(r.name)}: no change (${esc(a.text)})`); continue; }
    if (r.actor.isOwner) lines.push(`${await applyFinalToActor(r.actor, a.final, { pool: st.pool, heal: a.heal, part })} <small>(${esc(a.text)})</small>`);
    else remote.push({ tokenId: r.token?.id ?? null, actorId: r.actor.id, amount: a.final, pool: st.pool, heal: a.heal, part });
  }
  if (remote.length) {
    if (!gmOnline()) ui.notifications.warn("No GM is connected to apply damage to tokens you don't own.");
    else game.socket.emit(SOCKET, { method: "applyFinal", list: remote });
  }
  return appliedCard(st.kind === "physical" ? "Physical damage applied" : st.kind === "fixed" ? "Fixed damage applied" : "Magic damage applied", lines);
}

function bindAttack(msg, root) {
  root.querySelectorAll(".sw25-ac-btn[data-ac]").forEach((b) => b.addEventListener("click", async (ev) => {
    ev.preventDefault(); b.disabled = true;
    try { const a = b.dataset.ac; await (a === "accuracy" ? onAccuracy(msg) : a === "evasion" ? onEvasion(msg) : onDamage(msg)); }
    catch (err) { console.error("sw25-ce | attack card", err); ui.notifications.error(`SW2.5: ${err.message}`); }
    finally { b.disabled = false; }
  }));
}
function bindDamage(msg, root) {
  const panel = root.querySelector(".sw25-dc-panel"); if (!panel) return;
  fillPanel(msg, panel);
  panel.addEventListener("click", async (ev) => {
    const m = ev.target.closest(".sw25-dc-m"); const go = ev.target.closest(".sw25-dc-go");
    if (m) { ev.preventDefault(); const v = Number(m.dataset.m); if (validMult(v)) { uiFor(msg).mults[m.dataset.id] = v; fillPanel(msg, panel); } }
    if (go) { ev.preventDefault(); go.disabled = true; try { await onApply(msg); } catch (err) { console.error("sw25-ce | apply", err); ui.notifications.error(`SW2.5: apply failed: ${err.message}`); } finally { go.disabled = false; } }
  });
  panel.addEventListener("change", (ev) => {
    const i = ev.target;
    if (i.classList?.contains("sw25-dc-part")) { const v = Number(i.value); if (Number.isInteger(v)) { uiFor(msg).parts[i.dataset.id] = v; fillPanel(msg, panel); } return; }
    if (i.name !== "kind" && i.name !== "pool") return;
    uiFor(msg)[i.name] = i.value; fillPanel(msg, panel);
  });
}
function refreshPanels() {
  document.querySelectorAll(".sw25-dc-panel").forEach((p) => {
    const id = p.closest("[data-message-id]")?.dataset.messageId; const msg = id && game.messages.get(id);
    if (msg) fillPanel(msg, p);
  });
}

export function registerAttackFlow() {
  Hooks.on("renderChatMessageHTML", (msg, el) => {
    const root = el?.[0] ?? el; if (!root?.querySelector) return;
    if (msg.getFlag?.(SYS, "attack") && root.querySelector("[data-sw25-ac]")) bindAttack(msg, root);
    if (msg.getFlag?.(SYS, "dmgcard")) bindDamage(msg, root);
    if (rollFlag(msg)?.kind === "accuracy") annotateAccuracy(msg, root);
  });
  let t = null; const later = () => { clearTimeout(t); t = setTimeout(refreshPanels, 60); };
  Hooks.on("controlToken", later); Hooks.on("targetToken", later); Hooks.on("updateActor", later);
  // Native power-roll command: /rp k10@9+3, /r p10 +3 ... (plain /r 2d6 is not touched). Returning false stops core.
  Hooks.on("chatMessage", (_log, message, chatData) => {
    const p = parsePowerCommand(message); if (!p) return;
    if (p.error) { ui.notifications.warn(`SW2.5: ${p.error}`); return false; }
    postPowerCommand(p, chatData).catch((err) => { console.error("sw25-ce | power roll", err); ui.notifications.error(`SW2.5: power roll failed: ${err.message}`); });
    return false;
  });
}
