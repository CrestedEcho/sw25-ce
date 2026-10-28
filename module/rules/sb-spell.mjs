/* sw25-ce: monster / NPC stat-block casting on the PLAYER cast flow (pure, no Foundry globals, unit-tested).
 * The stat block pays MP from a part's current MP (core ★ part by default), never Mako Stones.
 * Casting check = 2d6 + (Magic Power fixed − 7) = 2d6 + the skill's Magic Power; power rolls add the same Magic Power.
 */
import { pairFixed } from "./sb-play.mjs";
import { parseMagicSkill } from "./sb-cast.mjs";

/** A stat block that has parts pays from them; otherwise (old monster sheet without parts) the actor's own MP is used. */
export function usesSbPool(actor) {
  return (actor?.type === "npc" || actor?.type === "monster") && (actor?.system?.sbView?.parts?.length ?? 0) > 0;
}

/** Magic Power of a unique magic skill: { fixed, value } (value = fixed − 7), or null when the stat block lists none. */
export function sbMagicPower(u) {
  const src = u?.check ?? u?.magic?.power ?? null;
  let fixed = pairFixed(src);
  if (fixed == null) { const ms = parseMagicSkill(u); if (ms?.magicPower != null && Number.isFinite(ms.magicPower)) fixed = ms.magicPower + 7; }
  return fixed == null ? null : { fixed, value: fixed - 7 };
}

/** Pool view for the cast window. viewParts = prepared sbView.parts; raw current MP lives in rawParts[i].mpValue. */
export function sbPoolInfo(rawParts = [], viewParts = [], partIndex = null) {
  const core = Math.max(0, viewParts.findIndex((p) => p.isCore));
  const cur = (i) => Number(rawParts?.[i]?.mpValue ?? viewParts[i]?.mpValue ?? viewParts[i]?.mp ?? 0) || 0;
  const choices = viewParts.map((p, i) => ({ i, name: p.name || `Part ${i + 1}`, isCore: !!p.isCore || (viewParts.length === 1), mp: cur(i), mpMax: Number(p.mp) || 0 }));
  const index = partIndex != null && choices[partIndex] ? Number(partIndex) : core;
  const c = choices[index] ?? { mp: 0, mpMax: 0, name: "" };
  return { index, core, mp: c.mp, mpMax: c.mpMax, name: c.name, choices };
}

/** Item-like spell for spellInfo / castCardHTML: a compendium/embedded spell doc with the caster's Magic Power filled in. */
export function sbSpellItem(doc, mpow) {
  const system = { ...(doc?.system ?? {}) };
  if (mpow) { system.checkbase = mpow.value; system.powerbase = mpow.value; }
  return { id: doc?._id ?? doc?.id ?? null, _id: doc?._id ?? doc?.id ?? null, uuid: doc?.uuid ?? null, name: doc?.name ?? "", img: doc?.img ?? "", type: "spell", system, flags: doc?.flags ?? {} };
}

/** Power column for a spell: its own 10-value table, else a power-table lookup row for its rate (journal → bundled). */
export function powerRowFor(power, lookup) {
  if (Array.isArray(power?.table) && power.table.length >= 10) return null;
  const rate = Number(power?.rate ?? power?.value ?? power);
  if (!Number.isFinite(rate) || typeof lookup !== "function") return null;
  const row = []; for (let t = 3; t <= 12; t++) { const r = lookup(rate, t); if (r?.source == null) return null; row.push(r.value); }
  return row;
}
/** True when the spell rolls damage/healing (structured power object or a numeric Power rate). */
export function spellHasPower(sys = {}) {
  const p = sys?.power; if (p == null || p === "") return false;
  if (typeof p === "object") return Array.isArray(p.table) || Number.isFinite(Number(p.rate ?? p.value));
  return false;
}

/** Extra cast-window rows for a stat block: paying part (multi-part), HP cost, deity rank. */
export function sbCastExtraHTML({ pool, hp = 0, ranks = null }, esc = (s) => String(s ?? "")) {
  let h = "";
  if (pool && pool.choices.length > 1) h += `<label class="sw25-cw-row" data-tooltip="Which part's MP pays for the spell (default: the core ★ part)."><div><b>Paid by</b><div class="sw25-cw-hint">Multi-part monster</div></div><select name="part">${pool.choices.map((c) => `<option value="${c.i}"${c.i === pool.index ? " selected" : ""}>${esc(c.name)}${c.isCore ? " ★" : ""} (MP ${c.mp}/${c.mpMax})</option>`).join("")}</select></label>`;
  if (ranks && Object.keys(ranks).length) h += `<label class="sw25-cw-row" data-tooltip="This spell's cost depends on the deity's rank."><div><b>Deity rank</b></div><select name="rank">${Object.keys(ranks).map((r) => `<option value="${esc(r)}">${esc(r)} (MP${ranks[r]})</option>`).join("")}</select></label>`;
  if (hp) h += `<label class="sw25-cw-row" data-tooltip="Some spells also cost HP."><div><b>HP cost</b></div><input type="number" name="hp" value="${Number(hp) || 0}" min="0" class="sw25-cw-num"></label>`;
  return h;
}
