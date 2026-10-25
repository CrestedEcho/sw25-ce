import { isHealSpell } from "./spell-power.mjs";
/**
 * NPC / monster spellcasting from the stat block (pure, tested).
 * Monsters own no spell items: a unique skill like "Truespeech Magic 5" lists a school + level.
 * The picker offers that school's spells up to the level (sw25-spells compendium, plus embedded spells);
 * casting deducts MP (and HP where the cost says so) from the stat block's CURRENT values (parts[i].mpValue / hpValue).
 */
const SCHOOLS = { truespeech: ["truespeech"], sorcery: ["truespeech"], sorcerer: ["truespeech"], spiritualism: ["spiritualism"], conjury: ["spiritualism"], conjurer: ["spiritualism"],
  wizardry: ["truespeech", "spiritualism"], wizard: ["truespeech", "spiritualism"], divine: ["divine"], priest: ["divine"], fairy: ["fairy"], magitech: ["magitech"],
  nature: ["nature"], druid: ["nature"], summoning: ["summoning"], demon: ["abyssal"], abyssal: ["abyssal"], abyss: ["abyssal"] };

const magicPowerOf = (p) => (p == null ? null : typeof p === "object" ? (Number.isFinite(Number(p.value)) ? Number(p.value) : Number(p.fixed) - 7) : Number(p));
/** "Truespeech Magic 5", "Divine Magic (Lumiere) 7", or u.magic = {school, level}. */
export function parseMagicSkill(u) {
  // magicPower = the damage bonus (value), not the fixed casting check (value + 7).
  if (u?.magic?.school && u.magic.level) { const s = SCHOOLS[String(u.magic.school).toLowerCase()]; if (s) return { schools: s, level: Number(u.magic.level), ...(u.magic.power != null ? { magicPower: magicPowerOf(u.magic.power) } : {}) }; }
  const m = String(u?.name ?? "").match(/([A-Za-z]+)\s+Magic\b[^0-9]*(\d+)/i);
  if (!m) return null; const s = SCHOOLS[m[1].toLowerCase()]; return s ? { schools: s, level: Number(m[2]) } : null;
}

/** Parse "MP5", "MP50-200", "MP1+", "MP10 + Level", "MP5 + HP5". */
export function parseCostText(text, fallback) {
  const raw = String(text ?? "").trim(); const out = { raw, base: Number.isFinite(Number(fallback)) && fallback !== "" && fallback != null ? Number(fallback) : null, max: null, hp: 0, open: false };
  const m = raw.match(/^MP\s*(\d+)(?:\s*-\s*(\d+))?\s*(\+)?\s*(.*)$/i);
  if (m) { out.base = Number(m[1]); if (m[2]) { out.max = Number(m[2]); out.open = true; }
    const rest = (m[4] ?? "").trim(); const hp = rest.match(/HP\s*(\d+)/i); if (hp) out.hp = Number(hp[1]);
    if (m[3] && !rest) out.open = true; if (rest && !/^HP\s*\d+$/i.test(rest)) out.open = true; }
  else if (raw && out.base == null) out.open = true;
  return out;
}

/** Normalised spell info from a compendium/embedded spell document (or its toObject()). */
export function spellMeta(doc) {
  const sys = doc.system ?? {}; const data = doc.flags?.["sw25-ce"]?.data ?? {};
  const cost = parseCostText(sys.mpcostText ?? data.mpCost, sys.mpcost ?? (typeof data.mpCost === "number" ? data.mpCost : null));
  const rule = sys.mpRule ?? data.mpRule ?? null;
  const ranks = rule?.byDeityRank ?? null;
  return { id: doc._id ?? doc.id, uuid: doc.uuid ?? null, name: doc.name, school: String(sys.school ?? data.school ?? "").toLowerCase(), level: Number(sys.level ?? data.level ?? 0),
    power: (typeof sys.power === "object" && sys.power) ? sys.power : (data.power ?? null), powerCrit: Number(sys.powerCrit ?? data.powerCrit) || 10, resist: sys.resist ?? data.resistance ?? "", heal: isHealSpell({ name: doc.name, summary: data.summary ?? sys.summary, description: sys.description }),
    cost, ranks, ritual: rule?.ritualCasting ?? null, needsDialog: cost.open || !!ranks || !!rule?.ritualCasting };
}

/** Spells castable with a magic skill: matching school, level <= skill level; sorted by level, name; de-duplicated by name. */
export function spellsForSkill(skill, docs) {
  const seen = new Set();
  return docs.map(spellMeta).filter((s) => skill.schools.includes(s.school) && s.level > 0 && s.level <= skill.level)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)).filter((s) => (seen.has(s.name) ? false : seen.add(s.name)));
}

