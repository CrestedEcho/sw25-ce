/**
 * sw25-ce attack flow (Foundry glue): attack card (Accuracy / Evasion / Damage buttons) and the damage card
 * (breakdown + Apply panel for the live selected tokens, else the user's own character).
 * Numbers and HTML come from the pure attack-card.mjs / damage-card.mjs.
 */
import { pcAccuracy, pcEvasion, monsterCheck, readRoll, attackCardHTML } from "./attack-card.mjs";
import { damageBreakdown, damageCardHTML, applyPanelHTML, applyRow, validMult } from "./damage-card.mjs";
import { formatDamage } from "./damage-display.mjs";
import { parseSbDamage } from "./sb-play.mjs";
import { powerRoll } from "../helpers/powerroll.mjs";
import { resolveTargetTokens } from "../helpers/target-chips.mjs";
import { targetDefense, weakBonus, applyFinalToActor, appliedCard } from "./apply-damage.mjs";
import { annotateAttackCard, afterWeaponDamage } from "./combat-ui.mjs";

const SYS = "sw25-ce";
const SOCKET = "system.sw25";
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const gmOnline = () => game.users.some((u) => u.isGM && u.active);
const diceOf = (roll) => (roll?.dice?.[0]?.results ?? []).filter((r) => r.active !== false).map((r) => r.result);
const show3d = (roll) => { try { game.dice3d?.showForRoll?.(roll, game.user, true); } catch (_) { /* optional */ } };

function corePart(actor) {
  const parts = actor?.system?.sbView?.parts ?? [];
  return parts.find((p) => p.isCore) ?? parts[0] ?? null;
}
function evasionFor(actor) {
  if (!actor) return null;
  if (actor.type === "character") return pcEvasion(actor.system);
  if (actor.system?.sb) { const p = corePart(actor); return p ? monsterCheck("Evasion", p.evasion) : null; }
  return null;
}

/** Attack data for a PC's Accuracy-tile weapon (null + warning when none). */
async function pcAttackData(actor) {
  const sys = actor.system; const item = sys.itemid ? actor.items.get(sys.itemid) : null;
  if (!item) { ui.notifications.warn(game.i18n.localize("SW25.V2.NeedWeapon")); return null; }
  const label = formatDamage(sys.itempower, sys.itemcvalue, sys.itempowerbase);
  const damage = { type: "power", formula: sys.itempowerformula || "2d6", pt: [...(sys.itempowertable ?? [])], label, bonusParts: item.system._dmgParts ?? [] };
  const desc = item.system.description ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description, { relativeTo: item }) : "";
  const state = { name: item.name, img: item.img, sub: [item.system.category, item.system.usage].filter(Boolean).join(" · "), desc, acc: pcAccuracy(sys, item.system), damageLabel: `${label} (power / crit / bonus)` };
  return { state, damage, itemId: item.id };
}
/** Sheet Damage tile: roll the weapon's damage straight to a damage card. */
export async function rollWeaponDamage(actor) {
  const w = await pcAttackData(actor); if (!w) return;
  const msg = await postDamageCard(actor, w);
  await afterWeaponDamage(actor);
  return msg;
}
/** Post the attack card for a PC's Accuracy-tile weapon, or for a stat-block part (opts.partIndex). */
export async function postAttackCard(actor, { partIndex = null } = {}) {
  let state, damage, itemId = null;
  if (partIndex != null && actor.system?.sb) {
    const p = (actor.system.sbView?.parts ?? [])[partIndex];
    if (!p) return;
    const acc = monsterCheck("Accuracy", p.accuracy);
    if (!acc) return ui.notifications.warn(`${p.name || actor.name}: no Accuracy on the stat block.`);
    const d = parseSbDamage(p.damage);
    damage = d ? { type: "dice", formula: d.formula, text: p.damage } : null;
    state = { name: `${actor.name}${p.name ? `: ${p.name}` : ""}`, img: actor.img, sub: "Attack", acc, damageLabel: d ? `Damage ${p.damage}` : "No damage on the stat block" };
  } else {
    const w = await pcAttackData(actor); if (!w) return;
    ({ state, damage, itemId } = w);
  }
  const sysx = actor.system;
  const resuse = itemId && sysx.resuse ? { id: sysx.resuse, n: Number(sysx.resusequantity) || 0 } : null;
  const flag = { resuse, actorId: actor.id, tokenId: actor.token?.id ?? actor.getActiveTokens?.()[0]?.id ?? null, itemId, partIndex, damage, state };
  const msg = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: attackCardHTML(state), flags: { [SYS]: { attack: flag } } });
  if (itemId) await annotateAttackCard(actor, msg?.id, "hit");
  return msg;
}

