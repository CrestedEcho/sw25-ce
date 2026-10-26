/**
 * sw25-ce combat rule UI (hooks only): feat declarations, turn/round resets.
 * Pure state logic lives in combat-state.mjs.
 */
import * as CS from "./combat-state.mjs";
import * as RE from "./engine.mjs";
import { applyDamageToTargets } from "./apply-damage.mjs";

const SYS = CS.SYS;
const loc = (k, fb, data) => { const i = globalThis.game?.i18n; const t = i?.has?.(k) ? (data ? i.format(k, data) : i.localize(k)) : fb; return data ? String(t).replace(/\{(\w+)\}/g, (m, x) => data[x] ?? m) : t; };
const esc = (s) => foundry.utils.escapeHTML?.(String(s ?? "")) ?? String(s ?? "");

export async function setDeclare(actor, slugs, on) {
  const next = CS.toggleDeclare(actor.getFlag(SYS, "declare"), slugs, on);
  return actor.setFlag(SYS, "declare", next);
}

/** Call after a weapon damage roll: attack-scoped declarations end (risk lingers to next turn). */
export async function afterWeaponDamage(actor) {
  if (!actor?.isOwner) return;
  // counters spent by the first melee attack of the turn (Dodge)
  const w = actor.system?.itemid ? actor.items.get(actor.system.itemid) : null;
  const spend = (actor.system?._rules?.counters ?? []).filter((d) => d.firstMelee).map((d) => d.name);
  const cur0 = actor.getFlag(SYS, "counters") ?? {};
  if (spend.some((n) => cur0[n]) && w && !RANGED.includes(String(w.system.category ?? "").toLowerCase()))
    await actor.setFlag(SYS, "counters", CS.resetCounters(cur0, actor.system._rules.counters, { names: spend }));
  const cur = CS.declState(actor.getFlag(SYS, "declare"));
  if (!cur.active.length) return;
  await actor.setFlag(SYS, "declare", CS.consumeAttack(cur));
}

