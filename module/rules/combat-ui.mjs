/**
 * sw25-ce combat rule UI (hooks only): feat declarations, turn/round resets.
 * Pure state logic lives in combat-state.mjs.
 */
import * as CS from "./combat-state.mjs";

const SYS = CS.SYS;
const esc = (s) => foundry.utils.escapeHTML?.(String(s ?? "")) ?? String(s ?? "");

export async function setDeclare(actor, slugs, on) {
  const next = CS.toggleDeclare(actor.getFlag(SYS, "declare"), slugs, on);
  return actor.setFlag(SYS, "declare", next);
}

/** Call after a weapon damage roll: attack-scoped declarations end (risk lingers to next turn). */
export async function afterWeaponDamage(actor) {
  if (!actor?.isOwner) return;
  const cur = CS.declState(actor.getFlag(SYS, "declare"));
  if (!cur.active.length) return;
  await actor.setFlag(SYS, "declare", CS.consumeAttack(cur));
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
    if (root?.querySelectorAll) declareChips(actor, root);
  });
  // Turn start: the new combatant's declarations and lingering risks end.
  Hooks.on("updateCombat", async (combat, changes) => {
    if (!game.user.isGM || game.user.id !== game.users.activeGM?.id) return;
    if (!("turn" in changes) && !("round" in changes)) return;
    const actor = combat.combatant?.actor;
    if (actor && actor.getFlag(SYS, "declare")) await actor.setFlag(SYS, "declare", CS.turnStart());
  });
}
