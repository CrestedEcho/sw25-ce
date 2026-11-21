/* sw25-ce ce.25: Sleep 3h / 6h buttons and Soulscars (Foundry glue). Math: module/rules/rest.mjs. */
import { restResult } from "../rules/rest.mjs";

const i18n = (k, d) => { try { return game.i18n.has?.(k) === false ? d ?? k : game.i18n.localize(k); } catch { return d ?? k; } };
const fmt = (k, data, d) => { try { return game.i18n.has?.(k) === false ? d : game.i18n.format(k, data); } catch { return d; } };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Ask, apply and post the chat card. Never runs by itself. */
export async function sleepRest(actor, hours) {
  const h = Number(hours) === 3 ? 3 : 6;
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: fmt("SW25.V2.Rest.Title", { hours: h }, `Sleep ${h}h`), icon: "fas fa-moon" },
    content: `<p>${esc(i18n("SW25.V2.Rest.Question", "Is the character fed, sheltered and with bedding?"))}</p>`,
    yes: { label: i18n("Yes", "Yes") }, no: { label: i18n("No", "No") }, rejectClose: false,
  });
  if (ok === null || ok === undefined) return null; // closed: nothing happens
  const sys = actor.system ?? {};
  const res = restResult({ hours: h, ok: !!ok, hp: { value: sys.hp?.value, max: sys.hp?.max }, mp: { value: sys.mp?.value, max: sys.mp?.max } });
  if (res.ok && (res.hp.gain || res.mp.gain)) await actor.update({ "system.hp.value": res.hp.after, "system.mp.value": res.mp.after });
  let body;
  if (!res.ok) body = `<p>${esc(fmt("SW25.V2.Rest.NoRecovery", { name: actor.name, hours: h }, `${actor.name} slept ${h}h: no recovery (not fed, sheltered or with bedding)`))}</p>`;
  else body = `<p><b>${esc(fmt("SW25.V2.Rest.Slept", { name: actor.name, hours: h }, `${actor.name} slept ${h}h`))}</b></p>
    <ul class="sw-rest-list">
      <li>HP +${res.hp.gain} (${res.hp.before} → ${res.hp.after} / ${res.hp.max})</li>
      <li>MP +${res.mp.gain} (${res.mp.before} → ${res.mp.after} / ${res.mp.max})</li>
    </ul>
    <p class="hint"><small>${esc(i18n(h === 3 ? "SW25.V2.Rest.Rule3" : "SW25.V2.Rest.Rule6", ""))}</small></p>`;
  const content = `<div class="sw25 sw-rest-card"><h3><i class="fas fa-moon"></i> ${esc(fmt("SW25.V2.Rest.Title", { hours: h }, `Sleep ${h}h`))}</h3>${body}
    <p class="hint"><small>${esc(i18n("SW25.V2.Rest.Cap", "Sleeping more than 6 hours in a day gives no extra recovery."))}</small></p></div>`;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
  return res;
}

/** Soulscars +/- (bound to system.attributes.impurity; never below 0). */
export async function adjustSoulscars(actor, delta) {
  const cur = Number(actor.system?.attributes?.impurity) || 0;
  return actor.update({ "system.attributes.impurity": Math.max(0, cur + Number(delta || 0)) });
}

export function bindRestListeners(sheet, html) {
  const actor = sheet.actor;
  html.on("click", ".sw-sleep", (ev) => { ev.preventDefault(); ev.stopPropagation(); sleepRest(actor, ev.currentTarget.dataset.hours); });
  html.on("click", ".sw-soulscar-adj", (ev) => { ev.preventDefault(); ev.stopPropagation(); adjustSoulscars(actor, ev.currentTarget.dataset.delta); });
}
