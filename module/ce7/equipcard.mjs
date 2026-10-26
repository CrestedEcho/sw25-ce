import { toggleBeltSlot, usesOf, consumePlan, hasFormula, slotsArray, isConsumable, isLimited, sanitizeBelt } from "./belt-logic.mjs";
/**
 * sw25-ce 3.0.0-ce.7 — Equipment Card, Combat-tab Feats / Consumables Belt,
 * portrait framing, class-rule framework hooks and the one-time ce.7 migration.
 * Everything here is character-only and keyed off data on the actor/items;
 * the slot map is kept in sync with the legacy `system.equip` flags so all
 * existing Defense / Evasion maths keep working.
 */
import { sw25MinStrMultFor } from "../documents/actor.mjs";
import { syncGrants } from "../rules/grants.mjs";

const SYS = "sw25-ce";
const ICON = (n) => `systems/${SYS}/assets/equipcard/${n}.svg`;

export const SLOTS = {
  head: { icon: "lorc_visored-helm", part: "head" },
  face: { icon: "lorc_domino-mask", part: "face" },
  ear: { icon: "delapouite_human-ear", part: "ear" },
  neck: { icon: "delapouite_necklace-display", part: "neck" },
  back: { icon: "delapouite_cape", part: "back" },
  armor: { icon: "lorc_breastplate" },
  shield: { icon: "sbed_shield" },
  rhand: { icon: "lorc_hand", part: "rhand" },
  lhand: { icon: "lorc_hand", part: "lhand", mirror: true },
  waist: { icon: "lorc_belt-buckles", part: "waist" },
  mainHand: { icon: "delapouite_sword-brandish" },
  offHand: { icon: "lorc_palm" },
  feet: { icon: "lorc_boots", part: "leg" },
};
const LEFT = ["head", "face", "ear", "neck", "back"];
const RIGHT = ["armor", "shield", "rhand", "lhand", "waist"];
const BOTTOM = ["mainHand", "offHand", "feet"];
const AUTO_ORDER = ["mainHand", "offHand", "armor", "shield", ...LEFT, "rhand", "lhand", "waist", "feet"];
const FEAT_LEVELS = [1, 3, 5, 7, 9, 11, 13, 15];

const isPC = (actor) => actor?.type === "character" && !actor.system?.toFellow;
export const is2H = (item) => item?.type === "weapon" && /2H/.test(String(item.system?.usage ?? ""));

/** Can `item` go into `slot`? */
export function slotAccepts(slot, item) {
  if (!item) return false;
  const s = item.system ?? {};
  switch (slot) {
    case "armor": return item.type === "armor" && ["metalarmor", "nonmetalarmor"].includes(s.category);
    case "shield": return item.type === "armor" && s.category === "shield";
    case "mainHand": return item.type === "weapon";
    case "offHand": return item.type === "weapon" || (item.type === "armor" && s.category === "shield");
    case "other": return item.type === "accessory";
    default: {
      const def = SLOTS[slot];
      if (!def?.part || item.type !== "accessory") return false;
      const p = s.accpart ?? "";
      if (!p) return true;
      if (["rhand", "lhand"].includes(def.part)) return ["rhand", "lhand"].includes(p);
      return p === def.part;
    }
  }
}

function getSlots(actor) {
  const raw = foundry.utils.deepClone(actor.system?.equipSlots ?? {});
  for (const k of Object.keys(SLOTS)) if (typeof raw[k] !== "string") raw[k] = "";
  raw.other = Array.isArray(raw.other) ? raw.other.filter(Boolean) : Object.values(raw.other ?? {}).filter(Boolean);
  return raw;
}
const slotOf = (slots, id) => Object.keys(SLOTS).find((k) => slots[k] === id) ?? (slots.other.includes(id) ? "other" : null);

