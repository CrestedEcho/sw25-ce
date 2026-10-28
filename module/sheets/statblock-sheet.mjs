/**
 * Styled NPC / Monster stat-block sheet (Artist mockups, SHEET_SPEC_NPC_MONSTER.md).
 * Data: system.sb.* (derived view system.sbView); overrides system.sb.overrides.<path>.{value,locked} with quill.
 * The legacy sw25 sheet stays selectable via Sheet Configuration.
 */
import { DISPOSITION_LABELS } from "../rules/statblock.mjs";
import { postAttackCard } from "../rules/attack-flow.mjs";
import { parseMagicSkill, spellMeta, spellsForSkill, defaultCost, applySbCost, castChatHTML } from "../rules/sb-cast.mjs";
import { rollSpellDamage } from "../rules/spell-power.mjs";
import { rollMessageData } from "../rules/dice-fx.mjs";
import { applyDamageToTargets } from "../rules/apply-damage.mjs";
import { SW25FellowSheet } from "./fellow-sheet.mjs";
import { fixedToDice, parseSbDamage, applyVital, lootFor, castIsWhisper, spellGmOnly, slugKey } from "../rules/sb-play.mjs";
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
    const ctx = buildStatBlockContext({ type: this.actor.type, view, raw, isGM: game.user.isGM, img: this.actor.img });
    const TE = foundry.applications.ux.TextEditor.implementation;
    const enrich = (h) => TE.enrichHTML(h ?? "", { secrets: this.actor.isOwner, relativeTo: this.actor });
    Object.assign(base, ctx, {
      tokenDispositionKey: String(DISPOSITION_LABELS[this.actor.prototypeToken?.disposition] ?? "").toLowerCase(),
      tokenDisposition: DISPOSITION_LABELS[this.actor.prototypeToken?.disposition] ?? "—",
      fellowOn: !!this.actor.system.fellow?.enabled, attitudes: ATTITUDES, editable: this.isEditable, owner: this.actor.isOwner,
      items: this.actor.items.contents.map((i) => ({ _id: i.id, name: i.name, img: i.img, type: i.type })),
      notesHTML: await enrich(raw.notes), secretsHTML: game.user.isGM ? await enrich(raw.secrets) : "",
      descriptionHTML: await enrich(raw.description || view.description),
    });
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
    // Spellcasting: each castable skill lists its spells with a Cast button (and GM-only toggle when there is no Power).
    const gmMap = this.actor.getFlag("sw25-ce", "sbSpellGmOnly") ?? {};
    if (base.casters.length) {
      const docs = await this._sbSpellDocs();
      for (const c of base.casters) {
        c.spells = spellsForSkill({ schools: c.schools, level: c.level }, docs).map((m) => {
          const d = docs.find((x) => x.name === m.name) ?? {};
          return { name: m.name, level: m.level, cost: m.cost.raw || (m.cost.base != null ? `MP${m.cost.base}` : "—"),
            target: [d.system?.target, d.flags?.["sw25-ce"]?.data?.range].filter(Boolean).join(" · ") || "—",
            power: m.power ? (typeof m.power === "object" ? (m.power.rate ?? m.power.value ?? "") : m.power) : null,
            key: slugKey(m.name), gmOnly: !m.power && spellGmOnly(gmMap, m.name) };
        });
      }
    }
    return base;
  }

  /** Spell documents for casting: sw25-spells compendium (cached) + embedded spell items. */
  async _sbSpellDocs() {
    const pack = game.packs.get("sw25-ce.sw25-spells");
    SW25StatBlockSheet._spellCache ??= pack ? (await pack.getDocuments()).map((d) => Object.assign(d.toObject(), { uuid: d.uuid })) : [];
    return [...SW25StatBlockSheet._spellCache, ...this.actor.items.filter((i) => i.type === "spell").map((d) => Object.assign(d.toObject(), { uuid: d.uuid }))];
  }

  /** Belt drops reuse the PC sheet's belt logic; everything else is the normal item drop (Inventory). */
  async _onDrop(event) {
    const target = event.target?.closest?.("[data-sw-drop=belt]");
    if (target && this.isEditable) {
      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
      if (data?.type === "Item") return dropOnBelt(this.actor, target, data);
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
      parts[Number(idx)][key] = val;
      this.actor.update({ "system.sb.parts": parts });
    }));
    if (!this.isEditable) return;
    if (!this._sbEdit) root.querySelectorAll(".sb-sheet .sb-in:not(.sb-keep)").forEach((el) => { el.disabled = true; });
    root.querySelectorAll(".sb-vamt").forEach((el) => { el.addEventListener("change", (ev) => ev.stopPropagation()); el.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); } }); });
    bindBeltListeners(this, root);
    root.querySelectorAll("[data-action]").forEach((el) => el.addEventListener("click", (ev) => this._onAction(ev, el)));
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
    if (a === "sb-gmonly") { const k = el.dataset.key; const cur = spellGmOnly(this.actor.getFlag("sw25-ce", "sbSpellGmOnly") ?? {}, k); return this.actor.setFlag("sw25-ce", "sbSpellGmOnly", { [k]: !cur }); }
    if (a === "skill-desc") {
      const i = Number(el.dataset.index); const rows = arr("uniqueSkills");
      const content = `<textarea name="d" rows="8" style="width:100%">${foundry.utils.escapeHTML(rows[i]?.description ?? "")}</textarea>`;
      const d = await foundry.applications.api.DialogV2.prompt({ window: { title: rows[i]?.name ?? "Skill" }, content, ok: { callback: (_e, b) => b.form.elements.d.value } });
      if (d == null) return; rows[i].description = d; return this.actor.update({ "system.sb.uniqueSkills": rows });
    }
    const id = el.closest("[data-item-id]")?.dataset.itemId; const item = id && this.actor.items.get(id);
    if (a === "item-edit") return item?.sheet.render(true);
    if (a === "item-del") return item?.delete();
    if (a === "item-roll") return item?.roll();
    if (a === "item-show") return this._sbShowItem(item);
  }
}

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
  const viewParts = view.parts ?? []; const rawParts = Array.isArray(raw.parts) ? raw.parts : Object.values(raw.parts ?? {});
  const core = Math.max(0, viewParts.findIndex((p) => p.isCore));
  let mp = defaultCost(meta), hp = meta.cost.hp, rank = null, partIndex = core;
  if (meta.needsDialog || viewParts.length > 1) {
    const ranks = meta.ranks ? Object.keys(meta.ranks) : [];
    const content = `<p><b>${esc(meta.name)}</b> — listed cost: ${esc(meta.cost.raw || `MP${meta.cost.base}`)}</p>`
      + (ranks.length ? `<label>Deity rank <select name="rank">${ranks.map((r) => `<option value="${esc(r)}">${esc(r)} (MP${meta.ranks[r]})</option>`).join("")}</select></label><br>` : "")
      + (meta.ritual ? `<p class="notes"><i>Ritual casting:</i> ${esc(String(meta.ritual))}</p>` : "")
      + `<label>MP <input type="number" name="mp" value="${mp}" min="0"></label> <label>HP <input type="number" name="hp" value="${hp}" min="0"></label>`
      + (viewParts.length > 1 ? `<br><label>Paid by <select name="part">${viewParts.map((p, n) => `<option value="${n}" ${n === core ? "selected" : ""}>${esc(p.name)}${p.isCore ? " ★" : ""} (MP ${p.mpValue ?? p.mp ?? 0})</option>`).join("")}</select></label>` : "");
    const res = await foundry.applications.api.DialogV2.prompt({ window: { title: "Spell cost" }, content,
      render: (_e, dlg) => { const f = dlg.element.querySelector("form"); f?.elements.rank?.addEventListener("change", (ev) => { f.elements.mp.value = defaultCost(meta, ev.target.value); }); if (f?.elements.rank) f.elements.mp.value = defaultCost(meta, f.elements.rank.value); },
      ok: { label: "Cast", callback: (_e, b) => { const f = b.form.elements; return { mp: Number(f.mp.value) || 0, hp: Number(f.hp.value) || 0, rank: f.rank?.value ?? null, part: f.part ? Number(f.part.value) : core }; } } }).catch((err) => { if (err) console.error("sw25 | cast cost dialog", err); return null; });
    if (!res) return; ({ mp, hp, rank } = res); partIndex = res.part;
  }
  const out = applySbCost(rawParts, viewParts, { mp, hp, partIndex });
  if (out.index < 0) return ui.notifications.warn("This stat block has no parts to pay MP from.");
  if (out.mpShort) ui.notifications.warn(`${actor.name}: not enough MP (${out.mpBefore}) — cast anyway.`);
  await actor.update({ "system.sb.parts": out.parts });
  const dmgRolls = []; // power roll + crit rerolls, attached to the card as dice
  if (meta.power) {
    out.damage = await rollSpellDamage({ power: meta.power, crit: meta.powerCrit, magicPower: skill.magicPower ?? 0 }, async () => { const x = await new Roll("2d6").evaluate(); dmgRolls.push(x); return x.total; });
  }
  const partName = viewParts.length > 1 ? viewParts[out.index]?.name : null;
  // Casting check (2d6 + magic power) on the same card as the damage.
  const sk = skills[index]; const ck = sk?.check ?? (sk?.magic?.power != null ? sk.magic.power : null);
  const fixed = ck == null ? null : typeof ck === "object" ? (ck.fixed ?? (Number(ck.value) + 7)) : Number(ck) + 7;
  const fd = fixedToDice(fixed); const rolls = [];
  let castLine = "";
  if (fd) { const r = await new Roll(fd.formula).evaluate(); rolls.push(r);
    castLine = `<div class="sw25-sbcast-check">Casting Power <small>(fixed ${fd.fixed})</small> 🎲 ${fd.formula} = <b>${r.total}</b></div>`; }
  const whisper = castIsWhisper(meta, actor.getFlag("sw25-ce", "sbSpellGmOnly") ?? {});
  let desc = "";
  if (!meta.power) {
    const d = docs.find((x) => x.name === meta.name);
    const TE = foundry.applications.ux.TextEditor.implementation;
    const tgt = [d?.system?.target, d?.flags?.["sw25-ce"]?.data?.range, d?.system?.resist ? `Resist: ${d.system.resist}` : ""].filter(Boolean).join(" · ");
    desc = (tgt ? `<div><small>${esc(tgt)}</small></div>` : "") + `<div class="sw25-sbcast-desc">${await TE.enrichHTML(d?.system?.description ?? "", { relativeTo: actor })}</div>`;
  }
  const head = whisper ? `<div class="sw25-gmonly"><i class="fas fa-eye-slash"></i> Whisper · GM only</div>` : "";
  rolls.push(...dmgRolls);
  const data = rollMessageData({ speaker: ChatMessage.getSpeaker({ actor }), rolls,
    content: head + castChatHTML(actor.name, meta, { mp, hp, rank, ritual: !!meta.ritual, partName }, out, castLine + desc) });
  if (whisper) { data.whisper = ChatMessage.getWhisperRecipients("GM").map((u) => u.id); delete data.blind; }
  return ChatMessage.create(data);
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