const RANGED = ["bow", "crossbow", "gun", "throw", "thrown"];
/** Lines + buttons for an attack chat card, computed when the card is created (pure-ish; reads actor rules). */
export function attackCardData(actor, phase, item = null) {
  const sd = actor?.system ?? {};
  const eng = sd._rules;
  const w = item ?? (sd.itemid ? actor.items.get(sd.itemid) : null);
  if (!eng || !w) return null;
  const weapon = { checkskill: w.system.checkskill, category: w.system.category };
  const ranged = RANGED.includes(String(weapon.category ?? "").toLowerCase());
  const lines = [];
  if (ranged && eng.flags?.noStray) lines.push("Targeting: this attack never strays into a skirmish.");
  const links = [];
  if (phase === "hit") { const cl = coverLines(actor); lines.push(...cl); if (cl.length) { const u = rulesEntryUuid("cover"); if (u) links.push({ uuid: u, label: "Rules: Cover" }); } }
  const buttons = [];
  if (phase === "hit") for (const x of RE.extraAttacks(eng.active, { category: weapon.category, usage: w.system.usage, ranged })) {
    const left = x.maxPerTurn == null ? x.count : Math.min(x.count, x.maxPerTurn - extraUsedThisTurn(actor, x.source));
    for (let k = 0; k < left; k++) buttons.push({ label: `${x.source}: extra attack`, action: "extraAttack", used: false,
      source: x.source, sameTarget: x.sameTarget, noAccuracyPenalty: x.noAccuracyPenalty, maxPerTurn: x.maxPerTurn });
  }
  const data = { phase, actorId: actor.id, itemId: w.id, lines, buttons, links };
  return data;
}
/** Store attack-card extras on a message (rendered by renderChatMessageHTML). */
export async function annotateAttackCard(actor, messageId, phase, item = null) {
  const msg = messageId ? game.messages.get(messageId) : null;
  if (!msg || !msg.isOwner) return;
  const data = attackCardData(actor, phase, item);
  if (data && phase === "damage") { const t = Number(msg.flags?.sw25?.total); if (Number.isFinite(t)) data.applyDamage = t; }
  if (!data || (!data.lines.length && !data.buttons.length && data.applyDamage == null)) return;
  await msg.setFlag(SYS, "attackCard", data);
}
function renderAttackCard(msg, el) {
  const d = msg.getFlag?.(SYS, "attackCard");
  if (!d || el.querySelector(".sw-attack-extras")) return;
  const lines = (d.lines ?? []).map((l) => `<div>${esc(l)}</div>`).join("");
  const btns = (d.buttons ?? []).map((b, i) => `<button type="button" class="sw-attack-btn" data-i="${i}" ${b.used ? "disabled" : ""}>${esc(b.label)}${b.used ? " (used)" : ""}</button>`).join("");
  const links = (d.links ?? []).map((l) => `<div><a class="content-link" draggable="true" data-link data-uuid="${esc(l.uuid)}" data-type="JournalEntry"><i class="fas fa-book-open"></i> ${esc(l.label)}</a></div>`).join("");
  const apply = d.applyDamage != null ? `<button type="button" class="sw-attack-apply" data-tooltip="${esc(loc("SW25.Card.ApplyDamageTip", "Physical damage: the target's Defense is subtracted. Applies to the tokens you have targeted when you click."))}">${esc(loc("SW25.Card.ApplyDamage", "Apply damage {n}", { n: Number(d.applyDamage) }))}</button>` : "";
  const box = `<div class="sw-attack-extras" style="border-top:1px dashed #999;margin-top:4px;padding-top:2px;font-size:0.85em">${lines}${links}${btns}${apply}</div>`;
  el.querySelector(".sw-attack-apply")?.addEventListener("click", (ev) => { ev.preventDefault(); applyDamageToTargets(d.applyDamage, "physical"); });
  (el.querySelector(".message-content") ?? el).insertAdjacentHTML("beforeend", box);
  el.querySelectorAll(".sw-attack-btn").forEach((b) => b.addEventListener("click", (ev) => { ev.preventDefault(); onAttackButton(msg, d, Number(b.dataset.i)); }));
}
/** Cover I (defense.coverAlly): text only. Lists other combatants whose cover declaration is still running. */
/** UUID of a rules-bible entry by slug, if a sw25-rules pack (system or world) is loaded and indexed. */
function rulesEntryUuid(slug) {
  const pack = game.packs?.find((p) => p.metadata?.name === "sw25-rules" && p.documentName === "JournalEntry");
  const e = pack?.index?.find((x) => x.flags?.["sw25-ce"]?.slug === slug || x.name?.toLowerCase() === slug);
  return e ? (e.uuid ?? `Compendium.${pack.collection}.JournalEntry.${e._id}`) : null;
}
function coverLines(attacker) {
  const out = [];
  const seen = new Set();
  for (const c of game.combat?.combatants ?? []) {
    const a = c.actor;
    if (!a || a.id === attacker.id || seen.has(a.id)) continue;
    seen.add(a.id);
    const st = CS.declState(a.getFlag(SYS, "declare"));
    const covers = (a.system?._rules?.active ?? []).filter((r) => r.kind === "defense" && r.target === "coverAlly");
    for (const r of covers) {
      const slugs = CS.declaredSlugs([r]);
      if (!slugs.some((x) => st.lingering.includes(x) || st.active.includes(x))) continue;
      out.push(`${r.source?.name ?? "Cover"}: ${a.name} is covering an ally. If the target is that ally (same area, first time this round), ${a.name} is hit instead: no Evasion check, the attack always lands.`);
    }
  }
  return out;
}
export const ATTACK_BUTTONS = {};
function turnKey() { const c = game.combat; return c ? `${c.id}:${c.round}:${c.turn}` : "none"; }
function extraUsedThisTurn(actor, source) {
  const f = actor.getFlag(SYS, "extraAttacks");
  return f?.turn === turnKey() ? Number(f.used?.[source]) || 0 : 0;
}
ATTACK_BUTTONS.extraAttack = async (msg, d, i) => {
  const b = d.buttons[i];
  const actor = game.actors.get(d.actorId);
  if (!actor?.isOwner || b.used) return;
  if (b.maxPerTurn != null && extraUsedThisTurn(actor, b.source) >= b.maxPerTurn)
    return ui.notifications.warn(`${b.source}: already used this turn.`);
  const f = actor.getFlag(SYS, "extraAttacks");
  const used = f?.turn === turnKey() ? { ...(f.used ?? {}) } : {};
  used[b.source] = (Number(used[b.source]) || 0) + 1;
  await actor.setFlag(SYS, "extraAttacks", { turn: turnKey(), used });
  const buttons = d.buttons.map((x, k) => (k === i ? { ...x, used: true } : x));
  await msg.setFlag(SYS, "attackCard", { ...d, buttons });
  const w = actor.items.get(d.itemId);
  const bits = [b.sameTarget ? "same target" : null, b.noAccuracyPenalty ? "no accuracy penalty" : null].filter(Boolean).join(", ");
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p><b>${esc(b.source)}</b>: extra attack with ${esc(w?.name ?? "the weapon")}${bits ? ` (${bits})` : ""}. Roll its hit check from the sheet.</p>` });
};
async function onAttackButton(msg, d, i) {
  const b = d.buttons?.[i];
  const fn = b && ATTACK_BUTTONS[b.action];
  if (fn) await fn(msg, d, i);
}

function counterBadges(actor, root) {
  const defs = actor.system?._rules?.counters ?? [];
  const vals = actor.getFlag(SYS, "counters") ?? {};
  for (const d of defs) {
    const li = d.sourceId && root.querySelector(`li.item[data-item-id="${d.sourceId}"]`);
    if (!li || li.querySelector(`.sw-counter[data-name="${d.name}"]`)) continue;
    const n = Number(vals[d.name]) || 0;
    const tip = `${d.name}${d.on ? ` (+1 on ${d.on})` : ""}${d.reset ? `; resets each ${d.reset}` : ""}${d.firstMelee ? "; spent by your first melee attack" : ""}`;
    (li.querySelector(".item-name") ?? li).insertAdjacentHTML("beforeend", `<span class="sw-counter" data-name="${esc(d.name)}" title="${esc(tip)}"
      style="flex:0 0 auto;margin:0 4px;white-space:nowrap;font-size:0.85em;border:1px solid #888;border-radius:3px;padding:0 3px">
      <a data-d="-1"><i class="fas fa-minus"></i></a> <b>${n}</b> <a data-d="1"><i class="fas fa-plus"></i></a></span>`);
    li.querySelectorAll(`.sw-counter[data-name="${d.name}"] a`).forEach((a) => a.addEventListener("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      if (actor.isOwner) actor.setFlag(SYS, "counters", CS.bumpCounter(actor.getFlag(SYS, "counters"), d.name, Number(a.dataset.d)));
    }));
  }
}

function declareChips(actor, root) {
  for (const li of root.querySelectorAll("li.item[data-item-id]")) {
    const item = actor.items.get(li.dataset.itemId);
    if (!item || item.type !== "combatability") continue;
    const slugs = CS.declaredSlugs(item.system?.rules);
    if (!slugs.length || li.querySelector(".sw-declare")) continue;
    const on = CS.isDeclared(actor.getFlag(SYS, "declare"), slugs);
    const ling = !on && CS.declState(actor.getFlag(SYS, "declare")).lingering.some((s) => slugs.includes(s));
    const title = on ? "Declared for the next attack (click to cancel)" : ling ? "Used this round: risk lasts until your next turn" : "Declare for the next attack";
    const html = `<a class="sw-declare" data-slugs="${esc(slugs.join(","))}" title="${esc(title)}"
      style="flex:0 0 auto;margin:0 4px;padding:0 4px;border:1px solid #888;border-radius:3px;font-size:0.8em;${on ? "background:#c33;color:#fff" : ling ? "background:#eaa" : ""}">${on ? "Declared" : ling ? "Risk" : "Declare"}</a>`;
    (li.querySelector(".item-name") ?? li).insertAdjacentHTML("beforeend", html);
    const a = li.querySelector(".sw-declare");
    a.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); if (actor.isOwner) setDeclare(actor, slugs, !on); });
  }
}