/** Put an owned item into a slot (or "other"), unequipping whatever it displaces. */
export async function equipToSlot(actor, slot, item, { quiet = false } = {}) {
  const slots = getSlots(actor);
  const L = (k) => game.i18n.localize(`SW25.EquipCard.Slot.${k}`);
  if (!slotAccepts(slot, item)) {
    ui.notifications.warn(game.i18n.format("SW25.EquipCard.WrongType", { item: item.name, slot: slot === "other" ? game.i18n.localize("SW25.EquipCard.Other") : L(slot) }));
    return false;
  }
  if (slot === "offHand" && is2H(actor.items.get(slots.mainHand))) {
    ui.notifications.warn(game.i18n.localize("SW25.EquipCard.TwoHanded"));
    return false;
  }
  const displaced = new Set();
  // remove from wherever it was
  for (const k of Object.keys(SLOTS)) if (slots[k] === item.id) slots[k] = "";
  slots.other = slots.other.filter((i) => i !== item.id);
  if (slot === "other") slots.other.push(item.id);
  else {
    if (slots[slot] && slots[slot] !== item.id) displaced.add(slots[slot]);
    slots[slot] = item.id;
    if (slot === "mainHand" && is2H(item) && slots.offHand) { displaced.add(slots.offHand); slots.offHand = ""; }
  }
  const updates = [{ _id: item.id, "system.equip": true }];
  for (const id of displaced) if (!slotOf(slots, id) && actor.items.get(id)) updates.push({ _id: id, "system.equip": false });
  await actor.update({ "system.equipSlots": slots }, { sw25Slot: true });
  await actor.updateEmbeddedDocuments("Item", updates, { sw25Slot: true });
  if (!quiet && displaced.size) {
    const old = [...displaced].map((id) => actor.items.get(id)?.name).filter(Boolean).join(", ");
    if (old) ui.notifications.info(game.i18n.format("SW25.EquipCard.Replaced", { old, item: item.name, slot: slot === "other" ? game.i18n.localize("SW25.EquipCard.Other") : L(slot) }));
  }
  return true;
}

export async function unequipItem(actor, id) {
  const slots = getSlots(actor);
  for (const k of Object.keys(SLOTS)) if (slots[k] === id) slots[k] = "";
  slots.other = slots.other.filter((i) => i !== id);
  await actor.update({ "system.equipSlots": slots }, { sw25Slot: true });
  if (actor.items.get(id)) await actor.updateEmbeddedDocuments("Item", [{ _id: id, "system.equip": false }], { sw25Slot: true });
}

/** First free accepting slot for an item (used when the legacy equip box is ticked). */
function autoSlotFor(actor, item, slots = getSlots(actor)) {
  for (const k of AUTO_ORDER) {
    if (slots[k] || !slotAccepts(k, item)) continue;
    if (k === "offHand" && (item.type !== "weapon" || is2H(item) || is2H(actor.items.get(slots.mainHand)))) continue;
    return k;
  }
  return item.type === "accessory" ? "other" : null;
}

/* ------------------------------------------------------------------ */
/* Sheet context                                                       */
/* ------------------------------------------------------------------ */
export function prepareCe7Context(sheet, context) {
  const actor = sheet.actor;
  if (!isPC(actor)) return;
  const sys = actor.system;
  const open = game.user.getFlag(SYS, "equipCardOpen") ?? true;
  const slots = getSlots(actor);
  const strVal = Number(sys.abilities?.str?.value) || 0;
  const mini = (it) => it && { id: it.id, name: it.name, img: it.img };
  const mainItem = actor.items.get(slots.mainHand);
  const mk = (k) => {
    const def = SLOTS[k];
    const it = actor.items.get(slots[k]);
    let warn = "";
    if (it) {
      const req = Number(it.system?.reqstr) || 0;
      const eff = Math.ceil(strVal * sw25MinStrMultFor(sys.classRules, it));
      if (req && ["weapon", "armor"].includes(it.type) && req > eff)
        warn = game.i18n.format("SW25.EquipCard.MinStr", { req, str: eff });
    }
    return {
      key: k, label: game.i18n.localize(`SW25.EquipCard.Slot.${k}`), icon: ICON(def.icon), mirror: !!def.mirror,
      item: mini(it), warn, locked: k === "offHand" && is2H(mainItem),
    };
  };
  const pf = actor.getFlag(SYS, "equipPortrait") ?? {};
  context.equipCard = {
    open,
    left: LEFT.map(mk), right: RIGHT.map(mk), bottom: BOTTOM.map(mk),
    others: slots.other.map((id) => mini(actor.items.get(id))).filter(Boolean),
    portrait: {
      src: pf.img || actor.img, x: pf.x ?? 50, y: pf.y ?? 0, zoom: pf.zoom ?? 1, fit: pf.mode === "fit",
      canEdit: actor.isOwner || game.user.isGM,
    },
    defense: sys.attributes?.protectionpoint ?? 0,
    evasion: sys.dodgebase ?? 0,
    otherOpen: sheet._sw25Adv?.eqcOther ?? false,
  };

  // Combat feats
  const adv = Number(sys.attributes?.advlevel?.value) || 0;
  const unlocked = adv >= 1 ? 1 + Math.floor((adv - 1) / 2) : 0;
  const feats = actor.items.filter((i) => i.type === "combatability").sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const used = new Set();
  const fslots = FEAT_LEVELS.map((level, idx) => {
    const it = feats.find((f) => !used.has(f.id) && f.system.featSource === "slot" && Number(f.system.featLevel) === level);
    if (it) used.add(it.id);
    return { level, locked: idx >= unlocked, lockTip: game.i18n.format("SW25.V2.Feats.Locked", { level }), item: mini(it) };
  });
  context.ce7feats = {
    slots: fslots,
    auto: feats.filter((f) => f.system.featSource === "auto").map(mini),
    racial: actor.items.filter((i) => i.type === "raceability").map(mini),
    unassigned: feats.filter((f) => !used.has(f.id) && f.system.featSource !== "auto").map(mini),
  };

  // Consumables belt
  context.ce7belt = beltContext(actor, mini);
  const on = beltFlags(actor);
  for (const g of context.gear ?? []) { g.consumable = g.type === "consumable"; g.onBelt = g.consumable && on.has(g._id); }
}

