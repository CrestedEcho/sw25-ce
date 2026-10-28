/**
 * Player-facing Fellow card (CR I pp.193-205) for NPC actors with system.fellow.enabled.
 * Shows only the public Fellow format data; the GM-only stat block (system.sb) is never rendered here.
 * Non-GM users opening a Fellow NPC are routed here from the stat-block sheet.
 */
import { buildFellowContext, prepareFellow, resolveFellowRoll, fellowChatHTML } from "../rules/fellow.mjs";
import { actorPortrait, bindPortrait } from "../rules/token-portrait.mjs";

export class SW25FellowSheet extends foundry.appv1.sheets.ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sw25", "sheet", "actor", "sw25-sb", "sw25-fellow"], width: 600, height: 800, submitOnChange: true, closeOnSubmit: false, tabs: [],
    });
  }
  get template() { return "systems/sw25-ce/templates/actor/actor-fellow-card.hbs"; }

  async getData(options) {
    const base = await super.getData(options);
    const ctx = buildFellowContext({ name: this.actor.name, img: actorPortrait(this.actor).src, fellow: this.actor._source.system?.fellow ?? {}, lastRoll: this._fwLast ?? null, wanted: this._fwWanted ?? null, isGM: game.user.isGM });
    return Object.assign(base, ctx, { editable: this.isEditable, canRoll: this.actor.isOwner || game.user.isGM });
  }

  _getSubmitData(updateData = {}) {
    const flat = foundry.utils.flattenObject(super._getSubmitData(updateData));
    const f = prepareFellow(this.actor._source.system?.fellow ?? {});
    const fold = (prefix, key) => {
      const ks = Object.keys(flat).filter((k) => k.startsWith(prefix)); if (!ks.length) return;
      const list = structuredClone(f[key]);
      for (const k of ks) { const [i, sub] = k.slice(prefix.length).split("."); (list[Number(i)] ??= {})[sub] = flat[k]; delete flat[k]; }
      flat[`system.fellow.${key}`] = list;
    };
    fold("fwLang.", "languages"); fold("fwCons.", "consumables");
    const rowKeys = Object.keys(flat).filter((k) => k.startsWith("system.fellow.rows."));
    if (rowKeys.length) {
      const rows = structuredClone(f.rows);
      for (const k of rowKeys) { const [i, sub] = k.slice("system.fellow.rows.".length).split("."); rows[Number(i)][sub] = flat[k]; delete flat[k]; }
      flat["system.fellow.rows"] = rows;
    }
    return flat;
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = html[0] ?? html;
    bindPortrait(this, root, ".fw-por-img", game.user.isGM && this.isEditable); // token art, GM only (as before)
    root.querySelectorAll("[data-action]").forEach((el) => el.addEventListener("click", (ev) => { ev.preventDefault(); this._onAction(el); }));
  }

  async _onAction(el) {
    const a = el.dataset.action; const f = prepareFellow(this.actor._source.system?.fellow ?? {});
    if (a === "fw-want") { const i = Number(el.dataset.index); this._fwWanted = this._fwWanted === i ? null : i; return this.render(false); }
    if (a === "fw-roll") return this.rollAction();
    if (a === "fw-cancel") return this.cancelAction();
    if (!this.isEditable) return;
    if (a === "fw-add") { const k = el.dataset.field; const row = k === "languages" ? { name: "", speak: true, read: false } : { name: "", qty: 1, from: "" }; return this.actor.update({ [`system.fellow.${k}`]: [...f[k], row] }); }
    if (a === "fw-del") { const k = el.dataset.field; const list = f[k]; list.splice(Number(el.dataset.index), 1); return this.actor.update({ [`system.fellow.${k}`]: list }); }
  }

  /** Roll 1d on the table; failure if not the wanted row; spend MP on success. */
  async rollAction() {
    const fellow = this.actor._source.system?.fellow ?? {};
    const roll = await new Roll("1d6").evaluate();
    const res = resolveFellowRoll(fellow, roll.total, this._fwWanted ?? null);
    const wantedRow = res.wanted != null ? prepareFellow(fellow).rows[res.wanted] : null;
    if (res.mpCost && this.actor.isOwner) await this.actor.update({ "system.fellow.mp.value": res.mpAfter });
    this._fwLast = res;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content: fellowChatHTML(this.actor.name, res, wantedRow), rolls: [roll] });
    return this.render(false);
  }

  /** Cancel the last action (rules allow cancelling): refund MP and note it in chat. */
  async cancelAction() {
    const res = this._fwLast; if (!res) return;
    if (res.mpCost && this.actor.isOwner) await this.actor.update({ "system.fellow.mp.value": prepareFellow(this.actor._source.system?.fellow).mp.value + res.mpCost });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content: `<div class="sw25-fellow-chat is-fail"><b>${foundry.utils.escapeHTML(this.actor.name)}</b> cancels ${foundry.utils.escapeHTML(res.row.action)}${res.mpCost ? ` (MP ${res.mpCost} refunded)` : ""}.</div>` });
    this._fwLast = null; return this.render(false);
  }
}
