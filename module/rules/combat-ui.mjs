/**
 * sw25-ce combat rule UI (hooks only): feat declarations, turn/round resets.
 * Pure state logic lives in combat-state.mjs.
 */
import * as CS from "./combat-state.mjs";
import * as RE from "./engine.mjs";

const SYS = CS.SYS;
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
  const data = { phase, actorId: actor.id, itemId: w.id, lines, buttons: [] };
  return data;
}
/** Store attack-card extras on a message (rendered by renderChatMessageHTML). */
export async function annotateAttackCard(actor, messageId, phase, item = null) {
  const msg = messageId ? game.messages.get(messageId) : null;
  if (!msg || !msg.isOwner) return;
  const data = attackCardData(actor, phase, item);
  if (!data || (!data.lines.length && !data.buttons.length)) return;
  await msg.setFlag(SYS, "attackCard", data);
}
function renderAttackCard(msg, el) {
  const d = msg.getFlag?.(SYS, "attackCard");
  if (!d || el.querySelector(".sw-attack-extras")) return;
  const lines = (d.lines ?? []).map((l) => `<div>${esc(l)}</div>`).join("");
  const btns = (d.buttons ?? []).map((b, i) => `<button type="button" class="sw-attack-btn" data-i="${i}" ${b.used ? "disabled" : ""}>${esc(b.label)}${b.used ? " (used)" : ""}</button>`).join("");
  const box = `<div class="sw-attack-extras" style="border-top:1px dashed #999;margin-top:4px;padding-top:2px;font-size:0.85em">${lines}${btns}</div>`;
  (el.querySelector(".message-content") ?? el).insertAdjacentHTML("beforeend", box);
  el.querySelectorAll(".sw-attack-btn").forEach((b) => b.addEventListener("click", (ev) => { ev.preventDefault(); onAttackButton(msg, d, Number(b.dataset.i)); }));
}
export const ATTACK_BUTTONS = {};
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
