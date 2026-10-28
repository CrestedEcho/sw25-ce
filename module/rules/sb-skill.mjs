/**
 * Stat-block Unique Skill editor + chat card (pure; no Foundry globals).
 * Skill shape (system.sb.uniqueSkills[i]): {name, tags:[SKILL_TAGS keys], part, check:{value, fixed}|null,
 * resist, resistResult, description(HTML), magic?, magicMoved?}. Unknown fields are kept on save.
 */
import { SKILL_TAGS } from "./statblock-sheet-data.mjs";
import { fixedToDice } from "./sb-play.mjs";

export const TAG_ORDER = ["passive", "major", "minor", "prep", "declared"];
/** Resistance check / result keys = CONFIG.SW25.resistCheck / resistResult (labels from SW25.Resist.*). */
export const RESIST_CHECKS = { Dodge: "Evasion", Vitres: "Fortitude", Mndres: "Willpower" };
export const RESIST_RESULTS = { decide: "Can't", any: "Optional", none: "None", disappear: "Negated", halving: "Half", shortening: "Temporary" };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const numOrNull = (v) => { if (v === "" || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

/** Map legacy free text ("Vitality", "Mental Resistance", "Negates", ...) to option keys; unknown text kept as-is. */
export function normResist(v) {
  const t = String(v ?? "").trim(); if (!t) return "";
  if (RESIST_CHECKS[t]) return t;
  if (/vital|fort/i.test(t)) return "Vitres";
  if (/mental|will|mind/i.test(t)) return "Mndres";
  if (/evas|dodge/i.test(t)) return "Dodge";
  return t;
}
export function normResult(v) {
  const t = String(v ?? "").trim(); if (!t) return "";
  if (RESIST_RESULTS[t]) return t;
  if (/negat|disappear/i.test(t)) return "disappear";
  if (/half/i.test(t)) return "halving";
  if (/short|temp/i.test(t)) return "shortening";
  if (/can.?t|decide/i.test(t)) return "decide";
  if (/option|any/i.test(t)) return "any";
  if (/^none$/i.test(t)) return "none";
  return t;
}
export const resistLabel = (k, labels = RESIST_CHECKS) => (k ? labels[normResist(k)] ?? String(k) : "");
export const resultLabel = (k, labels = RESIST_RESULTS) => (k ? labels[normResult(k)] ?? String(k) : "");

/** Tag chips (ordered, de-duplicated, unknown keys dropped). */
export const tagInfo = (tags) => TAG_ORDER.filter((k) => (tags ?? []).includes(k)).map((k) => ({ key: k, ...SKILL_TAGS[k] }));

/** Template data for the editor dialog. parts = view parts ([{name}]). */
export function skillEditorData(skill = {}, parts = [], { checks = RESIST_CHECKS, results = RESIST_RESULTS } = {}) {
  const s = skill ?? {}; const tags = new Set(s.tags ?? []);
  const resist = normResist(s.resist); const result = normResult(s.resistResult);
  const opt = (map, cur) => { const o = Object.entries(map).map(([value, label]) => ({ value, label, selected: value === cur })); if (cur && !map[cur]) o.push({ value: cur, label: cur, selected: true }); return o; };
  const value = s.check?.value ?? null;
  return {
    name: s.name ?? "",
    parts: [{ value: "", label: "— (whole monster)", selected: !s.part }, ...parts.map((p) => ({ value: p.name, label: p.name, selected: p.name === s.part }))]
      .concat(s.part && !parts.some((p) => p.name === s.part) ? [{ value: s.part, label: s.part, selected: true }] : []),
    tags: TAG_ORDER.map((k) => ({ key: k, ...SKILL_TAGS[k], on: tags.has(k) })),
    checkValue: value ?? "", checkFixed: value != null ? Number(value) + 7 : "",
    resists: opt(checks, resist), results: opt(results, result), description: s.description ?? "",
  };
}

/** Editor form -> skill (prev keeps unknown fields such as magic / magicMoved). */
export function skillFromForm(f = {}, prev = {}) {
  const tagList = Array.isArray(f.tags) ? f.tags : (f.tags ? [f.tags] : TAG_ORDER.filter((k) => f[`tag.${k}`] || f.tag?.[k]));
  const value = numOrNull(f.checkValue);
  return {
    ...prev,
    name: String(f.name ?? "").trim() || "Unnamed skill",
    tags: TAG_ORDER.filter((k) => tagList.includes(k)),
    part: String(f.part ?? "").trim() || null,
    check: value == null ? null : { value, fixed: value + 7 },
    resist: String(f.resist ?? "").trim() || null,
    resistResult: String(f.resistResult ?? "").trim() || null,
    description: String(f.description ?? ""),
  };
}

/** Chat card HTML. description = enriched HTML (trusted, from the editor). Check buttons use data-sw25-skchk. */
export function skillCardHtml(skill, { actorName = "", description = "", gmOnly = false, checkLabels = RESIST_CHECKS, resultLabels = RESIST_RESULTS } = {}) {
  const s = skill ?? {};
  const icons = tagInfo(s.tags).map((t) => (t.icon ? `<img class="sw25-sk-tag" src="${esc(t.icon)}" alt="${esc(t.glyph)}" title="${esc(t.tip)}" data-tooltip="${esc(t.tip)}">` : `<span class="sw25-sk-glyph" title="${esc(t.tip)}">${esc(t.glyph)}</span>`)).join("");
  const tagText = tagInfo(s.tags).map((t) => t.label).join(" · ");
  const d = s.check?.value != null ? fixedToDice(Number(s.check.fixed ?? Number(s.check.value) + 7)) : null;
  const label = `${actorName ? `${actorName}: ` : ""}${s.name ?? "Skill"}`;
  const btn = d ? `<div class="sw25-sk-check"><span>Check <b>${d.fixed - 7}</b> (${d.fixed})</span>`
    + `<button type="button" data-sw25-skchk="fixed" data-fixed="${d.fixed}" data-label="${esc(label)}"><i class="fas fa-square"></i> ${d.fixed}</button>`
    + `<button type="button" data-sw25-skchk="dice" data-fixed="${d.fixed}" data-label="${esc(label)}"><i class="fas fa-dice"></i> ${esc(d.formula)}</button></div>` : "";
  const res = s.resist ? `<div class="sw25-sk-resist">Resist: <b>${esc(resistLabel(s.resist, checkLabels))}</b>${s.resistResult ? ` / ${esc(resultLabel(s.resistResult, resultLabels))}` : ""}</div>` : "";
  return `<div class="sw25-skill-card${gmOnly ? " is-gm" : ""}">`
    + `<header class="sw25-sk-head">${icons}<h3>${esc(s.name ?? "Skill")}</h3></header>`
    + `<div class="sw25-sk-meta">${s.part ? `<span class="sw25-sk-part">${esc(s.part)}</span>` : ""}${tagText ? `<span class="sw25-sk-tags">${esc(tagText)}</span>` : ""}${gmOnly ? `<span class="sw25-sk-gm"><i class="fas fa-eye-slash"></i> GM only</span>` : ""}</div>`
    + btn + res + (description ? `<div class="sw25-sk-desc">${description}</div>` : "") + `</div>`;
}

/** Chat: Unique Skill card check buttons (fixed posts F; dice rolls 2d6 + (F − 7)). Call once at init (uses Foundry globals at runtime only). */
export function registerSkillCardHooks() {
  Hooks.on("renderChatMessageHTML", (msg, el) => {
    el.querySelectorAll?.("[data-sw25-skchk]").forEach((b) => b.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const d = fixedToDice(Number(b.dataset.fixed)); if (!d) return;
      const label = b.dataset.label ?? "Check"; const speaker = msg.speaker ?? ChatMessage.getSpeaker();
      const whisper = msg.whisper?.length ? [...msg.whisper] : undefined;
      if (b.dataset.sw25Skchk === "fixed") return ChatMessage.create({ speaker, whisper, content: `<div class="sw25-sbcheck"><b>${esc(label)}</b>: fixed value <b>${d.fixed}</b></div>` });
      const r = await new Roll(d.formula).evaluate();
      return r.toMessage({ speaker, whisper, flavor: `${esc(label)} <small>(fixed ${d.fixed})</small>` });
    }));
  });
}
