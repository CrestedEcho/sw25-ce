/**
 * Styled NPC / Monster stat-block sheet (Artist mockups, SHEET_SPEC_NPC_MONSTER.md).
 * Data: system.sb.* (derived view system.sbView); overrides system.sb.overrides.<path>.{value,locked} with quill.
 * The legacy sw25 sheet stays selectable via Sheet Configuration.
 */
import { DISPOSITION_LABELS } from "../rules/statblock.mjs";
import { postAttackCard } from "../rules/attack-flow.mjs";
import { parseMagicSkill, spellsForSkill } from "../rules/sb-cast.mjs";
import { castSpellFlow } from "../rules/spell-flow.mjs";
import { usesSbPool } from "../rules/sb-spell.mjs";
import { buildMagicContext, magicBlocks, migrateMagic, newMagicEntry, schoolLabel } from "../rules/sb-magic.mjs";
import { applyDamageToTargets } from "../rules/apply-damage.mjs";
import { SW25FellowSheet } from "./fellow-sheet.mjs";
import { fixedToDice, parseSbDamage, applyVital, lootFor, spellGmOnly, slugKey } from "../rules/sb-play.mjs";
import { skillEditorData, skillFromForm, skillCardHtml, RESIST_CHECKS, RESIST_RESULTS } from "../rules/sb-skill.mjs";
import { beltContext, bindBeltListeners, dropOnBelt, beltFlags } from "../ce7/equipcard.mjs";
import { usesOf, stackLabel } from "../ce7/belt-logic.mjs";
import { buildStatBlockContext, foldSubmitData, NEW_ROWS, ARRAY_FIELDS } from "../rules/statblock-sheet-data.mjs";

const T = "systems/sw25-ce/templates/actor";
const ATTITUDES = { "": "—", friendly: "Friendly", neutral: "Neutral", hostile: "Hostile" };