async function patchAttack(msg, patch) {
  const f = msg.getFlag(SYS, "attack"); if (!f) return;
  const state = { ...f.state, ...patch };
  return msg.update({ content: attackCardHTML(state), [`flags.${SYS}.attack.state`]: state });
}
/** GM side of "attackUpdate": only the Evasion result may be written by another user. */
export async function attackUpdateFromSocket(data) {
  const msg = game.messages.get(data?.messageId); const p = data?.patch ?? {};
  if (!msg?.getFlag(SYS, "attack") || !p.evaRoll || !Array.isArray(p.evaRoll.dice)) return;
  const evaRoll = readRoll(p.evaRoll.dice.slice(0, 2).map((x) => Math.max(1, Math.min(6, Number(x) || 1))), Number(p.evaRoll.total) || 0);
  const eva = p.eva && Array.isArray(p.eva.parts) ? { label: "Evasion", mod: Number(p.eva.mod) || 0, formula: String(p.eva.formula ?? ""), parts: p.eva.parts.slice(0, 12).map((x) => ({ label: String(x.label ?? ""), value: Number(x.value) || 0 })) } : null;
  return patchAttack(msg, { evaRoll, eva, evaName: String(p.evaName ?? "") });
}

async function roll2d6(chk) {
  const r = await new Roll(chk.formula).evaluate(); show3d(r);
  return readRoll(diceOf(r), r.total);
}

async function onAccuracy(msg) {
  const f = msg.getFlag(SYS, "attack"); const actor = game.actors.get(f.actorId);
  if (!actor?.isOwner || !msg.isOwner) return ui.notifications.warn("Only the attacker rolls Accuracy.");
  if (f.resuse && !f.state.accRoll && !(await spendAmmo(actor, f.resuse))) return;
  return patchAttack(msg, { accRoll: await roll2d6(f.state.acc) });
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
  if (game.user.isGM) return canvas.tokens?.controlled?.[0]?.actor ?? null;
  return game.user.character ?? canvas.tokens?.controlled?.find((t) => t.actor?.isOwner)?.actor ?? null;
}
async function onEvasion(msg) {
  const actor = evaderActor();
  if (!actor) return ui.notifications.warn(game.user.isGM ? "Select the target's token, then click Evasion." : "You have no assigned character (User Configuration) to roll Evasion.");
  const eva = evasionFor(actor);
  if (!eva) return ui.notifications.warn(`${actor.name}: no Evasion value.`);
  const evaRoll = await roll2d6(eva);
  const patch = { eva, evaRoll, evaName: actor.name };
  if (msg.isOwner) return patchAttack(msg, patch);
  if (!gmOnline()) return ui.notifications.warn("No GM is connected to record your Evasion on this card.");
  game.socket.emit(SOCKET, { method: "attackUpdate", messageId: msg.id, patch });
}
async function onDamage(msg) {
  const f = msg.getFlag(SYS, "attack"); const actor = game.actors.get(f.actorId);
  if (!actor?.isOwner) return ui.notifications.warn("Only the attacker rolls damage.");
  if (!f.damage) return ui.notifications.warn("This attack has no damage.");
  await postDamageCard(actor, f);
  if (f.itemId) await afterWeaponDamage(actor);
}