/** Consumables belt view (PC sheet and NPC / monster stat-block sheet share it). */
export function beltContext(actor, mini = (it) => (it ? { id: it.id, name: it.name, img: it.img } : null)) {
  const n = beltN();
  const sys = actor.system;
  const belt = Array.isArray(sys.belt?.slots) ? sys.belt.slots : Object.values(sys.belt?.slots ?? {});
  return Array.from({ length: n }, (_, index) => {
    const it = actor.items.get(belt[index]);
    if (!it || !isConsumable(it)) return { index, item: null };
    const u = usesOf(it);
    if (!isLimited(it)) return { index, item: { ...mini(it), unlimited: true, left: "∞", max: 0, ticks: [] } };
    return { index, item: { ...mini(it), left: u.value, max: u.max, ticks: Array.from({ length: Math.min(u.max, 20) }, (_, i) => ({ filled: i < u.value })) } };
  });
}

/** Put a dropped consumable (type "consumable") into a belt slot; copies it onto the actor first if needed. */
export async function dropOnBelt(actor, target, data) {
  const src = await Item.implementation.fromDropData(data);
  if (!src) return true;
  if (!isConsumable(src)) { ui.notifications.warn(game.i18n.format("SW25.EquipCard.WrongType", { item: src.name, slot: game.i18n.localize("SW25.V2.Belt.Title") })); return true; }
  let it = src;
  if (src.parent !== actor) { const obj = src.toObject(); delete obj._id; it = (await actor.createEmbeddedDocuments("Item", [obj], { sw25Slot: true }))[0]; }
  const idx = Number(target.dataset.index);
  const belt = [...(Array.isArray(actor.system.belt?.slots) ? actor.system.belt.slots : Object.values(actor.system.belt?.slots ?? {}))];
  for (let i = 0; i < belt.length; i++) if (belt[i] === it.id) belt[i] = "";
  while (belt.length <= idx) belt.push("");
  belt[idx] = it.id;
  return actor.update({ "system.belt.slots": belt });
}

const beltN = () => Math.clamp?.(Number(game.settings.get(SYS, "beltSlots")) || 6, 4, 10) ?? 6;

/** Inventory belt checkbox: tick adds to the first free slot, untick removes. Full belt -> notification. */
export async function toggleBelt(actor, itemId, on) {
  const r = toggleBeltSlot(actor.system.belt?.slots, itemId, on, beltN(), actor.items.get(itemId) ?? null);
  if (r.rejected) { ui.notifications.warn(game.i18n.localize("SW25.V2.Belt.OnlyConsumables")); return false; }
  if (r.full) { ui.notifications.warn(game.i18n.localize("SW25.V2.Belt.Full")); return false; }
  if (r.changed) await actor.update({ "system.belt.slots": r.slots });
  return r.changed;
}

/** Use one consumable (belt slot or inventory Use): post the item card (rolling its formula via the item's own
 *  roll code when it has one), then consume one use. Last use deletes the item and clears its belt slot. */