export function registerCombatUI() {
  Hooks.on("renderActorSheet", (app, html) => {
    const actor = app.actor;
    if (!actor || actor.type !== "character") return;
    const root = html[0] ?? html;
    if (root?.querySelectorAll) { declareChips(actor, root); counterBadges(actor, root); }
  });
  Hooks.on("renderChatMessageHTML", (msg, el) => renderAttackCard(msg, el));
  // Rank limits warn, never block.
  Hooks.on("updateItem", (item, changes, options, userId) => {
    if (userId !== game.user.id || !["weapon", "armor"].includes(item.type) || !item.actor) return;
    if (foundry.utils.getProperty(changes, "system.equip") !== true) return;
    const eng = item.actor.system?._rules;
    if (!eng) return;
    const r = RE.rankCheck(eng.active, { type: item.type, category: item.system.category, rank: item.system.rank });
    if (!r.ok) ui.notifications.warn(`${item.actor.name}: ${item.name} is rank ${r.needed}; no matching Proficiency feat (equipped anyway).`);
  });
  // Turn start: the new combatant's declarations and lingering risks end.
  Hooks.on("updateCombat", async (combat, changes) => {
    if (!game.user.isGM || game.user.id !== game.users.activeGM?.id) return;
    if (!("turn" in changes) && !("round" in changes)) return;
    const actor = combat.combatant?.actor;
    if (actor && actor.getFlag(SYS, "declare")) await actor.setFlag(SYS, "declare", CS.turnStart());
    // reset:round counters clear when a new round starts
    if ("round" in changes) for (const c of combat.combatants) {
      const a = c.actor; const defs = a?.system?._rules?.counters ?? [];
      const cur = a?.getFlag(SYS, "counters");
      if (!cur || !defs.some((d) => d.reset === "round" && cur[d.name])) continue;
      await a.setFlag(SYS, "counters", CS.resetCounters(cur, defs, { reset: "round" }));
    }
  });
}