export class SW25StatBlockSheet extends foundry.appv1.sheets.ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sw25", "sheet", "actor", "sw25-sb"],
      width: 760, height: 820, submitOnChange: true, closeOnSubmit: false,
      tabs: [{ navSelector: ".sb-tabs", contentSelector: ".sb-body", initial: "combat" }],
      dragDrop: [{ dragSelector: ".sb-items li.item", dropSelector: null }],
    });
  }

  get template() { return `${T}/actor-statblock-sheet.hbs`; }

  async getData(options) {
    const base = await super.getData(options);
    const sys = this.actor.system; const raw = this.actor._source.system?.sb ?? {};
    const view = sys.sbView ?? game.sw25.statblock.prepareStatBlock(raw, sys, this.actor.type);
    const ctx = buildStatBlockContext({ type: this.actor.type, view, raw, isGM: game.user.isGM, img: this.actor.img, skillGmMap: this.actor.getFlag("sw25-ce", "sbSkillGmOnly") ?? {} });
    const TE = foundry.applications.ux.TextEditor.implementation;
    const enrich = (h) => TE.enrichHTML(h ?? "", { secrets: this.actor.isOwner, relativeTo: this.actor });
    Object.assign(base, ctx, {
      tokenDispositionKey: String(DISPOSITION_LABELS[this.actor.prototypeToken?.disposition] ?? "").toLowerCase(),
      tokenDisposition: DISPOSITION_LABELS[this.actor.prototypeToken?.disposition] ?? "—",
      fellowOn: !!this.actor.system.fellow?.enabled, attitudes: ATTITUDES, editable: this.isEditable, owner: this.actor.isOwner,
      // Spell items live in the Magic section (not Inventory).
      items: this.actor.items.contents.filter((i) => i.type !== "spell").map((i) => ({ _id: i.id, name: i.name, img: i.img, type: i.type })),
      notesHTML: await enrich(raw.notes), secretsHTML: game.user.isGM ? await enrich(raw.secrets) : "",
      descriptionHTML: await enrich(raw.description || view.description),
    });
    for (const sk of base.skills ?? []) sk.description = await enrich(sk.description);
    for (const s of base.skills) s.description = await enrich(s.description);
    // Play/Edit lock: Play is the default; inputs only show in Edit mode.
    this._sbEdit ??= false;
    base.editMode = this.isEditable && this._sbEdit; base.playMode = !base.editMode;
    // Inventory: weapons roll, everything else is shown to chat; consumable belt (shared with the PC sheet).
    const onBelt = beltFlags(this.actor);
    for (const it of base.items) {
      it.rollable = it.type === "weapon";
      if (it.type === "consumable") { const d = this.actor.items.get(it._id); it.consumable = true; it.onBelt = onBelt.has(it._id); it.limited = !!d?.system?.limitedUses; it.left = d ? stackLabel(d) : ""; }
      else if (it.type === "item") it.showable = true;
    }
    base.ce7belt = beltContext(this.actor);
    // Magic section (approved mockup): one block per magic skill, aligned spell cards, shared MP bar (paying part).
    const gmMap = this.actor.getFlag("sw25-ce", "sbSpellGmOnly") ?? {};
    const hasMagic = magicBlocks(raw).length > 0;
    base.magic = buildMagicContext({ rawSb: raw, viewParts: view.parts ?? [], docs: hasMagic ? await this._sbPackSpells() : [], owned: this._sbOwnedSpells(), gmMap,
      partIndex: this.actor.getFlag("sw25-ce", "sbMagicPart") ?? null });
    this._sbMigrateMagic(raw);
    return base;
  }

  /** Spell documents for casting: sw25-spells compendium (cached) + embedded spell items. */
  async _sbSpellDocs() {
    return [...(await this._sbPackSpells()), ...this._sbOwnedSpells()];
  }
  async _sbPackSpells() {
    const pack = game.packs.get("sw25-ce.sw25-spells");
    SW25StatBlockSheet._spellCache ??= pack ? (await pack.getDocuments()).map((d) => Object.assign(d.toObject(), { uuid: d.uuid })) : [];
    return SW25StatBlockSheet._spellCache;
  }
  /** Spell items on this stat block (dropped spells): shown in the Magic section under their school. */
  _sbOwnedSpells() {
    return this.actor.items.filter((i) => i.type === "spell").map((d) => Object.assign(d.toObject(), { uuid: d.uuid }));
  }

  /** Belt drops reuse the PC sheet's belt logic; everything else is the normal item drop (Inventory). */
  async _onDrop(event) {
    const target = event.target?.closest?.("[data-sw-drop=belt]");
    if (target && this.isEditable) {
      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
      if (data?.type === "Item") return dropOnBelt(this.actor, target, data);
    }
    // Spell drops go to the Magic section (owned spell item); skip a second copy of the same spell.
    if (this.isEditable) {
      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
      if (data?.type === "Item" && data.uuid && !data.uuid.startsWith(this.actor.uuid)) {
        const it = await fromUuid(data.uuid).catch(() => null);
        if (it?.type === "spell" && this.actor.items.some((i) => i.type === "spell" && i.name === it.name))
          return ui.notifications.info(game.i18n.format("SW25.SB.SpellOwned", { name: it.name }));
      }
    }
    return super._onDrop(event);
  }

  /** Fellow-mode NPC: players get the public Fellow card; the stat block stays GM-only. */
  render(force, options) {
    if (this.actor.type === "npc" && this.actor.system.fellow?.enabled && !game.user.isGM) {
      this._fellowCard ??= new SW25FellowSheet(this.actor);
      return this._fellowCard.render(force, options);
    }
    return super.render(force, options);
  }

  /** Hostile NPC -> Combat tab is first and the default. */
  _render(force, options) {
    const t = this._tabs?.[0];
    const hostile = this.actor.type === "npc" && !!this.actor.system.sb?.hostile;
    const first = this.actor.type === "npc" ? (hostile ? "combat" : "person") : "combat";
    if (t && (this._sbHostile !== hostile || !t.active)) t.active = first;
    this._sbHostile = hostile;
    return super._render(force, options);
  }

  _getSubmitData(updateData = {}) {
    const flat = foundry.utils.flattenObject(super._getSubmitData(updateData));
    const raw = this.actor._source.system?.sb ?? {};
    for (const k of Object.keys(flat)) if (k.startsWith("sbList.")) { flat[`system.sb.${k.slice(7)}`] = String(flat[k] ?? "").split(",").map((s) => s.trim()).filter(Boolean); delete flat[k]; }
    return foldSubmitData(flat, raw, this.actor.system.sbView?.locked ?? []);
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = html[0] ?? html;
    // HP/MP vitals inputs (Person summary / Combat block) have no form name: they write the same per-part
    // value the Parts table edits (locked max -> its override), so there is a single source of truth.
    // Person-tab copy of the combat stat block is read-only (disabled fields are not submitted -> no duplicate names).
    root.querySelectorAll(".sb-person-combat input, .sb-person-combat select").forEach((el) => { el.disabled = true; });
    // Monster Hostile toggle (unnamed input; stored inverted as system.sb.neutral, default Hostile).
    root.querySelectorAll("[data-sb-toggle=neutral]").forEach((el) => el.addEventListener("change", (ev) => { ev.stopPropagation(); this.actor.update({ "system.sb.neutral": !el.checked }); }));
    root.querySelectorAll("[data-sb-path]").forEach((el) => el.addEventListener("change", (ev) => {
      ev.stopPropagation(); const v = el.value.trim(); const val = v === "" ? null : Number(v);
      if (v !== "" && !Number.isFinite(val)) return this.render(false);
      const path = el.dataset.sbPath;
      if (el.dataset.locked) return this.actor.update({ [`system.sb.overrides.${path}.value`]: val });
      const [, idx, key] = path.split(".");
      const parts = foundry.utils.deepClone(this.actor._source.system?.sb?.parts ?? []);
      if (!parts[Number(idx)]) return;
      // Max shown with Sword Shards added: store the base (shards stay derived).
      parts[Number(idx)][key] = val != null && el.dataset.shard ? Math.max(0, val - Number(el.dataset.shard)) : val;
      this.actor.update({ "system.sb.parts": parts });
    }));
    if (!this.isEditable) return;
    if (!this._sbEdit) root.querySelectorAll(".sb-sheet .sb-in:not(.sb-keep)").forEach((el) => { el.disabled = true; });
    root.querySelectorAll(".sb-vamt").forEach((el) => { el.addEventListener("change", (ev) => ev.stopPropagation()); el.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); } }); });
    bindBeltListeners(this, root);
    root.querySelectorAll("[data-action]").forEach((el) => el.addEventListener("click", (ev) => this._onAction(ev, el)));
    // Magic section inputs have no form name (they write system.sb.magic through the handlers below).
    const stop = (el, fn) => el.addEventListener("change", (ev) => { ev.stopPropagation(); fn(ev); });
    root.querySelectorAll(".sb-magic input, .sb-magic select").forEach((el) => el.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); } }));
    root.querySelectorAll(".sb-mg-part").forEach((el) => stop(el, () => this.actor.setFlag("sw25-ce", "sbMagicPart", Number(el.value))));
    root.querySelectorAll(".sb-mg-set").forEach((el) => stop(el, () => this._sbMagicSet(Number(el.dataset.pos), el.dataset.field, el.value)));
    root.querySelectorAll(".sb-mg-new-power").forEach((el) => {
      const hint = el.closest(".sb-mg-add")?.querySelector(".sb-mg-fixed");
      const upd = () => { const v = Number(el.value); if (hint) hint.textContent = Number.isFinite(v) ? `(fixed ${v + 7})` : ""; };
      upd(); el.addEventListener("input", upd); el.addEventListener("change", (ev) => ev.stopPropagation());
    });
    root.querySelectorAll(".sb-mg-new-school, .sb-mg-new-level").forEach((el) => el.addEventListener("change", (ev) => ev.stopPropagation()));
  }

  async _onAction(ev, el) {
    ev.preventDefault();
    const a = el.dataset.action; const raw = this.actor._source.system?.sb ?? {};
    const arr = (f) => structuredClone(Array.isArray(raw[f]) ? raw[f] : Object.values(raw[f] ?? {}));
    if (a === "fellow-card") { this._fellowCard ??= new SW25FellowSheet(this.actor); return this._fellowCard.render(true); }
    if (a === "add") { const f = el.dataset.field; return this.actor.update({ [`system.sb.${f}`]: [...arr(f), NEW_ROWS[f]()] }); }
    if (a === "del") {
      const f = el.dataset.field; const i = Number(el.dataset.index); const rows = arr(f); rows.splice(i, 1);
      const upd = { [`system.sb.${f}`]: rows };
      if (f === "parts") upd["system.sb.overrides.-=parts"] = null; // indices shift: clear part overrides
      return this.actor.update(upd);
    }
    if (a === "core") { const i = Number(el.dataset.index); return this.actor.update({ "system.sb.parts": arr("parts").map((p, n) => ({ ...p, isCore: n === i })) }); }
    if (a === "lock") {
      const path = el.dataset.path; const o = foundry.utils.getProperty(raw.overrides ?? {}, path);
      if (o?.locked) return this.actor.update({ [`system.sb.overrides.${path}.locked`]: false });
      const cur = foundry.utils.getProperty(this.actor.system.sbView ?? {}, path);
      return this.actor.update({ [`system.sb.overrides.${path}`]: { value: cur ?? 0, locked: true } });
    }
    if (a === "sb-cast") return this._sbCast(Number(el.dataset.index), el.dataset.spell ?? null);
    if (a === "sb-mode") { this._sbEdit = !this._sbEdit; return this.render(false); }
    if (a === "sb-check") return this._sbCheck(el.dataset.label, Number(el.dataset.fixed), el.dataset.mode);
    if (a === "sb-attack") return postAttackCard(this.actor, { partIndex: Number(el.dataset.index) });
    if (a === "sb-dmg") return this._sbDamage(el.dataset.label, el.dataset.text, el.dataset.mode);
    if (a === "sb-vital") return this._sbVital(Number(el.dataset.part), el.dataset.kind, el.dataset.mode, el.closest(".sb-vbox")?.querySelector(".sb-vamt"));
    if (a === "sb-loot") return this._sbLoot();
    if (a.startsWith("sb-mg-")) return this._sbMagicAction(a, el, raw);
    if (a === "sb-gmonly") { const k = el.dataset.key; const cur = spellGmOnly(this.actor.getFlag("sw25-ce", "sbSpellGmOnly") ?? {}, k); return this.actor.setFlag("sw25-ce", "sbSpellGmOnly", { [k]: !cur }); }
    if (a === "skill-edit" || a === "skill-desc") return this._sbSkillEdit(Number(el.dataset.index ?? -1));
    if (a === "sb-skill-post") return this._sbSkillPost(Number(el.dataset.index));
    if (a === "sb-skill-gm") { const k = el.dataset.key; const cur = spellGmOnly(this.actor.getFlag("sw25-ce", "sbSkillGmOnly") ?? {}, k); return this.actor.setFlag("sw25-ce", "sbSkillGmOnly", { [k]: !cur }); }
    const id = el.closest("[data-item-id]")?.dataset.itemId; const item = id && this.actor.items.get(id);
    if (a === "item-edit") return item?.sheet.render(true);
    if (a === "item-del") return item?.delete();
    if (a === "item-roll") return item?.roll();
    if (a === "item-show") return this._sbShowItem(item);
  }
}

