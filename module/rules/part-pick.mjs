/**
 * sw25-ce: part picker for multi-part stat blocks (PURE, unit-tested).
 * Used by the damage card Apply panel (which part takes the damage / heal) and the attack card's
 * Evasion button (which part dodges). Parts come from actor.system.sbView.parts.
 */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const hpOf = (p) => num(p?.hpValue ?? p?.hp);

/** Parts of an actor's stat block view ([] for PCs / single-part blocks still return their one part). */
export const sbParts = (actor) => actor?.system?.sbView?.parts ?? [];
/** True when the actor is a stat block with more than one part. */
export const isMultiPart = (actor) => !!actor?.system?.sb && sbParts(actor).length > 1;

/**
 * Index to pre-select: `preferred` when it is a valid index; else the core part if it is above 0 HP;
 * else the first part above 0 HP; else the core part (or 0).
 */
export function defaultPart(parts, preferred = null) {
  const list = parts ?? []; if (!list.length) return 0;
  const p = preferred == null || preferred === "" ? NaN : Number(preferred);
  if (Number.isInteger(p) && p >= 0 && p < list.length) return p;
  const core = Math.max(0, list.findIndex((x) => x?.isCore));
  if (hpOf(list[core]) > 0) return core;
  const alive = list.findIndex((x) => hpOf(x) > 0);
  return alive >= 0 ? alive : core;
}
/** Clamp a stored choice to a valid part index (null when there are no parts). */
export function partIndex(parts, choice) {
  const list = parts ?? []; if (!list.length) return null;
  return defaultPart(list, choice);
}
/** "Head ★ (HP 12/20)" */
export const partLabel = (p) => `${p?.name || "Part"}${p?.isCore ? " ★" : ""} (HP ${hpOf(p)}/${num(p?.hp)})`;
/** <select> for one Apply row (or the Evasion dialog with name="part"). */
export function partSelectHTML(parts, selected, { id = "", cls = "sw25-dc-part", name = "part" } = {}) {
  const sel = defaultPart(parts, selected);
  return `<select class="${esc(cls)}" name="${esc(name)}"${id ? ` data-id="${esc(id)}"` : ""} data-tooltip="Which part this applies to">`
    + (parts ?? []).map((p, i) => `<option value="${i}" ${i === sel ? "selected" : ""}>${esc(partLabel(p))}</option>`).join("")
    + `</select>`;
}
/** Part Defense (physical damage). */
export const partDefense = (parts, i) => num((parts ?? [])[i]?.defense);
/**
 * Part choices remembered from Evasion rolls on an attack card: [{tokenId, actorId, part}] (oldest first)
 * -> { [tokenId or "actor-<id>"]: part, ["actor:<id>"]: part }. Later rolls win.
 */
export function partPicksFrom(evasions) {
  const out = {};
  for (const e of evasions ?? []) {
    if (e?.part == null || !Number.isInteger(Number(e.part))) continue;
    if (e.tokenId) out[e.tokenId] = Number(e.part);
    if (e.actorId) { out[`actor:${e.actorId}`] = Number(e.part); out[`actor-${e.actorId}`] = Number(e.part); }
  }
  return out;
}
/** Look up a remembered pick for an Apply row ({id, actorId}). */
export const pickFor = (picks, row) => picks?.[row?.id] ?? (row?.actorId ? picks?.[`actor:${row.actorId}`] : undefined) ?? null;
