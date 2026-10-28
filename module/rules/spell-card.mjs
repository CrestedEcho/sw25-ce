/* sw25-ce: spell list rows, description card, cast window and cast chat card (pure HTML builders, unit-tested).
 * Buttons on the cast card read the tokens selected/targeted at click time (live "Applies to:" line):
 *   data-sw25-magic-dmg / data-sw25-heal (existing handlers), data-sw25-status (Apply Effect, from spell data).
 */
import { spellMpValue, isVariableMpText } from "./spell-mp.mjs";
import { isHealSpell, hasPowerObject } from "./spell-power.mjs";
import { mpLine, shortLine } from "./spell-pay.mjs";
import { conditionFor } from "./conditions.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const txt = (v) => (v == null || v === 0 || v === "0" ? "" : String(v).trim());

/** Friendly stat keys for spell effects -> ActiveEffect change keys (mode ADD). Unknown keys pass through as-is. */
export const EFFECT_KEYS = {
  accuracy: "system.attributes.efhitmod", evasion: "system.attributes.efdodgemod", damage: "system.attributes.efdmod",
  defense: "system.attributes.efppmod", move: "system.attributes.move.efmovemod",
  dex: "system.abilities.dex.efvaluemodify", agi: "system.abilities.agi.efvaluemodify", str: "system.abilities.str.efvaluemodify",
  vit: "system.abilities.vit.efvaluemodify", int: "system.abilities.int.efvaluemodify", mnd: "system.abilities.mnd.efvaluemodify",
};
const STAT_WORDS = { accuracy: "Accuracy", evasion: "Evasion", damage: "Damage", defense: "Defense", move: "Movement", dex: "Dexterity", agi: "Agility", str: "Strength", vit: "Vitality", int: "Intelligence", mnd: "Spirit" };
const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

/** Rounds from a spell time text: "(18 rounds)", "3 minutes" (x6), "10 seconds" (/10), "1 round". 0 when unknown/instant. */
export function roundsFromTime(time) {
  const t = String(time ?? "");
  let m = t.match(/(\d+)\s*rounds?/i); if (m) return Number(m[1]);
  m = t.match(/(\d+)\s*minutes?/i); if (m) return Number(m[1]) * 6;
  m = t.match(/(\d+)\s*seconds?/i); if (m) return Math.max(1, Math.round(Number(m[1]) / 10));
  return 0;
}

/** Effect carried by the spell (system.status), or null. Data-driven: nothing is hardcoded per spell.
 * { id (Foundry status id, optional), label, rounds, review, note, description, buff, changes:[{key, value}] } */
export function statusOf(sys = {}) {
  const s = sys?.status;
  if (!s || typeof s !== "object") return null;
  const id = String(s.id ?? "").trim(); const label = txt(s.label);
  const changes = (Array.isArray(s.changes) ? s.changes : []).map((c) => ({ key: String(c?.key ?? "").trim(), value: Number(c?.value) || 0 })).filter((c) => c.key && c.value);
  if (!id && !label && !changes.length) return null;
  return { id, label: label || conditionFor(id)?.name || (id ? id.charAt(0).toUpperCase() + id.slice(1) : "Effect"), rounds: Math.max(0, Math.floor(Number(s.rounds) || 0)) || roundsFromTime(sys.time),
    review: !!s.review, note: txt(s.note), description: txt(s.description), buff: !!s.buff, changes };
}
/** "Accuracy -2, Evasion -2" */
export function changesText(changes = []) {
  return changes.map((c) => `${STAT_WORDS[c.key] ?? c.key} ${sign(c.value)}`).join(", ");
}
/** ActiveEffect create data for a spell effect (pure). img = status icon or fallback. */
export function effectData(st, { img = null, origin = null, spell = "", combat = null } = {}) {
  // Matching SW2.5 condition (by id, then by label e.g. "Petrifaction") -> statuses, so it shows on the token.
  const cond = conditionFor(st.id) ?? conditionFor(st.label);
  const statuses = cond ? [cond.id] : (st.id ? [st.id] : []);
  img = img ?? cond?.icon ?? (st.buff ? "icons/svg/upgrade.svg" : "icons/svg/aura.svg");
  const dur = st.rounds ? { rounds: st.rounds, ...(combat ? { combat: combat.id, startRound: combat.round, startTurn: combat.turn ?? 0 } : {}) } : {};
  const changes = (st.changes ?? []).map((c) => ({ key: EFFECT_KEYS[c.key] ?? c.key, mode: 2, value: String(c.value), priority: 20 }));
  const desc = [st.description, changesText(st.changes)].filter(Boolean).map(esc).join("<br>");
  return { name: st.label || cond?.name || "Effect", img, statuses, changes, description: desc ? `<p>${desc}</p>` : (cond ? `<p>${esc(cond.description)}</p>` : ""),
    duration: dur, ...(origin ? { origin } : {}), flags: { "sw25-ce": { spellEffect: { spell, buff: !!st.buff, review: !!st.review } } } };
}
/** Damage-type tags (poison, curse...) are labels, not statuses. */
export function tagsOf(sys = {}) {
  return (Array.isArray(sys?.tags) ? sys.tags : []).map((t) => txt(t)).filter(Boolean);
}