/** Unique Skill editor (new: index < 0). Title, part, symbol toggles, check (fixed = value + 7), resist, ProseMirror description. */
SW25StatBlockSheet.prototype._sbSkillEdit = async function (index) {
  const raw = this.actor._source.system?.sb ?? {};
  const rows = structuredClone(Array.isArray(raw.uniqueSkills) ? raw.uniqueSkills : Object.values(raw.uniqueSkills ?? {}));
  const isNew = !(index >= 0 && rows[index]); const prev = isNew ? { tags: [] } : rows[index];
  const L = (map, root) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, game.i18n.has?.(`${root}.${k}`) ? game.i18n.localize(`${root}.${k}`) : v]));
  const checks = L(RESIST_CHECKS, "SW25.Resist.Check"); const results = L(RESIST_RESULTS, "SW25.Resist.Result");
  const data = skillEditorData(prev, this.actor.system.sbView?.parts ?? [], { checks, results });
  const content = await foundry.applications.handlebars.renderTemplate(`${T}/sb/sb-skill-editor.hbs`, data);
  const PM = foundry.applications.elements.HTMLProseMirrorElement;
  const out = await foundry.applications.api.DialogV2.wait({
    window: { title: isNew ? "New Unique Skill" : `Edit Unique Skill: ${prev.name ?? ""}`, icon: "fas fa-star" },
    classes: ["sw25-sb-skill-editor"], position: { width: 560 }, content, rejectClose: false,
    buttons: [
      { action: "save", label: "Save", icon: "fas fa-check", default: true, callback: (_e, b) => {
        const f = b.form; const fd = Object.fromEntries(new FormData(f).entries());
        fd.description = f.querySelector("prose-mirror")?.value ?? prev.description ?? ""; return fd;
      } },
      { action: "cancel", label: "Cancel", icon: "fas fa-times" },
    ],
    render: (_e, dialog) => {
      const root = dialog.element ?? _e?.target?.element;
      const slot = root?.querySelector(".sb-ske-desc");
      if (slot && PM) slot.append(PM.create({ name: "description", value: prev.description ?? "", toggled: false, documentUUID: this.actor.uuid }));
      const v = root?.querySelector("[name=checkValue]"); const fx = root?.querySelector(".sb-ske-fixed b");
      v?.addEventListener("input", () => { const n = Number(v.value); fx.textContent = v.value !== "" && Number.isFinite(n) ? String(n + 7) : "—"; });
    },
  });
  if (!out || out === "cancel" || typeof out !== "object") return;
  const skill = skillFromForm(out, prev);
  if (isNew) rows.push(skill); else rows[index] = skill;
  return this.actor.update({ "system.sb.uniqueSkills": rows });
};

