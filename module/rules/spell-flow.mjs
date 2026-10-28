/* sw25-ce: PC spell casting flow (Foundry side). Pure parts: spell-pay.mjs, spell-card.mjs.
 * Name click -> description card (never touches MP). Cast -> cast window (metamagic, cost, pay with MP / Mako Stone)
 * -> pay on confirm -> casting roll + damage/healing -> cast card with Apply buttons (live targets) and Apply Effect.
 */
import { spellMpValue } from "./spell-mp.mjs";
import { usesSbPool, sbPoolInfo, sbMagicPower, sbSpellItem, sbCastExtraHTML, powerRowFor, spellHasPower } from "./sb-spell.mjs";
import { spellMeta, defaultCost, applySbCost } from "./sb-cast.mjs";
import { castIsWhisper } from "./sb-play.mjs";
import { powerLookup } from "./power-lookup.mjs";
import { rpt } from "../sw25.mjs";
import * as SC from "./spell-cast.mjs";
import { castOptionsFor } from "./spell-ui.mjs";
import { hasPowerObject, rollSpellDamage } from "./spell-power.mjs";
import { rollMessageData } from "./dice-fx.mjs";
import { usableStones, makoLimit, finalCost, payPlan, stoneAfterPay, mpLine, shortLine } from "./spell-pay.mjs";
import { conditionFor } from "./conditions.mjs";
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

/**
 * Cast window. Resolves { base, targets, meta, surcharge, adjust, spendMP, stoneIds, part, hp, rank } or null (Cancel).
 * sb = stat-block context ({ pool, meta }) -> MP from a stat-block part (picker when multi-part), no Mako Stones,
 * Spend MP always ticked, HP cost / deity rank rows when the spell lists them.
 */