export async function useConsumable(actor, it) {
  if (!it) return;
  // Non-consumables (and unlimited consumables) only post their card / roll: never decrement, never delete.
  const plan = consumePlan(it);
  if (!plan.ok) return ui.notifications.warn(game.i18n.format("SW25.V2.Belt.Empty", { item: it.name }));
  const esc = foundry.utils.escapeHTML;
  const name = it.name, img = it.img;
  if (hasFormula(it)) await it.rollExec();
  else {
    const desc = await foundry.applications.ux.TextEditor.implementation.enrichHTML(it.system?.description ?? "", { relativeTo: it });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sw25-sbshow"><header><img src="${esc(img)}" width="32" height="32" style="vertical-align:middle;border:0"> <b>${esc(name)}</b></header>${desc}</div>` });
  }
  if (!plan.consumes) return;
  if (plan.delete) {
    const r = toggleBeltSlot(actor.system.belt?.slots, it.id, false, beltN());
    if (r.changed) await actor.update({ "system.belt.slots": r.slots });
    await it.delete();
  } else await it.update(plan.update);
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="sw25-belt-use"><img src="${esc(img)}" width="28" height="28" style="vertical-align:middle;border:0"/> ${game.i18n.format("SW25.V2.Belt.Used", { actor: esc(actor.name), item: esc(name), left: plan.left })}</div>` });
}

/** Inventory/belt view flags for consumables: onBelt + left. */
export function beltFlags(actor) {
  return new Set(slotsArray(actor.system.belt?.slots).filter(Boolean));
}

/* ------------------------------------------------------------------ */
/* Drops                                                               */
/* ------------------------------------------------------------------ */
/** @returns {Promise<any>|null} null when the drop isn't for a ce.7 target */
export async function handleCe7Drop(sheet, event, data) {
  const actor = sheet.actor;
  if (!isPC(actor)) return null;
  const target = event.target?.closest?.("[data-sw-drop]");
  if (!target) return null;
  const kind = target.dataset.swDrop;
  const src = await Item.implementation.fromDropData(data);
  if (!src) return true;
  const own = async (patch = {}) => {
    if (src.parent === actor) { if (Object.keys(patch).length) await src.update(patch, { sw25Slot: true }); return src; }
    const obj = src.toObject();
    delete obj._id;
    foundry.utils.mergeObject(obj, foundry.utils.expandObject(patch));
    if (["weapon", "armor", "accessory"].includes(obj.type)) obj.system.equip = false;
    return (await actor.createEmbeddedDocuments("Item", [obj], { sw25Slot: true }))[0];
  };
  const warnType = (slotLabel) => ui.notifications.warn(game.i18n.format("SW25.EquipCard.WrongType", { item: src.name, slot: slotLabel }));

  switch (kind) {
    case "slot": {
      const slot = target.dataset.slot;
      if (!slotAccepts(slot, src)) return warnType(game.i18n.localize(`SW25.EquipCard.Slot.${slot}`)), true;
      const it = await own();
      return equipToSlot(actor, slot, it);
    }
    case "other": {
      if (!slotAccepts("other", src)) return warnType(game.i18n.localize("SW25.EquipCard.Other")), true;
      return equipToSlot(actor, "other", await own());
    }
    case "belt": return dropOnBelt(actor, target, data);
    case "feat": case "auto": {
      if (src.type !== "combatability") return warnType(game.i18n.localize("SW25.V2.Feats.Title")), true;
      if (kind === "feat") {
        if (target.classList.contains("locked")) return ui.notifications.warn(target.dataset.tooltip), true;
        const level = Number(target.dataset.level);
        const prev = actor.items.find((i) => i.type === "combatability" && i.id !== src.id && i.system.featSource === "slot" && Number(i.system.featLevel) === level);
        if (prev) await prev.update({ "system.featSource": "", "system.featLevel": 0 });
        return own({ "system.featSource": "slot", "system.featLevel": level });
      }
      return own({ "system.featSource": "auto", "system.featLevel": 0 });
    }
    case "racial": {
      if (src.type !== "raceability") return warnType(game.i18n.localize("SW25.V2.Feats.Racial")), true;
      return own();
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Listeners                                                           */
/* ------------------------------------------------------------------ */
export function bindCe7Listeners(sheet, html) {
  const actor = sheet.actor;
  if (!isPC(actor)) return;
  const root = html[0] ?? html;
  const on = (sel, ev, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));

  on(".eqc-other", "toggle", (ev) => { sheet._sw25Adv.eqcOther = ev.currentTarget.open; });
  on(".eqc-item-open", "click", (ev) => {
    ev.preventDefault();
    actor.items.get(ev.currentTarget.closest("[data-item-id]")?.dataset.itemId)?.sheet.render(true);
  });
  if (!sheet.isEditable) return;
  on("[data-sw-drop]", "dragenter", (ev) => ev.currentTarget.classList.add("drag-over"));
  on("[data-sw-drop]", "dragleave", (ev) => { if (!ev.currentTarget.contains(ev.relatedTarget)) ev.currentTarget.classList.remove("drag-over"); });
  on("[data-sw-drop]", "drop", (ev) => ev.currentTarget.classList.remove("drag-over"));
  on(".eqc-slot.filled, .eqc-other-row", "contextmenu", (ev) => {
    ev.preventDefault();
    unequipItem(actor, ev.currentTarget.dataset.itemId);
  });
  on(".eqc-unequip", "click", (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    unequipItem(actor, ev.currentTarget.closest("[data-item-id]").dataset.itemId);
  });
  on(".eqc-edit-portrait", "click", (ev) => { ev.preventDefault(); new PortraitEditor(actor).open(); });

  // Feats: clear assignment
  on(".ce7-feat-clear", "click", (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    actor.items.get(ev.currentTarget.closest("[data-item-id]").dataset.itemId)?.update({ "system.featSource": "", "system.featLevel": 0 });
  });
  // Belt
  bindBeltListeners(sheet, root);
}

/** Belt clicks: × clears the slot, a tick uses one (shift-click restores). Shared with the stat-block sheet. */
export function bindBeltListeners(sheet, root) {
  const actor = sheet.actor;
  const on = (sel, ev, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));
  on(".ce7-belt-clear", "click", (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const idx = Number(ev.currentTarget.closest("[data-index]").dataset.index);
    const belt = [...(Array.isArray(actor.system.belt?.slots) ? actor.system.belt.slots : Object.values(actor.system.belt?.slots ?? {}))];
    belt[idx] = "";
    actor.update({ "system.belt.slots": belt });
  });
  // Click the slot icon/name area = use one (card + formula + consume). Shift-click still opens the item.
  on(".ce7-belt-use", "click", (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const it = actor.items.get(ev.currentTarget.closest("[data-item-id]")?.dataset.itemId);
    if (ev.shiftKey) return it?.sheet.render(true);
    useConsumable(actor, it);
  });
  on("input.sw25-belt-toggle", "change", (ev) => { ev.stopPropagation(); toggleBelt(actor, ev.currentTarget.closest("[data-item-id]").dataset.itemId, ev.currentTarget.checked).then((ok) => { if (!ok) sheet.render(false); }); });
  on(".sw25-item-use", "click", (ev) => { ev.preventDefault(); ev.stopPropagation(); useConsumable(actor, actor.items.get(ev.currentTarget.closest("[data-item-id]").dataset.itemId)); });
  on(".ce7-tick", "click", async (ev) => {
    ev.preventDefault();
    const it = actor.items.get(ev.currentTarget.closest("[data-item-id]").dataset.itemId);
    if (!it) return;
    if (!isLimited(it)) return;
    const u = usesOf(it);
    const restore = ev.shiftKey;
    let nv = restore ? u.value + 1 : u.value - 1;
    if (!restore && u.value <= 0) return;
    if (restore && u.mode === "uses" && nv > u.max) return;
    if (restore && u.mode === "qty" && (Number(it.system.qmax) || 0) > 0 && nv > Number(it.system.qmax)) return;
    if (!restore && nv <= 0) {
      const r = toggleBeltSlot(actor.system.belt?.slots, it.id, false, beltN());
      if (r.changed) await actor.update({ "system.belt.slots": r.slots });
      await it.delete();
    } else await it.update(u.mode === "uses" ? { "system.uses.value": nv } : { "system.quantity": nv });
    if (!restore) {
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="sw25-belt-use"><img src="${it.img}" width="28" height="28" style="vertical-align:middle;border:0"/> ${game.i18n.format("SW25.V2.Belt.Used", { actor: actor.name, item: it.name, left: nv })}</div>`,
      });
    }
  });
}

