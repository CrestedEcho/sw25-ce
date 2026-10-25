/**
 * Fellow (CR I pp.193-205) — pure logic, no Foundry globals.
 * Stored on the NPC actor at system.fellow (same actor as the GM-only stat block system.sb).
 * No HP, no damage, no auto-levelling. GM fills the action table by hand (no auto-derive yet).
 */
export const FELLOW_ROWS = [
  { range: "1-2", result: 7 }, { range: "3-4", result: 8 }, { range: "5", result: 9 }, { range: "6", result: 10 },
];
export const FELLOW_DEFAULTS = () => ({
  enabled: false, race: "", gender: "", age: "", level: 1,
  classes: "", languages: [], intro: "", wantsExp: true, wantsReward: true, owner: "",
  mp: { value: 0, max: 0 },
  rows: FELLOW_ROWS.map((r) => ({ ...r, action: "", kind: "attack", dialogue: "", value: "", effect: "", mp: 0 })),
  consumables: [],
});

const arr = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []);
const n = (v, d = 0) => (v === "" || v == null || isNaN(Number(v)) ? d : Number(v));

/** Normalise system.fellow (always exactly 4 rows in 1-2/3-4/5/6 order). */
export function prepareFellow(raw = {}) {
  const f = Object.assign(FELLOW_DEFAULTS(), structuredClone(raw ?? {}));
  const rows = arr(raw?.rows);
  f.rows = FELLOW_ROWS.map((r, i) => ({ action: "", kind: "attack", dialogue: "", value: "", effect: "", mp: 0, ...(rows[i] ?? {}), range: r.range, result: r.result }));
  for (const r of f.rows) r.mp = n(r.mp);
  f.mp = { value: n(f.mp?.value), max: n(f.mp?.max) };
  f.level = n(f.level, 1);
  f.languages = arr(f.languages).map((l) => (typeof l === "string" ? { name: l, speak: true, read: false } : { name: l.name ?? "", speak: !!l.speak, read: !!l.read }));
  f.consumables = arr(f.consumables).map((c) => (typeof c === "string" ? { name: c, qty: 1, from: "" } : { name: c.name ?? "", qty: n(c.qty, 1), from: c.from ?? "" }));
  return f;
}

/** 1d result -> row index (0..3). */
export function rowIndexForDie(d) { d = Number(d); return d <= 2 ? 0 : d <= 4 ? 1 : d === 5 ? 2 : 3; }

/** "Trade Common (Speak/Read)". */
export function languageText(l) {
  const m = [l.speak && "Speak", l.read && "Read"].filter(Boolean).join("/");
  return m ? `${l.name} (${m})` : l.name;
}

/**
 * Resolve a Fellow action roll.
 * wanted = row index the party asked for (null = any). Mismatch -> failure (CR I p201-203).
 * MP spent only on success; if MP is short the action is cancelled.
 */
export function resolveFellowRoll(fellowRaw, die, wanted = null) {
  const f = prepareFellow(fellowRaw);
  const index = rowIndexForDie(die); const row = f.rows[index];
  const matched = wanted == null || wanted === "" || Number(wanted) === index;
  const shortMP = matched && row.mp > f.mp.value;
  const success = matched && !shortMP;
  return {
    die: Number(die), index, row, wanted: wanted == null || wanted === "" ? null : Number(wanted),
    success, failure: !matched, cancelled: shortMP,
    mpCost: success ? row.mp : 0, mpAfter: success ? f.mp.value - row.mp : f.mp.value,
  };
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Chat card HTML for a resolved roll. */
export function fellowChatHTML(name, res, wantedRow = null) {
  const r = res.row;
  const status = res.failure ? `<div class="fw-fail">Failure — rolled ${esc(r.range)}, the party wanted ${esc(wantedRow?.range ?? "?")} (${esc(wantedRow?.action ?? "")})</div>`
    : res.cancelled ? `<div class="fw-fail">Cancelled — not enough MP (${esc(r.mp)} needed)</div>` : "";
  return `<div class="sw25-fellow-chat${res.success ? "" : " is-fail"}">
<header><b>${esc(name)}</b> · Fellow action · 1d = <b>${res.die}</b> → ${esc(r.range)} <small>(${r.result})</small></header>
<div class="fw-action"><b>${esc(r.action)}</b>${r.kind === "check" ? " <small>(check)</small>" : ""}</div>
${r.dialogue ? `<div class="fw-dialogue">“${esc(r.dialogue)}”</div>` : ""}
<div class="fw-line"><span>Value <b>${esc(r.value || "—")}</b></span> <span>${esc(r.effect)}</span></div>
<div class="fw-mp">MP ${res.mpCost ? `−${res.mpCost} → ${res.mpAfter}` : r.mp ? `${r.mp} (not spent)` : "—"}</div>
${status}${res.success ? "<div class=\"fw-hint\">Choose targets now.</div>" : ""}</div>`;
}

/** Sheet context for the player-facing card. */
export function buildFellowContext({ name = "", img = "", fellow = {}, lastRoll = null, wanted = null, isGM = false }) {
  const f = prepareFellow(fellow);
  const pct = f.mp.max > 0 ? Math.max(0, Math.min(100, Math.round((f.mp.value / f.mp.max) * 100))) : 0;
  return {
    name, img, isGM, f,
    subLine: [f.race, f.gender, f.age, `Adventurer Lv ${f.level}`].filter((x) => x !== "" && x != null).join(" · "),
    languagesText: f.languages.map(languageText).join(", "),
    mpPct: pct,
    rows: f.rows.map((r, i) => ({ ...r, i, hit: lastRoll?.index === i, wanted: wanted != null && wanted !== "" && Number(wanted) === i, mpText: r.mp ? r.mp : "—" })),
    lastRoll, wanted,
  };
}
