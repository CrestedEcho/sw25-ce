/* sw25-ce: PC spell casting flow (Foundry side). Pure parts: spell-pay.mjs, spell-card.mjs.
 * Name click -> description card (never touches MP). Cast -> cast window (metamagic, cost, pay with MP / Mako Stone)
 * -> pay on confirm -> casting roll + damage/healing -> cast card with Apply buttons (live targets) and Apply Effect.
 */
import * as SC from "./spell-cast.mjs";
import { castOptionsFor } from "./spell-ui.mjs";
import { hasPowerObject, rollSpellDamage } from "./spell-power.mjs";
import { usableStones, makoLimit, finalCost, payPlan, stoneAfterPay, mpLine, shortLine } from "./spell-pay.mjs";
import { spellInfo, descCardHTML, castCardHTML, castWindowHTML, rowData, effectData } from "./spell-card.mjs";
import { resolveTargetTokensOrWarn } from "../helpers/target-chips.mjs";
import { toggleBeltSlot, slotsArray } from "../ce7/belt-logic.mjs";

const beltN = () => { try { return Number(game.settings.get("sw25-ce", "beltSlots")) || 6; } catch { return 6; } };

/** Spell name clicked: post the description. MP is never touched. */
export async function postSpellDescription(actor, item) {
  const info = spellInfo(item);
  info.description = await foundry.applications.ux.TextEditor.implementation.enrichHTML(info.description ?? "", { relativeTo: item });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: descCardHTML(info) });
}

/** Cast window. Resolves { base, targets, meta, surcharge, adjust, spendMP, stoneIds } or null (Cancel). */
export async function openCastWindow(actor, item) {
  const info = spellInfo(item);
  const base = Math.max(0, Number(item.system?.mpcost ?? item.system?.basempcost) || 0);
  const opt = await castOptionsFor(actor, item);
  const sur = opt.surcharges?.[0] ? { label: opt.surcharges[0].source ?? "", mp: opt.surcharges[0].mp } : null;
  const stones = usableStones(actor.items);
  const limit = makoLimit(actor.system?._rules?.active);
  const mp = Number(actor.system?.mp?.value) || 0; const mpMax = Number(actor.system?.mp?.max) || 0;
  const content = castWindowHTML({ info, base, mp, mpMax, targets: opt.targets, sur, stones, limit, nTargets: game.user.targets?.size || 1 });
  const read = (f) => {
    const E = f.elements; const ids = [...f.querySelectorAll('input[name="stone"]:checked')].map((x) => x.value);
    return { base, targets: opt.targets ? Number(E.targets?.value) || 1 : 1, meta: Number(E.meta?.value) || 1,
      surcharge: sur && E.out?.checked ? sur.mp : 0, adjust: Number(E.adjust?.value) || 0, spendMP: !!E.spendMP?.checked, stoneIds: ids };
  };
  const plan = (r) => payPlan({ cost: finalCost(r), mp, mpMax, spendMP: r.spendMP, stones: r.stoneIds.map((id) => stones.find((s) => s.id === id)), limit });
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Cast ${item.name}` }, position: { width: 420 }, content, classes: ["sw25-castwin-app"],
    render: (_e, dlg) => {
      const f = dlg.element.querySelector("form") ?? dlg.element;
      const upd = (ev) => {
        const boxes = [...f.querySelectorAll('input[name="stone"]')];
        if (ev?.target?.name === "stone" && boxes.filter((b) => b.checked).length > limit) { ev.target.checked = false; ui.notifications.info(`Only ${limit} Mako Stone${limit > 1 ? "s" : ""} per cast.`); }
        const r = read(f); const p = plan(r);
        f.querySelector(".sw25-cw-cost").textContent = p.cost;
        f.querySelector(".sw25-cw-plan").textContent = mpLine(p);
        const w = f.querySelector(".sw25-cw-warn"); const s = shortLine(p);
        w.hidden = !s; w.textContent = s ? `⚠ ${s} You can still cast (GM's call).` : "";
      };
      f.querySelectorAll(".sw25-cw-step").forEach((b) => b.addEventListener("click", (ev) => {
        ev.preventDefault(); const i = f.querySelector(`input[name="${b.dataset.step}"]`);
        i.value = Math.max(Number(i.min), (Number(i.value) || 0) + Number(b.dataset.d)); upd();
      }));
      f.addEventListener("change", upd); f.addEventListener("input", upd); upd();
    },
    buttons: [
      { action: "cast", label: "Cast", icon: "fa-solid fa-wand-sparkles", default: true, callback: (_e, b) => read(b.form ?? b.closest("form")) },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", callback: () => null },
    ],
    rejectClose: false,
  }).then((r) => (r && typeof r === "object" ? { ...r, stones, limit, mp, mpMax } : null)).catch(() => null);
}

/** Take the payment: actor MP and stone points/stack/deletion (belt slot cleared). */
async function takePayment(actor, p) {
  if (p.fromMP > 0) await actor.update({ "system.mp.value": p.mpAfter });
  for (const s of p.stones) {
    const it = actor.items.get(s.id); if (!it) continue;
    const r = stoneAfterPay(it, s.pay);
    if (r.delete) {
      const b = toggleBeltSlot(slotsArray(actor.system.belt?.slots), it.id, false, beltN());
      if (b.changed) await actor.update({ "system.belt.slots": b.slots });
      await it.delete();
    } else if (r.update) await it.update(r.update);
  }
}