/** Plain-word spell facts used by the list row, description card and cast card. */
export function spellInfo(item = {}) {
  const sys = item.system ?? {}; const data = item.flags?.["sw25-ce"]?.data ?? {};
  const mp = spellMpValue(sys);
  return {
    id: item.id ?? item._id, name: item.name ?? "", img: item.img ?? "",
    school: txt(sys.typename) || txt(sys.type), level: txt(sys.level ?? data.level),
    mp: mp == null || mp === "" ? "" : Number(mp), mpText: txt(sys.mpcostText),
    target: txt(sys.target) || "—", range: txt(sys.range) || txt(sys.rangeshape) || "—", duration: txt(sys.time) || "—",
    resist: txt(sys.resistname) || txt(sys.resist), element: txt(sys.propname) || txt(sys.element),
    description: sys.description ?? "", damage: hasPowerObject(sys),
    heal: isHealSpell({ name: item.name, summary: data.summary ?? sys.summary, description: sys.description }),
    status: statusOf(sys), tags: tagsOf(sys), tagsReview: !!sys.tagsReview,
  };
}
/** Short line under the name in the list: "Truespeech · Lv1 · resist: Half". */
export function subLine(info) {
  return [info.school, info.level ? `Lv${info.level}` : "", info.resist ? `resist: ${info.resist}` : "", info.status ? `can cause ${info.status.label}` : ""].filter(Boolean).join(" · ");
}

/** Chat card when the spell NAME is clicked: description only, MP is never touched. */
export function descCardHTML(info) {
  return `<div class="sw25-spellcard sw25-spelldesc">${headerHTML(info, subLine(info))}${tagsHTML(info)}<div class="sw25-sc-desc">${info.description || "<i>No description.</i>"}</div></div>`;
}
function headerHTML(info, sub) {
  return `<header class="sw25-sc-head">${info.img ? `<img src="${esc(info.img)}" width="36" height="36">` : ""}<div><b class="sw25-sc-name">${esc(info.name)}</b>${sub ? `<div class="sw25-sc-sub">${esc(sub)}</div>` : ""}</div></header>`;
}
function tagsHTML(info) {
  const t = [["Target", info.target], ["Range", info.range], ["Duration", info.duration], ["Resist", info.resist], ...(info.tags ?? []).map((g) => [`Type${info.tagsReview ? " (unreviewed guess)" : ""}`, g])].filter(([, v]) => v && v !== "—");
  return t.length ? `<div class="sw25-sc-tags">${t.map(([k, v]) => `<span class="sw25-sc-tag" data-tooltip="${esc(k)}">${esc(v)}</span>`).join("")}</div>` : "";
}

/**
 * Cast chat card. cast = { total, formula, dice? }, damage = rollSpellDamage result or null, pay = payPlan, opts = { actorName, costNote }.
 * Returns { html, whisperDefault } — spells with no damage/healing roll keep the old roll-mode default (GM whisper).
 */