/** Post a Unique Skill card (icons, title, part, check buttons, description); GM-only toggle whispers it to the GMs. */
SW25StatBlockSheet.prototype._sbSkillPost = async function (index) {
  const view = this.actor.system.sbView ?? {}; const s = (view.uniqueSkills ?? [])[index]; if (!s) return;
  const gmOnly = spellGmOnly(this.actor.getFlag("sw25-ce", "sbSkillGmOnly") ?? {}, s.name);
  const TE = foundry.applications.ux.TextEditor.implementation;
  const description = await TE.enrichHTML(s.description ?? "", { secrets: gmOnly, relativeTo: this.actor });
  const L = (map, root) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, game.i18n.has?.(`${root}.${k}`) ? game.i18n.localize(`${root}.${k}`) : v]));
  const content = skillCardHtml(s, { actorName: this.actor.name, description, gmOnly, checkLabels: L(RESIST_CHECKS, "SW25.Resist.Check"), resultLabels: L(RESIST_RESULTS, "SW25.Resist.Result") });
  const msg = { speaker: ChatMessage.getSpeaker({ actor: this.actor }), content };
  if (gmOnly) msg.whisper = ChatMessage.getWhisperRecipients("GM").map((u) => u.id);
  return ChatMessage.create(msg);
};

/** NPC/monster casting: pick a spell for "<School> Magic N", confirm cost, deduct current MP/HP of the chosen part, post chat. */
SW25StatBlockSheet.prototype._sbCast = async function (index, spellName = null) {
  const actor = this.actor; const esc = foundry.utils.escapeHTML;
  const raw = actor._source.system?.sb ?? {}; const view = actor.system.sbView ?? {};
  const skills = Array.isArray(raw.uniqueSkills) ? raw.uniqueSkills : Object.values(raw.uniqueSkills ?? {});
  const skill = parseMagicSkill(skills[index]); if (!skill) return;
  // Spells: sw25-spells compendium + embedded spell items (fallback / custom).
  const docs = await this._sbSpellDocs();
  const spells = spellsForSkill(skill, docs);
  if (!spells.length) return ui.notifications.warn(`No ${skill.schools.join("/")} spells up to Lv${skill.level} found.`);
  const pre = spellName != null ? spells.findIndex((x) => x.name === spellName) : -1;
  const opts = spells.map((s, n) => `<option value="${n}"${n === 0 ? " selected" : ""}>Lv${s.level} · ${esc(s.name)} (${esc(s.cost.raw || `MP${s.cost.base ?? "?"}`)})</option>`).join("");
  const pick = pre >= 0 ? String(pre) : await foundry.applications.api.DialogV2.prompt({ window: { title: `${skills[index].name}: cast` },
    content: `<label>Spell <select name="s" size="12" style="width:100%">${opts}</select></label>`,
    ok: { label: "Next", callback: (_e, b) => b.form.elements.s.value } }).catch((err) => { if (err) console.error("sw25 | cast dialog", err); return null; });
  if (pick == null) return;
  if (pick === "") return ui.notifications.warn("Pick a spell first.");
  const meta = spells[Number(pick)];
  if (!usesSbPool(actor)) return ui.notifications.warn("This stat block has no parts to pay MP from.");
  // Same cast window / card as the character sheet (metamagic, Spend MP, Power roll + crit, Apply panel, Apply Effect);
  // MP comes from the stat block part, casting check and Power use the skill's Magic Power (fixed − 7).
  const doc = docs.find((x) => (meta.uuid && x.uuid === meta.uuid) || x.name === meta.name);
  return castSpellFlow(actor, doc, { sb: { skill: skills[index], spellDoc: doc } });
};