/** Roll damage (power table for weapons, dice for stat blocks) and post a NEW damage card. */
export async function postDamageCard(actor, f) {
  const d = f.damage; let state, rolls = [];
  if (d.type === "power") {
    const r = await powerRoll(d.formula, [...d.pt]);
    const res = r.fakeResult?.terms?.[0]?.results?.map((x) => x.result) ?? [];
    rolls = (r.eachPowerResult ?? []).map((v, i) => { const dice = res.slice(i * 2, i * 2 + 2); return { dice, natural: dice.reduce((a, x) => a + x, 0), value: v }; });
    const bonus = (Number(r.powMod) || 0) + (Number(r.halfPowMod) || 0);
    const breakdown = damageBreakdown({ rolls, bonusParts: d.bonusParts, bonus, power: r.power, crit: r.cValue, half: r.halfPow == 1, fumble: r.fumble == 1 });
    state = { name: f.state.name, img: f.state.img, total: Number(r.powerResult) || 0, label: d.label, fumble: r.fumble == 1, breakdown,
      formula: `Power ${r.power} · crit ${r.cValue >= 13 ? "—" : `${r.cValue}+`} · bonus ${bonus >= 0 ? "+" : ""}${bonus}` };
    if (r.fakeResult) { show3d(r.fakeResult); rolls = [r.fakeResult]; }
  } else {
    const r = await new Roll(d.formula).evaluate(); show3d(r);
    const dice = diceOf(r); const bonus = r.total - dice.reduce((a, x) => a + x, 0);
    const breakdown = damageBreakdown({ rolls: [{ dice, natural: dice.reduce((a, x) => a + x, 0), value: dice.reduce((a, x) => a + x, 0) }], bonusParts: [{ label: "Damage bonus", value: bonus }], bonus, rollLabel: "Damage dice" });
    state = { name: f.state.name, img: f.state.img, total: r.total, label: d.text, formula: d.formula, breakdown, fumble: false };
    rolls = [r];
  }
  const msg = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: damageCardHTML(state), rolls, flags: { [SYS]: { dmgcard: { actorId: actor.id, total: state.total, kind: "physical", pool: "hp" } } } });
  if (f.itemId) await annotateAttackCard(actor, msg?.id, "damage");
  return msg;
}

/* ---------- damage card Apply panel (client-side state per message) ---------- */
const UI = new Map(); // messageId -> { kind, pool, mults }
const uiFor = (msg) => { const f = msg.getFlag(SYS, "dmgcard") ?? {}; if (!UI.has(msg.id)) UI.set(msg.id, { kind: f.kind ?? "physical", pool: f.pool ?? "hp", mults: {} }); return UI.get(msg.id); };
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
  const rows = applyTargets().map((r) => { const defense = targetDefense(r.actor); return { ...r, defense, weak: weakBonus(r.actor, f.total, defense) }; });
  panel.innerHTML = applyPanelHTML(f.total, rows, { kind: st.kind, pool: st.pool, mults: st.mults });
}
async function onApply(msg) {
  const f = msg.getFlag(SYS, "dmgcard"); const st = uiFor(msg);
  const rows = applyTargets(); if (!rows.length) return ui.notifications.warn("Select tokens on the map first.");
  const lines = []; const remote = [];
  for (const r of rows) {
    const defense = targetDefense(r.actor);
    const a = applyRow(f.total, defense, { kind: st.kind, mult: st.mults[r.id] ?? 1, weak: weakBonus(r.actor, f.total, defense)[st.kind] ?? 0 });
    if (!a.final) { lines.push(`${esc(r.name)}: no change (${esc(a.text)})`); continue; }
    if (r.actor.isOwner) lines.push(`${await applyFinalToActor(r.actor, a.final, { pool: st.pool, heal: a.heal })} <small>(${esc(a.text)})</small>`);
    else remote.push({ tokenId: r.token?.id ?? null, actorId: r.actor.id, amount: a.final, pool: st.pool, heal: a.heal });
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
    const i = ev.target; if (i.name !== "kind" && i.name !== "pool") return;
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
  });
  let t = null; const later = () => { clearTimeout(t); t = setTimeout(refreshPanels, 60); };
  Hooks.on("controlToken", later); Hooks.on("targetToken", later); Hooks.on("updateActor", later);
}