export function castCardHTML(info, { cast = null, damage = null, pay = null, actorName = "", costNote = "" } = {}) {
  const sub = [actorName, costNote].filter(Boolean).join(" · ");
  const rows = [];
  if (cast) rows.push(rollRow("Casting roll", cast.formula, cast.total, cast.note));
  const btns = [];
  if (damage && !damage.fumble) {
    const kind = info.heal ? "Healing" : "Damage";
    rows.push(rollRow(`${kind}${info.element ? ` (${info.element})` : ""}`, `Power ${damage.rate ?? "?"} · rolls ${(damage.rolls ?? []).join(" → ")}${damage.crits ? ` (crit ×${damage.crits})` : ""} · table ${damage.table} + Magic Power ${damage.magicPower}`, damage.total));
    if (info.heal) btns.push(`<button type="button" class="sw25-sc-btn heal" data-sw25-heal="${damage.total}" data-tooltip="Heals the tokens shown on the Applies to line (capped at max HP).">Apply Healing ${damage.total}</button>`);
    else {
      btns.push(`<button type="button" class="sw25-sc-btn dmg" data-sw25-magic-dmg="${damage.total}" data-tooltip="Magic damage: Defense is not subtracted. Hits the tokens shown on the Applies to line.">Apply Damage ${damage.total}</button>`);
      if (/half/i.test(info.resist)) btns.push(`<button type="button" class="sw25-sc-btn alt" data-sw25-magic-dmg="${damage.half}" data-tooltip="Use this for targets that resisted: half damage, rounded up.">Apply Half ${damage.half} (resisted)</button>`);
    }
  } else if (damage?.fumble) rows.push(`<div class="sw25-sc-roll fumble">${esc(info.heal ? "Healing" : "Damage")}: rolled ${damage.rolls?.[0]}: automatic failure.</div>`);
  if (info.status) btns.push(statusButtonHTML(info.status));
  const pl = pay ? `<div class="sw25-sc-mp" data-tooltip="Where the MP for this cast came from.">${esc(mpLine(pay))}</div>` : "";
  const sl = pay && shortLine(pay) ? `<div class="sw25-sc-short">⚠ ${esc(shortLine(pay))}</div>` : "";
  const live = btns.length ? `<div class="sw25-live-targets" data-tooltip="The buttons below affect these tokens: whatever you have selected or targeted when you click."></div>` : "";
  const desc = info.description ? `<details class="sw25-sc-more"><summary>Description</summary><div class="sw25-sc-desc">${info.description}</div></details>` : "";
  const html = `<div class="sw25-spellcard sw25-spellcast">${headerHTML(info, sub)}${tagsHTML(info)}${pl}${sl}${rows.join("")}${live}${btns.length ? `<div class="sw25-sc-btns">${btns.join("")}</div>` : ""}${desc}</div>`;
  return { html, whisperDefault: !damage };
}
function rollRow(label, formula, total, note) {
  return `<div class="sw25-sc-roll"><div><b>${esc(label)}</b>${formula ? `<div class="sw25-sc-f">${esc(formula)}</div>` : ""}${note ? `<div class="sw25-sc-f">${esc(note)}</div>` : ""}</div><div class="sw25-sc-total">${esc(total)}</div></div>`;
}
export function statusButtonHTML(st) {
  if (!st) return "";
  const what = [st.description, changesText(st.changes)].filter(Boolean).join(" · ");
  const verb = st.buff ? "Apply Buff" : "Apply Effect";
  const tip = `${st.buff ? "Adds this buff to" : "Adds this effect to"} the tokens on the Applies to line${st.rounds ? ` for ${st.rounds} rounds` : ""}.${what ? ` ${what}.` : ""}${st.buff ? "" : " Skip it for targets that resisted."}${st.review ? " Unreviewed: guessed from the spell text, check before use." : ""}`;
  return `<button type="button" class="sw25-sc-btn status${st.buff ? " buff" : ""}" data-sw25-status="${esc(st.id)}" data-sw25-effect="${esc(JSON.stringify(st))}" data-label="${esc(st.label)}" data-rounds="${st.rounds}" data-tooltip="${esc(tip)}">${verb}: ${esc(st.label)}${st.rounds ? ` (${st.rounds} rd)` : ""}${st.review ? ` <span class="sw25-sc-unrev">unreviewed</span>` : ""}</button>`;
}