/** Fixed button posts the value; dice button rolls 2d6 + (fixed - 7). */
SW25StatBlockSheet.prototype._sbCheck = async function (label, fixed, mode) {
  const d = fixedToDice(fixed); if (!d) return;
  const speaker = ChatMessage.getSpeaker({ actor: this.actor }); const esc = foundry.utils.escapeHTML;
  if (mode === "fixed") return ChatMessage.create({ speaker, content: `<div class="sw25-sbcheck"><b>${esc(label)}</b>: fixed value <b>${d.fixed}</b></div>` });
  const r = await new Roll(d.formula).evaluate();
  return r.toMessage({ speaker, flavor: `${esc(label)} <small>(fixed ${d.fixed})</small>` });
};

/** Damage: dice rolls the stat-block formula; fixed posts the average (2d+X -> 7 + X). */
SW25StatBlockSheet.prototype._sbDamage = async function (label, text, mode) {
  const d = parseSbDamage(text); const esc = foundry.utils.escapeHTML; const speaker = ChatMessage.getSpeaker({ actor: this.actor });
  if (!d) return ui.notifications.warn(`Can't read damage "${text}".`);
  if (mode === "fixed") return ChatMessage.create({ speaker, content: `<div class="sw25-sbcheck"><b>${esc(label)}</b>: fixed (average) <b>${d.average}</b> <small>(${esc(text)})</small></div>` });
  const r = await new Roll(d.formula).evaluate();
  return r.toMessage({ speaker, flavor: `${esc(label)} <small>(${esc(text)})</small>` });
};