/** Full PC cast: window -> pay -> rolls -> card. */
export async function castSpellFlow(actor, item) {
  if (!actor || !item) return;
  const r = await openCastWindow(actor, item);
  if (!r) return;
  const cost = finalCost(r);
  const p = payPlan({ cost, mp: r.mp, mpMax: r.mpMax, spendMP: r.spendMP, stones: r.stoneIds.map((id) => r.stones.find((s) => s.id === id)), limit: r.limit });
  if (p.short) ui.notifications.warn(`${actor.name}: ${shortLine(p)}`);
  await takePayment(actor, p);
  const info = spellInfo(item);
  info.description = await foundry.applications.ux.TextEditor.implementation.enrichHTML(info.description ?? "", { relativeTo: item });
  const cb = Number(item.system?.checkbase) || 0;
  const castRoll = await new Roll(`2d6 + ${cb}`).evaluate();
  const d = castRoll.dice?.[0]?.total ?? null;
  const cast = { total: castRoll.total, formula: `2d6 (${d ?? "?"}) + Magic Power check ${cb}`, note: d === 12 ? "Natural 12: automatic success" : d === 2 ? "Natural 2: automatic failure" : "" };
  let damage = null;
  if (hasPowerObject(item.system)) {
    damage = await rollSpellDamage({ power: item.system.power, crit: Number(item.system.powerCrit) || 10, magicPower: Number(item.system.powerbase) || 0 }, async () => (await new Roll("2d6").evaluate()).total);
    damage.rate = item.system.power?.rate ?? "?";
  }
  const notes = [];
  if (r.targets > 1) notes.push(`${r.targets} targets`); if (r.meta > 1) notes.push(`metamagic ×${r.meta}`);
  if (r.surcharge) notes.push(`+${r.surcharge} outside influence`); if (r.adjust) notes.push(`${r.adjust > 0 ? "+" : ""}${r.adjust} by hand`);
  const card = castCardHTML(info, { cast, damage, pay: p, actorName: actor.name, costNote: `${cost} MP${notes.length ? ` (${notes.join(", ")})` : ""}` });
  const data = { speaker: ChatMessage.getSpeaker({ actor }), content: card.html, rolls: [castRoll], flags: { "sw25-ce": { spellCast: { itemId: item.id, cost, short: p.short } } } };
  // No damage/healing roll: keep the old default roll mode (GM whisper unless the table changed it).
  if (card.whisperDefault) ChatMessage.applyRollMode(data, globalThis.sw25RollMode?.() ?? game.settings.get("core", "rollMode"));
  return ChatMessage.create(data);
}

/** Apply Effect: add the status (ActiveEffect with statuses[id]) to the live targets; GM handles tokens you don't own. */
export async function applyStatusToTargets(st) {
  const tokens = resolveTargetTokensOrWarn().filter((t) => t.actor);
  if (!tokens.length) return;
  const mine = tokens.filter((t) => t.actor.isOwner); const remote = tokens.filter((t) => !t.actor.isOwner);
  if (remote.length) {
    if (!game.users.some((u) => u.isGM && u.active)) ui.notifications.warn("No GM is connected to add effects to tokens you don't own.");
    else game.socket.emit("system.sw25", { method: "applyStatus", status: st, targetTokens: remote.map((t) => t.id) });
  }
  if (mine.length) return applyStatusToActors(mine.map((t) => t.actor), st);
}
export async function applyStatusToTokenIds(ids, st) {
  const actors = (ids ?? []).map((id) => canvas.tokens.get(id)?.actor).filter(Boolean);
  if (actors.length) return applyStatusToActors(actors, st);
}
async function applyStatusToActors(actors, st) {
  if (!st || !(st.id || st.label)) return;
  const id = String(st.id ?? "").trim();
  const cfg = id ? (CONFIG.statusEffects ?? []).find((s) => s.id === id) : null;
  const eff = { ...st, label: st.label || (cfg?.name ? game.i18n.localize(cfg.name) : id) };
  const data = effectData(eff, { img: cfg?.img ?? (st.buff ? "icons/svg/upgrade.svg" : "icons/svg/aura.svg"), spell: st.spell ?? "" });
  for (const a of actors) await a.createEmbeddedDocuments("ActiveEffect", [data]);
  const esc = foundry.utils.escapeHTML;
  return ChatMessage.create({ content: `<div class="sw25-spelldmg"><b>${st.buff ? "Buff" : "Effect"} applied: ${esc(eff.label)}</b>${eff.rounds ? ` (${eff.rounds} rounds)` : ""}<br>${actors.map((a) => esc(a.name)).join(", ")}</div>` });
}

export function registerSpellCards() {
  globalThis.Handlebars?.registerHelper("sw25SpellRow", (item) => rowData(item ?? {}));
  Hooks.on("renderChatMessageHTML", (_msg, el) => {
    el.querySelectorAll?.("[data-sw25-status]").forEach((b) => b.addEventListener("click", (ev) => {
      ev.preventDefault();
      let st = null; try { st = JSON.parse(b.dataset.sw25Effect || "null"); } catch { st = null; }
      applyStatusToTargets(st ?? { id: b.dataset.sw25Status, label: b.dataset.label, rounds: Number(b.dataset.rounds) || 0 });
    }));
  });
}