/** Cast window body. ctx = { info, base, mp, mpMax, targets:{source,multiplier}|null, sur:{label,mp}|null, stones:makoInfo[], limit, nTargets }. */
export function castWindowHTML(ctx) {
  const { info, base = 0, mp = 0, mpMax = 0, targets = null, sur = null, stones = [], limit = 1, nTargets = 1, poolLabel = "Your MP", spendLabel = "Spend my MP", allowNoMP = false, extraHTML = "" } = ctx;
  const step = (name, label, hint, value, min, tip) => `<div class="sw25-cw-row" data-tooltip="${esc(tip)}"><div><b>${esc(label)}</b><div class="sw25-cw-hint">${esc(hint)}</div></div>`
    + `<button type="button" class="sw25-cw-step" data-step="${name}" data-d="-1" aria-label="Less">−</button><input type="number" name="${name}" value="${value}" min="${min}" class="sw25-cw-num"><button type="button" class="sw25-cw-step" data-step="${name}" data-d="1" aria-label="More">+</button></div>`;
  const noMP = !allowNoMP && Number(mpMax) <= 0;
  let h = `<div class="sw25-castwin"><div class="sw25-cw-title">${info.img ? `<img src="${esc(info.img)}" width="32" height="32">` : ""}<div><b>Cast ${esc(info.name)}</b><div class="sw25-cw-hint">Listed cost ${esc(info.mpText || `${base} MP`)} · ${esc(info.target)} · ${esc(info.range)}</div></div></div>`;
  if (targets) h += step("targets", "Number of targets", `${targets.source ?? "Metamagic: Targets"}: ×${base} MP per target`, Math.max(1, nTargets), 1, "Cast on more than one target. Each target costs the full MP again.");
  h += step("meta", "Metamagic (cost ×)", "Distance, time, etc.: each step multiplies the cost", 1, 1, "Metamagic makes the spell bigger. Set how many times the MP cost is paid (1 = normal).");
  if (sur) h += `<label class="sw25-cw-row" data-tooltip="Divine magic outside your god's area costs extra."><div><b>Outside the god's influence</b><div class="sw25-cw-hint">${esc(sur.label)}: +${sur.mp} MP</div></div><input type="checkbox" name="out"></label>`;
  h += extraHTML;
  h += step("adjust", "Adjust cost by hand", "For GM rulings, discounts or extra costs", 0, -999, "Add or remove MP from the final cost.");
  h += `<div class="sw25-cw-total"><span>Final cost: <b class="sw25-cw-cost">${base}</b> MP</span><span>${esc(poolLabel)}: <b class="sw25-cw-pool">${mp} / ${mpMax}</b></span></div>`;
  h += `<div class="sw25-cw-pay"><div class="sw25-cw-paytitle">Pay with</div>`;
  h += `<label class="sw25-cw-opt" data-tooltip="${noMP ? "This character has no MP of their own (e.g. Grassrunner): use Mako Stones." : "MP is only taken when you press Cast."}"><input type="checkbox" name="spendMP" ${noMP ? "disabled" : "checked"}> ${esc(spendLabel)}${noMP ? " (no MP: stones only)" : ""}</label>`;
  if (stones.length) {
    h += `<div class="sw25-cw-hint">Mako Stones: pick up to ${limit} (a stone pays first, your MP pays the rest)</div>`;
    h += stones.map((s, i) => `<label class="sw25-cw-opt" data-tooltip="${esc(s.name)}: ${s.value}/${s.max} points left${s.qty > 1 ? ` · ×${s.qty} in the stack` : ""}${s.daily ? " · refills daily" : ""}"><input type="checkbox" name="stone" value="${esc(s.id)}" ${noMP && i === 0 ? "checked" : ""}> ${esc(s.name)} <span class="sw25-cw-hint">${s.value}/${s.max} pts${s.qty > 1 ? ` ×${s.qty}` : ""}${s.daily ? " · daily" : ""}</span></label>`).join("");
  }
  h += `</div><div class="sw25-cw-plan"></div><div class="sw25-cw-warn" hidden></div></div>`;
  return h;
}

/** Spell list row helper for the sheet (precomputed, so the template stays simple). */
export function rowData(item) {
  const i = spellInfo(item);
  return { sub: subLine(i), mp: isVariableMpText(i.mpText) ? i.mpText : i.mp === "" ? (i.mpText || "—") : `${i.mp} MP`, target: i.target, range: i.range, duration: i.duration, hasStatus: !!i.status };
}