/** Damage/Heal (HP) and Spend/Restore (MP) on one part: writes the same per-part current value the Parts table edits. */
SW25StatBlockSheet.prototype._sbVital = async function (i, kind, mode, input) {
  const amount = Number(input?.value); if (!Number.isFinite(amount) || amount <= 0) return ui.notifications.warn("Enter an amount first.");
  const raw = this.actor._source.system?.sb ?? {}; const view = this.actor.system.sbView ?? {};
  const parts = structuredClone(Array.isArray(raw.parts) ? raw.parts : Object.values(raw.parts ?? {}));
  const vp = (view.parts ?? [])[i]; if (!parts[i] || !vp) return;
  const key = kind === "mp" ? "mpValue" : "hpValue"; const max = kind === "mp" ? vp.mp : vp.hp;
  parts[i][key] = applyVital({ current: parts[i][key] ?? vp[key], max, amount, mode, kind, allowNegative: !!view.useDeathCheck });
  return this.actor.update({ "system.sb.parts": parts });
};

/** Roll Loot (GM only): 2d6 against system.sb.loot, whispered to the GMs with Sword Shards. */
SW25StatBlockSheet.prototype._sbLoot = async function () {
  if (!game.user.isGM) return;
  const esc = foundry.utils.escapeHTML; const view = this.actor.system.sbView ?? {}; const raw = this.actor._source.system?.sb ?? {};
  const rows = Array.isArray(raw.loot) ? raw.loot : Object.values(raw.loot ?? {});
  const r = await new Roll("2d6").evaluate();
  const got = lootFor(rows, r.total);
  const li = got.map((l) => `<li>${l.always ? "<small>(Always)</small> " : ""}<b>${esc(l.item || "?")}</b>${l.price != null && l.price !== "" ? ` — ${esc(l.price)}G` : ""}${l.materialCard ? ` <small>[${esc(l.materialCard)}]</small>` : ""}</li>`).join("");
  const shards = view.swordShards;
  const content = `<div class="sw25-sbloot"><div class="sw25-gmonly"><i class="fas fa-eye-slash"></i> Whisper · GM only</div><header><b>${esc(this.actor.name)}</b> — loot 🎲 2d6 = <b>${r.total}</b></header>`
    + `<ul>${li || "<li class=\"muted\">Nothing dropped</li>"}</ul>`
    + (shards ? `<div>Sword Shards: <b>${esc(shards)}</b></div>` : "") + `</div>`;
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), rolls: [r], content, whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id) });
};

