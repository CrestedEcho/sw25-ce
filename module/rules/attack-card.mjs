/**
 * sw25-ce attack chat card (dnd5e-style): PURE helpers, no Foundry globals (unit-tested).
 * Rules: tie = miss (the evader wins); a natural 2 is an automatic failure and a natural 12 an
 * automatic success on BOTH the Accuracy and the Evasion check. Monsters roll 2d6 + Standard Value
 * (Standard Value = fixed value - 7); there is no fixed-value option on the card.
 */
import { pairFixed } from "./sb-play.mjs";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const signed = (n) => (n < 0 ? `− ${Math.abs(n)}` : `+ ${n}`);

/** "2d6+5" / "2d6-1" / "2d6" */
export function checkFormula(mod) {
  const m = num(mod);
  return `2d6${m > 0 ? `+${m}` : m < 0 ? `${m}` : ""}`;
}

/** Drop zero parts; add an "Other modifiers" row so the parts always add up to `total`. */
export function partsTo(total, parts, other = "Other modifiers") {
  const out = (parts ?? []).map((p) => ({ label: String(p.label), value: num(p.value) })).filter((p) => p.value !== 0);
  const rest = num(total) - out.reduce((a, p) => a + p.value, 0);
  if (rest !== 0) out.push({ label: other, value: rest });
  return out;
}

/** A check source: { label, mod, formula, parts }. */
export function check(label, mod, parts) {
  const m = num(mod);
  return { label, mod: m, formula: checkFormula(m), parts: partsTo(m, parts) };
}

/** PC Accuracy from the actor's Accuracy tile (itemhitbase) and the weapon's own part list. */
export function pcAccuracy(sys, weaponSys = {}) {
  return check("Accuracy", sys?.itemhitbase, weaponSys?._accParts ?? []);
}

/** PC Evasion: 2d6 + dodgebase. */
export function pcEvasion(sys = {}) {
  const all = num(sys.effect?.allsc) + num(sys.effect?.allac);
  return check("Evasion", sys.dodgebase, [
    { label: "Evasion class level + Agility bonus", value: sys.skillagidodge },
    { label: "Armor and shield", value: sys.itemdodge },
    { label: "Evasion modifier", value: sys.attributes?.dodgemod },
    { label: "Effects", value: sys.attributes?.efdodgemod },
    { label: "Effects on all checks", value: all },
  ]);
}

/** Monster check pair {value, fixed} -> Standard Value = fixed value - 7 (fixed defaults to value + 7). */
export function standardValue(pair) {
  const f = pairFixed(pair);
  return f == null ? null : f - 7;
}
/** Monster check rolled as 2d6 + Standard Value. */
export function monsterCheck(label, pair) {
  const sv = standardValue(pair);
  if (sv == null) return null;
  return check(label, sv, [{ label: "Standard Value", value: sv }]);
}

/** Read a 2d6 roll: { dice:[a,b], natural, total }. */
export function readRoll(dice, total) {
  const d = (dice ?? []).map(Number);
  return { dice: d, natural: d.slice(0, 2).reduce((a, x) => a + x, 0), total: Number(total) };
}

/** "auto-fail" | "auto-success" | null for one roll. */
export function natural(r) {
  if (!r) return null;
  if (r.natural === 2) return "auto-fail";
  if (r.natural === 12) return "auto-success";
  return null;
}

/**
 * Accuracy vs Evasion -> { result: "hit"|"miss", why }.
 * Order: accuracy natural 2 -> miss; evasion natural 2 -> hit; only one natural 12 -> that side wins;
 * otherwise (incl. both 12) compare totals, tie = miss.
 */
export function contest(acc, eva) {
  if (!acc || !eva) return null;
  const a = natural(acc), e = natural(eva);
  if (a === "auto-fail") return { result: "miss", why: "Accuracy rolled a natural 2 (automatic failure)" };
  if (e === "auto-fail") return { result: "hit", why: "Evasion rolled a natural 2 (automatic failure)" };
  if (a === "auto-success" && e !== "auto-success") return { result: "hit", why: "Accuracy rolled a natural 12 (automatic success)" };
  if (e === "auto-success" && a !== "auto-success") return { result: "miss", why: "Evasion rolled a natural 12 (automatic success)" };
  if (acc.total > eva.total) return { result: "hit", why: `${acc.total} beats ${eva.total}` };
  if (acc.total === eva.total) return { result: "miss", why: `${acc.total} ties ${eva.total}: a tie is a miss` };
  return { result: "miss", why: `${acc.total} is lower than ${eva.total}` };
}