export async function openCastWindow(actor, item, sb = null) {
  const info = spellInfo(item);
  let base = Math.max(0, Number(spellMpValue(item.system ?? {})) || 0);
  if (sb?.meta?.cost?.base != null && !(base > 0)) base = Number(sb.meta.cost.base) || 0;
  const opt = await castOptionsFor(actor, item);
  const sur = opt.surcharges?.[0] ? { label: opt.surcharges[0].source ?? "", mp: opt.surcharges[0].mp } : null;
  const stones = sb ? [] : usableStones(actor.items);
  const limit = sb ? 1 : makoLimit(actor.system?._rules?.active);
  const poolOf = (f) => (sb ? sb.pool.choices[Number(f?.elements?.part?.value ?? sb.pool.index)] ?? sb.pool : null);
  const mp0 = sb ? sb.pool.mp : Number(actor.system?.mp?.value) || 0; const mpMax0 = sb ? sb.pool.mpMax : Number(actor.system?.mp?.max) || 0;
  const esc = foundry.utils.escapeHTML;
  const extraHTML = sb ? sbCastExtraHTML({ pool: sb.pool, hp: sb.meta?.cost?.hp ?? 0, ranks: sb.meta?.ranks ?? null }, esc) : "";
  const content = castWindowHTML({ info, base, mp: mp0, mpMax: mpMax0, targets: opt.targets, sur, stones, limit, nTargets: game.user.targets?.size || 1,
    ...(sb ? { poolLabel: `${sb.pool.name || "Stat block"} MP`, spendLabel: "Spend MP (stat block)", allowNoMP: true, extraHTML } : {}) });
  const read = (f) => {
    const E = f.elements; const ids = [...f.querySelectorAll('input[name="stone"]:checked')].map((x) => x.value);
    const rank = E.rank?.value ?? null; const b = sb && rank ? defaultCost(sb.meta, rank) : base;
    return { base: b, targets: opt.targets ? Number(E.targets?.value) || 1 : 1, meta: Number(E.meta?.value) || 1,
      surcharge: sur && E.out?.checked ? sur.mp : 0, adjust: Number(E.adjust?.value) || 0, spendMP: !!E.spendMP?.checked, stoneIds: ids,
      part: E.part ? Number(E.part.value) : (sb?.pool.index ?? null), hp: E.hp ? Math.max(0, Number(E.hp.value) || 0) : 0, rank };
  };
  const plan = (r, f) => { const pl = poolOf(f);
    return payPlan({ cost: finalCost(r), mp: pl ? pl.mp : mp0, mpMax: sb ? null : mpMax0, spendMP: r.spendMP, stones: r.stoneIds.map((id) => stones.find((s) => s.id === id)), limit }); };
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Cast ${item.name}` }, position: { width: 420 }, content, classes: ["sw25-castwin-app"],
    render: (_e, dlg) => {
      const f = dlg.element.querySelector("form") ?? dlg.element;
      const upd = (ev) => {
        const boxes = [...f.querySelectorAll('input[name="stone"]')];
        if (ev?.target?.name === "stone" && boxes.filter((b) => b.checked).length > limit) { ev.target.checked = false; ui.notifications.info(`Only ${limit} Mako Stone${limit > 1 ? "s" : ""} per cast.`); }
        const r = read(f); const p = plan(r, f);
        f.querySelector(".sw25-cw-cost").textContent = p.cost;
        const pl = poolOf(f); const pe = f.querySelector(".sw25-cw-pool"); if (pl && pe) pe.textContent = `${pl.mp} / ${pl.mpMax}`;
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
  }).then((r) => {
    if (!r || typeof r !== "object") return null;
    const pl = sb ? (sb.pool.choices[r.part] ?? sb.pool) : null;
    return { ...r, stones, limit, mp: pl ? pl.mp : mp0, mpMax: sb ? null : mpMax0 };
  }).catch(() => null);
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
/** Stat block payment: MP (and HP cost) from the chosen part's current values (max values never change). */
async function takeSbPayment(actor, p, r) {
  const raw = actor._source.system?.sb ?? {}; const view = actor.system.sbView ?? {};
  const rawParts = Array.isArray(raw.parts) ? raw.parts : Object.values(raw.parts ?? {});
  const out = applySbCost(rawParts, view.parts ?? [], { mp: p.fromMP, hp: r.hp || 0, partIndex: r.part });
  if (out.index >= 0 && (p.fromMP || r.hp)) await actor.update({ "system.sb.parts": out.parts });
  return out;
}
/** Power-table row for spells that only list a Power rate (journal row if filled, else the bundled community table). */
const lookupRow = (power) => powerRowFor(power, (rate, t) => powerLookup(rate, t, { journal: rptJournal() }));
const rptJournal = () => rpt;

/**
 * Full cast: window -> pay -> rolls -> card. PCs and stat blocks share it.
 * opts.sb = { skill: unique magic skill (raw), spellDoc } for stat-block casting; an owned spell on a monster/NPC
 * with stat-block parts (old monster sheet) is detected and pays from the stat block too.
 */
export async function castSpellFlow(actor, item, opts = {}) {
  if (!actor || !item) return;
  const isSb = !!opts.sb || usesSbPool(actor);
  let sb = null;
  if (isSb && usesSbPool(actor)) {
    const raw = actor._source.system?.sb ?? {}; const view = actor.system.sbView ?? {};
    const rawParts = Array.isArray(raw.parts) ? raw.parts : Object.values(raw.parts ?? {});
    sb = { pool: sbPoolInfo(rawParts, view.parts ?? [], opts.sb?.partIndex ?? null), meta: spellMeta(opts.sb?.spellDoc ?? item), mpow: opts.sb?.skill ? sbMagicPower(opts.sb.skill) : null };
    if (sb.mpow) item = sbSpellItem(item, sb.mpow);
  } else if (opts.sb?.skill) {
    const mpow = sbMagicPower(opts.sb.skill); if (mpow) item = sbSpellItem(item, mpow);
  }
  const r = await openCastWindow(actor, item, sb);
  if (!r) return;
  const cost = finalCost(r);
  const p = payPlan({ cost, mp: r.mp, mpMax: r.mpMax, spendMP: r.spendMP, stones: r.stoneIds.map((id) => r.stones.find((s) => s.id === id)), limit: r.limit });
  if (p.short) ui.notifications.warn(`${actor.name}: ${shortLine(p)}`);
  let partName = null;
  if (sb) { const out = await takeSbPayment(actor, p, r); if (sb.pool.choices.length > 1) partName = sb.pool.choices[out.index]?.name ?? null; }
  else await takePayment(actor, p);
  const info = spellInfo(item);
  info.description = await foundry.applications.ux.TextEditor.implementation.enrichHTML(info.description ?? "", { relativeTo: item instanceof foundry.abstract.Document ? item : actor });
  const cb = Number(item.system?.checkbase) || 0;
  const castRoll = await new Roll(`2d6 + ${cb}`).evaluate();
  const d = castRoll.dice?.[0]?.total ?? null;
  const cast = { total: castRoll.total, formula: `2d6 (${d ?? "?"}) + Magic Power ${cb}`, note: d === 12 ? "Natural 12: automatic success" : d === 2 ? "Natural 2: automatic failure" : "" };
  let damage = null; const dmgRolls = []; // power roll + every crit reroll, attached so they show as dice
  if (hasPowerObject(item.system) || (isSb && spellHasPower(item.system))) {
    damage = await rollSpellDamage({ power: item.system.power, crit: Number(item.system.powerCrit) || 10, magicPower: Number(item.system.powerbase) || 0, fallbackRow: lookupRow(item.system.power) }, async () => { const x = await new Roll("2d6").evaluate(); dmgRolls.push(x); return x.total; });
    damage.rate = item.system.power?.rate ?? "?";
  }
  const notes = [];
  if (r.targets > 1) notes.push(`${r.targets} targets`); if (r.meta > 1) notes.push(`metamagic ×${r.meta}`);
  if (r.surcharge) notes.push(`+${r.surcharge} outside influence`); if (r.adjust) notes.push(`${r.adjust > 0 ? "+" : ""}${r.adjust} by hand`);
  if (r.rank) notes.push(`deity rank ${r.rank}`); if (r.hp) notes.push(`+ HP ${r.hp}`); if (partName) notes.push(`paid by ${partName}`);
  const card = castCardHTML(info, { cast, damage, pay: p, actorName: actor.name, costNote: `${cost} MP${notes.length ? ` (${notes.join(", ")})` : ""}` });
  // A real roll message: core dice sound + Dice So Nice for the cast and damage dice, roll mode respected.
  const data = rollMessageData({ speaker: ChatMessage.getSpeaker({ actor }), content: card.html, rolls: [castRoll, ...dmgRolls], flags: { "sw25-ce": { spellCast: { itemId: item.id, cost, short: p.short, statBlock: isSb } } } });
  // Stat blocks: spells without a damage/healing roll go to the GM only unless the GM set that spell to Public.
  if (isSb && castIsWhisper({ name: item.name, power: damage ? item.system.power : null }, actor.getFlag?.("sw25-ce", "sbSpellGmOnly") ?? {})) {
    data.content = `<div class="sw25-gmonly"><i class="fas fa-eye-slash"></i> Whisper · GM only</div>` + data.content;
    data.whisper = ChatMessage.getWhisperRecipients("GM").map((u) => u.id); delete data.blind;
  }
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
  const cond = conditionFor(st.id) ?? conditionFor(st.label);
  const eff = { ...st, label: st.label || (cond ? game.i18n.localize(`SW25.Condition.${cond.id}.Name`) : st.id) };
  const data = effectData(eff, { spell: st.spell ?? "", combat: game.combat?.started ? game.combat : null });
  for (const a of actors) await a.createEmbeddedDocuments("ActiveEffect", [foundry.utils.deepClone(data)]);
  const esc = foundry.utils.escapeHTML;
  return ChatMessage.create({ content: `<div class="sw25-spelldmg"><b>${st.buff ? "Buff" : "Effect"} applied: ${esc(data.name)}</b>${eff.rounds ? ` (${eff.rounds} rounds)` : ""}<br>${actors.map((a) => esc(a.name)).join(", ")}</div>` });
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