/* ------------------------------------------------------------------ */
/* Portrait editor (Tokenizer-style framing; never edits the image)    */
/* ------------------------------------------------------------------ */
export class PortraitEditor {
  constructor(actor) { this.actor = actor; }
  open() {
    const pf = this.actor.getFlag(SYS, "equipPortrait") ?? {};
    const st = { img: pf.img ?? "", x: pf.x ?? 50, y: pf.y ?? 0, zoom: pf.zoom ?? 1, mode: pf.mode ?? "fill" };
    const t = (k) => game.i18n.localize(`SW25.EquipCard.${k}`);
    const esc = foundry.utils.escapeHTML ?? ((s) => s);
    const content = `
      <div class="sw-eqc-editor">
        <div class="eqe-frame"><img class="eqe-bg" alt=""/><img class="eqe-img" alt="" draggable="false"/></div>
        <p class="hint">${t("PanHint")}</p>
        <label class="eqe-row">${t("Zoom")} <input type="range" class="eqe-zoom" min="100" max="300" step="1"/> <span class="eqe-zv"></span></label>
        <div class="eqe-row eqe-mode">
          <label><input type="radio" name="eqe-mode" value="fill"/> ${t("Fill")}</label>
          <label><input type="radio" name="eqe-mode" value="fit"/> ${t("Fit")}</label>
        </div>
        <div class="eqe-row">${t("CustomImage")} <input type="text" class="eqe-path" value="${esc(st.img)}" placeholder="${esc(this.actor.img)}"/>
          <button type="button" class="eqe-browse"><i class="fas fa-file-import"></i> ${t("Browse")}</button></div>
      </div>`;
    const self = this;
    const apply = (root) => {
      const src = st.img || self.actor.img;
      const img = root.querySelector(".eqe-img"), bg = root.querySelector(".eqe-bg");
      img.src = src; bg.src = src;
      const frame = root.querySelector(".eqe-frame");
      frame.classList.toggle("fit", st.mode === "fit");
      frame.style.setProperty("--px", `${st.x}%`); frame.style.setProperty("--py", `${st.y}%`); frame.style.setProperty("--pz", st.zoom);
      root.querySelector(".eqe-zoom").value = Math.round(st.zoom * 100);
      root.querySelector(".eqe-zv").textContent = `${Math.round(st.zoom * 100)}%`;
      root.querySelectorAll("input[name=eqe-mode]").forEach((r) => (r.checked = r.value === st.mode));
    };
    const save = async () => {
      await self.actor.setFlag(SYS, "equipPortrait", { img: st.img || "", x: Math.round(st.x * 10) / 10, y: Math.round(st.y * 10) / 10, zoom: Math.round(st.zoom * 100) / 100, mode: st.mode });
    };
    const DialogV2 = foundry.applications.api.DialogV2;
    const dlg = new DialogV2({
      window: { title: `${t("EditPortrait")}: ${this.actor.name}` },
      classes: ["sw-eqc-editor-dialog"],
      content,
      buttons: [
        { action: "reset", label: t("Reset"), icon: "fas fa-undo", callback: async () => { await self.actor.unsetFlag(SYS, "equipPortrait"); } },
        { action: "cancel", label: t("Cancel"), icon: "fas fa-times" },
        { action: "save", label: t("Save"), icon: "fas fa-check", default: true, callback: save },
      ],
      rejectClose: false,
    });
    const origOnRender = dlg._onRender?.bind(dlg);
    dlg._onRender = async function (...args) {
      if (origOnRender) await origOnRender(...args);
      const root = this.element;
      if (root._eqeBound) return; root._eqeBound = true;
      const frame = root.querySelector(".eqe-frame");
      apply(root);
      let drag = null;
      frame.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, sx: st.x, sy: st.y }; frame.setPointerCapture(e.pointerId); });
      frame.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const r = frame.getBoundingClientRect();
        st.x = Math.clamp(drag.sx - ((e.clientX - drag.x) / r.width) * 100 / st.zoom, 0, 100);
        st.y = Math.clamp(drag.sy - ((e.clientY - drag.y) / r.height) * 100 / st.zoom, 0, 100);
        apply(root);
      });
      const end = () => (drag = null);
      frame.addEventListener("pointerup", end); frame.addEventListener("pointercancel", end);
      frame.addEventListener("wheel", (e) => { e.preventDefault(); st.zoom = Math.clamp(st.zoom - Math.sign(e.deltaY) * 0.05, 1, 3); apply(root); }, { passive: false });
      root.querySelector(".eqe-zoom").addEventListener("input", (e) => { st.zoom = Number(e.target.value) / 100; apply(root); });
      root.querySelectorAll("input[name=eqe-mode]").forEach((r) => r.addEventListener("change", (e) => { st.mode = e.target.value; apply(root); }));
      const path = root.querySelector(".eqe-path");
      path.addEventListener("change", () => { st.img = path.value.trim(); apply(root); });
      root.querySelector(".eqe-browse").addEventListener("click", () => {
        const FP = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
        new FP({ type: "image", current: st.img || self.actor.img, callback: (p) => { st.img = p; path.value = p; apply(root); } }).render(true);
      });
    };
    dlg.render({ force: true });
  }
}

