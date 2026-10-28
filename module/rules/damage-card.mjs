/**
 * sw25-ce damage chat card: PURE helpers (unit-tested).
 * Crits chain more power-table rolls at the same Power; the bonus is added ONCE. A natural 2 on the
 * first roll = 0 damage. Defense is subtracted for physical damage only (magic / fixed skip it),
 * BEFORE the multiplier; fractions round up. ×−1 heals the amount (no Defense); ×0 does nothing.
 */
import { partSelectHTML } from "./part-pick.mjs";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const MULTS = [
  { v: -1, label: "Heal", tip: "Heal this amount instead (no Defense)" },
  { v: 0, label: "×0", tip: "No effect" },
  { v: 0.25, label: "×¼", tip: "Quarter (rounded up)" },
  { v: 0.5, label: "×½", tip: "Half (rounded up), e.g. resisted" },
  { v: 1, label: "×1", tip: "Full" },
  { v: 2, label: "×2", tip: "Double" },
];
export const multLabel = (m) => MULTS.find((x) => x.v === Number(m))?.label ?? `×${m}`;
export const validMult = (m) => MULTS.some((x) => x.v === Number(m));

/**
 * rolls: [{ dice:[a,b], natural, value }] in order (first + crit rerolls). bonusParts: [{label,value}].
 * Returns { lines:[{label, value, note}], crits, fumble }.
 */
export function damageBreakdown({ rolls = [], bonusParts = [], bonus = 0, power = null, crit = null, half = false, fumble = false, rollLabel = null } = {}) {
  const lines = [];
  rolls.forEach((r, i) => lines.push({ label: i === 0 ? (rollLabel ?? `Power ${power ?? "?"} roll`) : `Critical roll ${i}`, dice: r.dice, natural: r.natural, value: num(r.value) }));
  if (half) lines.push({ label: "Half power (rounded up)", value: null });
  const shown = bonusParts.filter((p) => num(p.value) !== 0);
  const rest = num(bonus) - shown.reduce((a, p) => a + num(p.value), 0);
  for (const p of shown) lines.push({ label: p.label, value: num(p.value), bonus: true });
  if (rest !== 0) lines.push({ label: "Other modifiers", value: rest, bonus: true });
  return { lines, crits: Math.max(0, rolls.length - 1), fumble: !!fumble, crit };
}

/** One apply row: amount, target Defense, kind, multiplier (+ revealed weak-point bonus) -> numbers + the plain-words text. */
export function applyRow(amount, defense, { kind = "physical", mult = 1, weak = 0 } = {}) {
  const base = Math.max(0, Math.floor(num(amount)));
  const m = validMult(mult) ? Number(mult) : 1;
  if (m === -1) return { base, defense: 0, after: base, mult: m, final: base, heal: true, text: `${base} → heal ${base}` };
  const def = kind === "physical" ? Math.max(0, Math.floor(num(defense))) : 0;
  const cut = Math.max(0, base - def);
  const w = kind !== "fixed" && cut > 0 ? Math.max(0, Math.floor(num(weak))) : 0;
  const after = cut + w;
  const final = m === 0 ? 0 : Math.ceil(after * m);
  let first = kind === "physical" ? `${base} damage − ${def} Defense = ${cut}` : `${base} damage`;
  if (w) first += ` + ${w} weak point = ${after}`;
  return { base, defense: def, after, mult: m, final, heal: false, text: `${first} ${multLabel(m)} → ${final}` };
}

/** Damage card body (state = { name, img, total, label, formula, breakdown, fumble }). Apply panel is filled live. */
export function damageCardHTML(s) {
  const bd = s.breakdown?.lines ?? [];
  const li = bd.map((l) => `<li><span>${esc(l.label)}${l.dice ? ` <small>(${l.dice.join(" + ")} = ${l.natural})</small>` : ""}</span><b>${l.value == null ? "" : l.bonus ? (l.value < 0 ? `− ${-l.value}` : `+ ${l.value}`) : l.value}</b></li>`).join("");
  const crits = s.breakdown?.crits ? ` <span class="sw25-ac-nat crit">${s.breakdown.crits} critical${s.breakdown.crits > 1 ? "s" : ""}</span>` : "";
  const fum = s.fumble ? ` <span class="sw25-ac-nat fail">natural 2: automatic failure, 0 damage</span>` : "";
  return `<div class="sw25-ac sw25-dc" data-sw25-dc>`
    + `<header class="sw25-ac-head">${s.img ? `<img src="${esc(s.img)}" alt="">` : ""}<div><b>${esc(s.name)}</b><small>Damage ${esc(s.label ?? "")}</small></div></header>`
    + `<div class="sw25-ac-row"><div class="sw25-ac-res"><span class="sw25-ac-total big">${esc(s.total)}</span>${crits}${fum}`
    + `<details class="sw25-ac-bd"><summary>${esc(s.formula ?? "")}</summary><ul>${li}<li class="tot"><span>Total</span><b>${esc(s.total)}</b></li></ul></details></div></div>`
    + `<details class="sw25-dc-apply" open><summary><i class="fas fa-heart-crack"></i> Apply</summary><div class="sw25-dc-panel"></div></details>`
    + `</div>`;
}

/** Apply panel inner HTML. rows = [{ id, name, img, defense, parts?, part? }] (parts: multi-part stat block -> part picker); opts = { kind, pool, mults: {id: m} }. */
export function applyPanelHTML(amount, rows, { kind = "physical", pool = "hp", mults = {}, empty = "Select tokens on the map (or set your character) to apply." } = {}) {
  const opt = `<div class="sw25-dc-opts" data-tooltip="Damage type and pool">`
    + ["physical", "magic", "fixed"].map((k) => `<label><input type="radio" name="kind" value="${k}" ${k === kind ? "checked" : ""}> ${k[0].toUpperCase() + k.slice(1)}</label>`).join("")
    + ` · ` + ["hp", "mp"].map((p) => `<label><input type="radio" name="pool" value="${p}" ${p === pool ? "checked" : ""}> ${p.toUpperCase()}</label>`).join("") + `</div>`;
  if (!rows.length) return opt + `<div class="sw25-ac-hint">${esc(empty)}</div>`;
  const body = rows.map((r) => {
    const m = mults[r.id] ?? 1; const a = applyRow(amount, r.defense, { kind, mult: m, weak: r.weak?.[kind] ?? 0 });
    const sel = MULTS.map((x) => `<button type="button" class="sw25-dc-m ${x.v === a.mult ? "on" : ""}" data-id="${esc(r.id)}" data-m="${x.v}" data-tooltip="${esc(x.tip)}">${x.label}</button>`).join("");
    return `<div class="sw25-dc-target" data-id="${esc(r.id)}">${r.img ? `<img src="${esc(r.img)}" alt="">` : ""}<div class="sw25-dc-tinfo"><b>${esc(r.name)}</b>${r.parts?.length > 1 ? partSelectHTML(r.parts, r.part, { id: r.id }) : ""}<small>${esc(a.text)}</small><div class="sw25-dc-mults">${sel}</div></div>`
      + `<span class="sw25-dc-final ${a.heal ? "heal" : ""}">${a.heal ? "+" : a.final ? "−" : ""}${a.final}</span></div>`;
  }).join("");
  return opt + body + `<button type="button" class="sw25-dc-go"><i class="fas fa-check"></i> Apply</button>`;
}