/** Default MP for the dialog: rank cost if a deity rank is chosen, else base. */
export function defaultCost(meta, rank) {
  if (meta.ranks && rank && meta.ranks[rank] != null) return Number(meta.ranks[rank]);
  return meta.cost.base ?? 0;
}

/**
 * Deduct from the stat block. rawParts = system.sb.parts (source), viewParts = prepared parts (with locked overrides applied to max).
 * Current = rawParts[i].mpValue ?? view max. Max values (including locked overrides) are never changed.
 * partIndex picks the paying part (multi-part monsters); default = the ★ core part.
 * Shortage is reported, not blocked: current goes to 0.
 */
export function applySbCost(rawParts, viewParts, { mp = 0, hp = 0, partIndex = null }) {
  const parts = structuredClone(rawParts ?? []);
  const ci = partIndex != null && parts[partIndex] ? Number(partIndex) : Math.max(0, (viewParts ?? []).findIndex((p) => p.isCore));
  if (!parts[ci]) return { parts, index: -1, error: "no-part" };
  const v = viewParts[ci] ?? {};
  const mpBefore = Number(parts[ci].mpValue ?? v.mpValue ?? v.mp ?? 0); const hpBefore = Number(parts[ci].hpValue ?? v.hpValue ?? v.hp ?? 0);
  const mpShort = mp > mpBefore; const hpShort = hp > 0 && hp >= hpBefore;
  if (mp) parts[ci].mpValue = Math.max(0, mpBefore - mp);
  if (hp) parts[ci].hpValue = Math.max(0, hpBefore - hp);
  return { parts, index: ci, mpBefore, mpAfter: mp ? parts[ci].mpValue : mpBefore, hpBefore, hpAfter: hp ? parts[ci].hpValue : hpBefore, mpShort, hpShort };
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export function castChatHTML(actorName, meta, { mp, hp, rank, ritual, partName }, res) {
  return `<div class="sw25-sbcast"><header><b>${esc(actorName)}</b> casts <b>${esc(meta.name)}</b> <small>(${esc(meta.school)} Lv${meta.level})</small></header>`
    + (partName ? `<div><small>Paid by: ${esc(partName)}</small></div>` : "")
    + `<div>Cost spent: <b>MP ${mp}</b>${hp ? ` + <b>HP ${hp}</b>` : ""}${rank ? ` <small>(deity rank: ${esc(rank)})</small>` : ""}${ritual ? " <small>(ritual)</small>" : ""}${meta.cost.raw ? ` <small>[listed ${esc(meta.cost.raw)}]</small>` : ""}</div>`
    + `<div>MP ${res.mpBefore} → ${res.mpAfter}${hp ? ` · HP ${res.hpBefore} → ${res.hpAfter}` : ""}</div>`
    + (res.mpShort ? `<div class="fw-fail">⚠ Not enough MP (had ${res.mpBefore}) — GM proceeded.</div>` : "")
    + (res.hpShort ? `<div class="fw-fail">⚠ HP cost brings it to ${res.hpAfter}.</div>` : "") + damageHTML(meta, res.damage) + `</div>`;
}

/** Damage block for the cast card: rolls, Power N + Magic Power, full / half (resisted, rounded up) apply buttons. */
export function damageHTML(meta, d) {
  if (!d) return "";
  if (d.fumble) return `<div class="sw25-spelldmg"><b>Damage</b>: rolled ${d.rolls[0]}: automatic failure, no damage.</div>`;
  if (meta.heal) return `<div class="sw25-spelldmg"><div><b>Healing</b> (Power ${esc(meta.power?.rate ?? "?")}, crit ${meta.powerCrit}): rolls ${d.rolls.join(" → ")}${d.crits ? ` <b>(crit ×${d.crits})</b>` : ""} = table ${d.table} + Magic Power ${d.magicPower} = <b>${d.total}</b></div>`
    + `<div><small>Healing: capped at max HP.</small></div><div><button type="button" data-sw25-heal="${d.total}">Apply healing ${d.total}</button></div></div>`;
  const btn = (amt, label) => `<button type="button" data-sw25-magic-dmg="${amt}">${label} ${amt}</button>`;
  return `<div class="sw25-spelldmg"><div><b>Damage</b> (Power ${esc(meta.power?.rate ?? "?")}, crit ${meta.powerCrit}): rolls ${d.rolls.join(" → ")}${d.crits ? ` <b>(crit ×${d.crits})</b>` : ""} = table ${d.table} + Magic Power ${d.magicPower} = <b>${d.total}</b></div>`
    + `<div><small>Magic damage: Defense not applied. A target's "Magic Damage +N" weak point is added on apply.</small></div>`
    + `<div>${btn(d.total, "Apply to targets")}${/half/i.test(meta.resist ?? "") ? btn(d.half, "Resisted (half)") : ""}</div></div>`;
}