/* ------------------------------------------------------------------ */
/* Settings, hooks, migration                                          */
/* ------------------------------------------------------------------ */
export function registerCe7Settings() {
  game.settings.register(SYS, "beltSlots", {
    name: "SETTINGS.sw25BeltSlots.Name", hint: "SETTINGS.sw25BeltSlots.Hint",
    scope: "world", config: true, type: Number, default: 6,
    range: { min: 4, max: 10, step: 1 },
    onChange: () => globalThis.sw25RerenderSheets?.(),
  });
  game.settings.register(SYS, "ce7Migrated", { scope: "world", config: false, type: Boolean, default: false });
  game.settings.register(SYS, "beltConsumablesMigrated", { scope: "world", config: false, type: Boolean, default: false });
}

const mine = (userId) => userId === game.user.id;
// ce.8: hook guards — only persisted documents, one sync per actor at a time, debounced.
const _queue = new Map();
const valid = (actor, item) => !!(actor?.id && item?.id);
/** Serialize sync work per actor (batch creates fire many hooks); our own writes carry sw25Slot so they never recurse. */
function guarded(actor, fn) {
  if (!actor?.id) return;
  const key = actor.uuid;
  const prev = _queue.get(key) ?? Promise.resolve();
  const next = prev.then(() => new Promise((r) => setTimeout(r, 0))).then(fn)
    .catch((err) => console.error("sw25-ce | slot/feat sync failed", err));
  _queue.set(key, next);
  next.finally(() => { if (_queue.get(key) === next) _queue.delete(key); });
  return next;
}