/** Show a non-weapon item to chat (image, name, description). */
SW25StatBlockSheet.prototype._sbShowItem = async function (item) {
  if (!item) return; const esc = foundry.utils.escapeHTML;
  const TE = foundry.applications.ux.TextEditor.implementation;
  const desc = await TE.enrichHTML(item.system?.description ?? "", { relativeTo: item });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content: `<div class="sw25-sbshow"><header><img src="${esc(item.img)}" width="32" height="32" style="vertical-align:middle;border:0"> <b>${esc(item.name)}</b> <small>${esc(item.type)}</small></header>${desc}</div>` });
};

/** Chat buttons on spell cards: apply magic damage to targeted tokens (Defense ignored, "Magic Damage +N" weak point added). */
Hooks.on("renderChatMessageHTML", (_msg, el) => {
  el.querySelectorAll?.("[data-sw25-resisted]").forEach((b) => b.addEventListener("click", (ev) => {
    ev.preventDefault(); const names = [...(game.user.targets ?? [])].map((t) => foundry.utils.escapeHTML(t.name)).join(", ");
    ChatMessage.create({ content: `<div class="sw25-spelldmg"><b>Resisted</b>: no effect${names ? ` on ${names}` : ""}.</div>` });
  }));
  el.querySelectorAll?.("[data-sw25-heal]").forEach((b) => b.addEventListener("click", (ev) => {
    ev.preventDefault(); applyDamageToTargets(Number(b.dataset.sw25Heal) || 0, "heal");
  }));
  el.querySelectorAll?.("[data-sw25-magic-dmg]").forEach((b) => b.addEventListener("click", (ev) => {
    ev.preventDefault(); applyDamageToTargets(Number(b.dataset.sw25MagicDmg) || 0, "magic");
  }));
});
export { ARRAY_FIELDS };

/** One-time, non-destructive move of magic Unique skills into system.sb.magic (skills are only marked magicMoved). */
SW25StatBlockSheet.prototype._sbMigrateMagic = function (raw) {
  if (this._sbMagicMigrating || !this.isEditable || this.actor.pack) return;
  const gm = game.users?.activeGM; if (gm ? gm !== game.user : !this.actor.isOwner) return;
  const m = migrateMagic(raw); if (!m.changed) return;
  this._sbMagicMigrating = true;
  this.actor.update({ "system.sb.magic": m.magic, "system.sb.uniqueSkills": m.uniqueSkills })
    .catch((err) => console.error("sw25 | magic migration", err)).finally(() => { this._sbMagicMigrating = false; });
};

