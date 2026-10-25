/**
 * Styled NPC / Monster stat-block sheet (Artist mockups, SHEET_SPEC_NPC_MONSTER.md).
 * Data: system.sb.* (derived view system.sbView); overrides system.sb.overrides.<path>.{value,locked} with quill.
 * The legacy sw25 sheet stays selectable via Sheet Configuration.
 */
import { DISPOSITION_LABELS } from "../rules/statblock.mjs";
import { SW25FellowSheet } from "./fellow-sheet.mjs";
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
    return base;
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
    if (a === "skill-desc") {
      const i = Number(el.dataset.index); const rows = arr("uniqueSkills");
      const content = `<textarea name="d" rows="8" style="width:100%">${foundry.utils.escapeHTML(rows[i]?.description ?? "")}</textarea>`;
      const d = await foundry.applications.api.DialogV2.prompt({ window: { title: rows[i]?.name ?? "Skill" }, content, ok: { callback: (_e, b) => b.form.elements.d.value } });
      if (d == null) return; rows[i].description = d; return this.actor.update({ "system.sb.uniqueSkills": rows });
    }
    const id = el.closest("[data-item-id]")?.dataset.itemId; const item = id && this.actor.items.get(id);
    if (a === "item-edit") return item?.sheet.render(true);
    if (a === "item-del") return item?.delete();
  }
}
export { ARRAY_FIELDS };