/** Grant / remove class grants (autoFeats). Delegates to module/rules/grants.mjs; kept for API compatibility. */
export async function syncAutoFeats(actor, cls, opts = {}) {
  return syncGrants(actor, cls, opts);
}

export function registerCe7Hooks() {
  Hooks.on("createActor", (actor, options, userId) => {
    if (!mine(userId) || !isPC(actor) || options?.sw25Slot) return;
    return guarded(actor, () => autoFillActor(actor));
  });
  Hooks.on("createItem", async (item, options, userId) => {
    if (!mine(userId) || !isPC(item.parent)) return;
    const actor = item.parent;
    if (options?.sw25Slot || !valid(actor, item)) return;
    if (item.type === "skill") return guarded(actor, () => syncAutoFeats(actor, item));
    if (!["weapon", "armor", "accessory"].includes(item.type) || item.system.equip !== true) return;
    return guarded(actor, async () => {
      if (!actor.items.get(item.id)) return;
      const slot = autoSlotFor(actor, item);
      if (slot) await equipToSlot(actor, slot, item, { quiet: true });
    });
  });
  Hooks.on("updateItem", async (item, changes, options, userId) => {
    if (!mine(userId) || !isPC(item.parent)) return;
    const actor = item.parent;
    if (options?.sw25Slot || !valid(actor, item)) return;
    if (item.type === "skill") {
      if (foundry.utils.hasProperty(changes, "system.skilllevel") || foundry.utils.hasProperty(changes, "system.autoFeats")
        || foundry.utils.hasProperty(changes, `flags.${SYS}.choices`) || foundry.utils.hasProperty(changes, `flags.${SYS}.-=choices`)
        || foundry.utils.hasProperty(changes, `flags.${SYS}.grantOverrides`)) return guarded(actor, () => syncAutoFeats(actor, item));
      return;
    }
    if (!foundry.utils.hasProperty(changes, "system.equip")) return;
    if (!["weapon", "armor", "accessory"].includes(item.type)) return;
    return guarded(actor, async () => {
      if (!actor.items.get(item.id)) return;
      const slots = getSlots(actor);
      const cur = slotOf(slots, item.id);
      if (item.system.equip && !cur) {
        const slot = autoSlotFor(actor, item, slots);
        if (slot) await equipToSlot(actor, slot, item, { quiet: true });
      } else if (!item.system.equip && cur) await unequipItem(actor, item.id);
    });
  });
  Hooks.on("deleteItem", async (item, options, userId) => {
    if (!mine(userId) || !isPC(item.parent)) return;
    const actor = item.parent;
    if (options?.sw25Slot || !actor?.id || !item?.id) return;
    if (item.type === "skill") return guarded(actor, () => syncAutoFeats(actor, item, { removed: true }));
    return guarded(actor, async () => {
      const slots = getSlots(actor);
      if (slotOf(slots, item.id)) {
        for (const k of Object.keys(SLOTS)) if (slots[k] === item.id) slots[k] = "";
        slots.other = slots.other.filter((i) => i !== item.id);
        await actor.update({ "system.equipSlots": slots }, { sw25Slot: true });
      }
    });
  });

  // Class item sheet rules/grants editor moved to module/rules/sheet-ui.mjs (registerRulesUI).
}