/** Saved entry index for a block position (legacy blocks have none until migrated). */
SW25StatBlockSheet.prototype._sbMagicEntry = function (pos) {
  const raw = this.actor._source.system?.sb ?? {}; const b = magicBlocks(raw)[pos];
  return b && !b.legacy ? b.i : null;
};
SW25StatBlockSheet.prototype._sbMagicRows = function () {
  const raw = this.actor._source.system?.sb ?? {};
  return structuredClone(Array.isArray(raw.magic) ? raw.magic : Object.values(raw.magic ?? {}));
};

/** Edit-mode Level / Magic Power (value; stored as fixed = value + 7). */
SW25StatBlockSheet.prototype._sbMagicSet = async function (pos, field, value) {
  const i = this._sbMagicEntry(pos); const n = Number(value); if (i == null || value === "" || !Number.isFinite(n)) return this.render(false);
  const rows = this._sbMagicRows();
  if (field === "level") rows[i].level = Math.max(1, Math.min(20, Math.trunc(n)));
  else if (field === "power") rows[i].power = { ...(rows[i].power ?? {}), fixed: n + 7 };
  else return;
  return this.actor.update({ "system.sb.magic": rows });
};

SW25StatBlockSheet.prototype._sbMagicAction = async function (a, el, raw) {
  const pos = Number(el.dataset.pos);
  if (a === "sb-mg-cast") {
    const b = magicBlocks(raw)[pos]; if (!b) return;
    if (!usesSbPool(this.actor)) return ui.notifications.warn("This stat block has no parts to pay MP from.");
    const docs = await this._sbSpellDocs(); const uuid = el.dataset.uuid;
    const doc = docs.find((x) => uuid && x.uuid === uuid) ?? docs.find((x) => x.name === el.dataset.spell);
    if (!doc) return ui.notifications.warn(`Spell "${el.dataset.spell}" not found.`);
    const partIndex = this.actor.getFlag("sw25-ce", "sbMagicPart") ?? null;
    return castSpellFlow(this.actor, doc, { sb: { skill: b.skill, spellDoc: doc, partIndex } });
  }
  if (a === "sb-mg-addschool") {
    const school = el.dataset.school; const label = schoolLabel(school);
    const lv = Number(el.dataset.level) || 1; const mp = Number(this.actor.system.sbView?.level) || lv;
    const content = `<p>${foundry.utils.escapeHTML(game.i18n.format("SW25.SB.AddSchoolTitle", { school: label }))}</p>
      <label>${game.i18n.localize("SW25.SB.Level")} <input type="number" name="lv" min="1" max="20" value="${lv}"></label>
      <label>${game.i18n.localize("SW25.SB.MagicPower")} <input type="number" name="mp" value="${mp}"></label>`;
    const r = await foundry.applications.api.DialogV2.prompt({ window: { title: game.i18n.format("SW25.SB.AddSchoolTitle", { school: label }) }, content,
      ok: { label: game.i18n.localize("SW25.SB.Add"), callback: (_e, b) => ({ level: b.form.elements.lv.value, power: b.form.elements.mp.value }) } }).catch(() => null);
    if (!r) return;
    const e = newMagicEntry({ school, ...r }); if (!e) return;
    return this.actor.update({ "system.sb.magic": [...this._sbMagicRows(), e] });
  }
  if (a === "sb-mg-add") {
    const box = el.closest(".sb-mg-add");
    const e = newMagicEntry({ school: box?.querySelector(".sb-mg-new-school")?.value, level: box?.querySelector(".sb-mg-new-level")?.value, power: box?.querySelector(".sb-mg-new-power")?.value });
    if (!e) return ui.notifications.warn(game.i18n.localize("SW25.SB.PickSchool"));
    return this.actor.update({ "system.sb.magic": [...this._sbMagicRows(), e] });
  }
  const i = this._sbMagicEntry(pos); if (i == null) return;
  const rows = this._sbMagicRows();
  if (a === "sb-mg-del") { rows.splice(i, 1); return this.actor.update({ "system.sb.magic": rows }); }
  if (a === "sb-mg-fairy") {
    const k = el.dataset.el; const set = new Set(rows[i].fairies ?? []);
    if (set.has(k)) set.delete(k); else set.add(k);
    rows[i].fairies = [...set]; return this.actor.update({ "system.sb.magic": rows });
  }
};