/** Formula line that expands into the source of each part. */
export function breakdownHTML(chk, roll = null) {
  if (!chk) return "";
  const rows = [`<li><span>Dice</span><b>2d6${roll ? ` (${roll.dice.join(" + ")})` : ""}</b></li>`]
    .concat(chk.parts.map((p) => `<li><span>${esc(p.label)}</span><b>${signed(p.value)}</b></li>`)).join("");
  return `<details class="sw25-ac-bd"><summary>${esc(chk.formula)}</summary><ul>${rows}</ul></details>`;
}

function rollHTML(r) {
  if (!r) return "";
  const n = natural(r);
  const tag = n === "auto-fail" ? ` <span class="sw25-ac-nat fail">natural 2: automatic failure</span>` : n === "auto-success" ? ` <span class="sw25-ac-nat crit">natural 12: automatic success</span>` : "";
  return `<span class="sw25-ac-total">${esc(r.total)}</span><span class="sw25-ac-dice">(${r.dice.join(" + ")})</span>${tag}`;
}

/**
 * Attack card body. state = { name, img, sub, desc, acc, accRoll, eva, evaRoll, evaName, damageLabel, damageFormula }.
 * acc/eva are check() results; accRoll/evaRoll are readRoll() results.
 */
export function attackCardHTML(s) {
  const out = contest(s.accRoll, s.evaRoll);
  const accRow = `<div class="sw25-ac-row"><button type="button" class="sw25-ac-btn" data-ac="accuracy" data-tooltip="Roll Accuracy for this attack"><i class="fas fa-crosshairs"></i> Accuracy</button>`
    + `<div class="sw25-ac-res">${s.accRoll ? rollHTML(s.accRoll) : `<span class="sw25-ac-hint">${esc(s.acc?.formula ?? "")}</span>`}${breakdownHTML(s.acc, s.accRoll)}</div></div>`;
  const evaRow = `<div class="sw25-ac-row"><button type="button" class="sw25-ac-btn" data-ac="evasion" data-tooltip="Target rolls Evasion (players: your character; GM: the selected token)"><i class="fas fa-shield-halved"></i> Evasion</button>`
    + `<div class="sw25-ac-res">${s.evaRoll ? `${s.evaName ? `<span class="sw25-ac-who">${esc(s.evaName)}</span> ` : ""}${rollHTML(s.evaRoll)}${breakdownHTML(s.eva, s.evaRoll)}` : `<span class="sw25-ac-hint">The target rolls 2d6 + Evasion</span>`}</div></div>`;
  const dmgRow = `<div class="sw25-ac-row"><button type="button" class="sw25-ac-btn" data-ac="damage" data-tooltip="Roll damage and post a damage card"><i class="fas fa-burst"></i> Damage</button>`
    + `<div class="sw25-ac-res"><span class="sw25-ac-hint">${esc(s.damageLabel ?? "")}</span></div></div>`;
  const outcome = out ? `<div class="sw25-ac-outcome ${out.result}" data-tooltip="${esc(out.why)}">${out.result === "hit" ? "HIT" : "MISS"} <small>${esc(out.why)}</small></div>` : "";
  const desc = s.desc ? `<details class="sw25-ac-desc"><summary>Description</summary><div>${s.desc}</div></details>` : "";
  return `<div class="sw25-ac" data-sw25-ac>`
    + `<header class="sw25-ac-head">${s.img ? `<img src="${esc(s.img)}" alt="">` : ""}<div><b>${esc(s.name)}</b>${s.sub ? `<small>${esc(s.sub)}</small>` : ""}</div></header>`
    + desc + accRow + evaRow + outcome + dmgRow + `</div>`;
}