/** Fill empty slots from already-equipped gear and unslotted feats. Non-destructive; returns true if written. */
export async function autoFillActor(actor) {
  const slots = getSlots(actor);
  if (!Object.keys(SLOTS).some((k) => slots[k]) && !slots.other.length) {
    const gear = actor.items.filter((i) => ["weapon", "armor", "accessory"].includes(i.type) && i.system.equip === true);
    gear.sort((a, b) => (a.type === "weapon" ? 0 : 1) - (b.type === "weapon" ? 0 : 1));
    for (const it of gear) {
      const k = autoSlotFor(actor, it, slots);
      if (k === "other") slots.other.push(it.id);
      else if (k) slots[k] = it.id;
      // anything that doesn't fit keeps equip=true (Defense unchanged) — never unequipped by migration
    }
  }
  const update = { "system.equipSlots": slots };
  const itemUpdates = [];
  const feats = actor.items.filter((i) => i.type === "combatability" && !i.system.featSource).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const taken = new Set(actor.items.filter((i) => i.type === "combatability" && i.system.featSource === "slot").map((i) => Number(i.system.featLevel)));
  const free = FEAT_LEVELS.filter((l) => !taken.has(l));
  feats.forEach((f, i) => { if (free[i]) itemUpdates.push({ _id: f.id, "system.featSource": "slot", "system.featLevel": free[i] }); });
  await actor.update(update, { sw25Slot: true });
  if (itemUpdates.length) await actor.updateEmbeddedDocuments("Item", itemUpdates, { sw25Slot: true });
  return true;
}

/** One-time, non-destructive: equipped gear → slots, feats → slots in order. */
export async function runCe7Migration() {
  if (!game.user.isGM || game.user.id !== game.users.activeGM?.id) return;
  if (game.settings.get(SYS, "ce7Migrated")) return;
  const actors = [...game.actors].filter(isPC);
  let n = 0;
  for (const actor of actors) {
    try {
      await autoFillActor(actor);
      n++;
    } catch (err) { console.error(`sw25-ce | ce.7 migration failed for ${actor.name}`, err); }
  }
  await game.settings.set(SYS, "ce7Migrated", true);
  if (n) ui.notifications.info(`SW2.5 ce.7: Equipment Card set up for ${n} character(s).`);
}

/** Belt clean-up: clear belt entries that point at missing items or non-consumables. Returns true if written. */
export async function cleanBelt(actor) {
  if (!actor?.system?.belt) return false;
  const r = sanitizeBelt(actor.system.belt.slots, (id) => actor.items.get(id));
  if (r.changed) await actor.update({ "system.belt.slots": r.slots }, { sw25Slot: true });
  return r.changed;
}

/** One-time (ce.15): remove belt entries pointing at non-consumables on every world actor. Non-destructive to items. */
export async function runBeltConsumableMigration() {
  if (!game.user.isGM || game.user.id !== game.users.activeGM?.id) return;
  if (game.settings.get(SYS, "beltConsumablesMigrated")) return;
  let n = 0;
  for (const actor of game.actors) { try { if (await cleanBelt(actor)) n++; } catch (err) { console.error(`sw25-ce | belt clean-up failed for ${actor.name}`, err); } }
  await game.settings.set(SYS, "beltConsumablesMigrated", true);
  if (n) ui.notifications.info(game.i18n.format("SW25.V2.Belt.Cleaned", { n }));
}
