/**
 * sw25-ce: stat-block Magic section (approved mockup). PURE, unit-tested, no Foundry globals.
 *
 * Data: system.sb.magic = [{ school, level, power: { fixed }, fairies: ["earth", ...], from }]
 *   school  key from MAGIC_SCHOOLS (picked from a list, no free text)
 *   power   Magic Power as the fixed value; the value (bonus) is fixed − 7
 *   fairies contracted fairy types (Fairy blocks only)
 *   from    original Unique skill name when it was moved from Unique skills (e.g. "Divine Magic (Lumiere) 7")
 *
 * Migration is non-destructive: a magic Unique skill ("Truespeech Magic 5") gets a Magic entry and is
 * only marked { magicMoved: true }; its name, check and description stay in system.sb.uniqueSkills.
 */
import { parseMagicSkill, spellsForSkill, spellMeta } from "./sb-cast.mjs";
import { SCHOOL_TO_TYPE } from "./spell-school.mjs";
import { sbMagicPower, sbPoolInfo } from "./sb-spell.mjs";
import { spellGmOnly, slugKey } from "./sb-play.mjs";

export const MAGIC_SCHOOLS = [
  { key: "truespeech", label: "Truespeech" }, { key: "spiritualism", label: "Spiritualism" }, { key: "divine", label: "Divine" },
  { key: "magitech", label: "Magitech" }, { key: "fairy", label: "Fairy" }, { key: "nature", label: "Nature" }, { key: "abyssal", label: "Abyssal" },
];
/** Old Unique-skill words -> school key (wizardry = Truespeech + Spiritualism spells). */
const WORD_KEY = { truespeech: "truespeech", sorcery: "truespeech", sorcerer: "truespeech", spiritualism: "spiritualism", conjury: "spiritualism", conjurer: "spiritualism",
  wizardry: "wizardry", wizard: "wizardry", divine: "divine", priest: "divine", fairy: "fairy", magitech: "magitech", nature: "nature", druid: "nature",
  summoning: "summoning", demon: "abyssal", abyssal: "abyssal", abyss: "abyssal" };
const LABELS = { ...Object.fromEntries(MAGIC_SCHOOLS.map((s) => [s.key, s.label])), wizardry: "Wizardry", summoning: "Summoning" };
export const schoolLabel = (k) => LABELS[k] ?? (k ? String(k)[0].toUpperCase() + String(k).slice(1) : "Magic");

/** Fairy types (spell system.fairyprop = "fairy" + key). */
export const FAIRY_TYPES = [
  { key: "earth", label: "Earth" }, { key: "fire", label: "Fire" }, { key: "ice", label: "Water/Ice" },
  { key: "wind", label: "Wind" }, { key: "light", label: "Light" }, { key: "dark", label: "Darkness" },
];

const arr = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []);
const num = (v, d = null) => (v === "" || v == null || !Number.isFinite(Number(v)) ? d : Number(v));

/** School key of a magic Unique skill (null when it isn't one). */
export function skillSchoolKey(u) {
  if (!parseMagicSkill(u)) return null;
  if (u?.magic?.school) return WORD_KEY[String(u.magic.school).toLowerCase()] ?? String(u.magic.school).toLowerCase();
  const m = String(u?.name ?? "").match(/([A-Za-z]+)\s+Magic\b/i);
  return m ? WORD_KEY[m[1].toLowerCase()] ?? null : null;
}

/** Magic entry made from a magic Unique skill. */
export function entryFromSkill(u) {
  const ms = parseMagicSkill(u); if (!ms) return null;
  const mp = sbMagicPower(u);
  return { school: skillSchoolKey(u), level: ms.level, power: { fixed: mp ? mp.fixed : null }, fairies: [], from: String(u?.name ?? "") };
}

/** Unique skills still to move: magic ones not marked magicMoved. */
export function legacyMagicSkills(uniqueSkills) {
  return arr(uniqueSkills).map((u, index) => ({ index, u })).filter(({ u }) => !u?.magicMoved && parseMagicSkill(u));
}

/** One-time move of magic Unique skills into sb.magic. Returns { changed, magic, uniqueSkills } (new arrays). */
export function migrateMagic(raw = {}) {
  const magic = structuredClone(arr(raw.magic)); const uniqueSkills = structuredClone(arr(raw.uniqueSkills));
  const todo = legacyMagicSkills(uniqueSkills);
  for (const { index, u } of todo) { const e = entryFromSkill(u); if (!e) continue; magic.push(e); uniqueSkills[index].magicMoved = true; }
  return { changed: todo.length > 0, magic, uniqueSkills };
}

/** Skill-like object for the cast flow (parseMagicSkill / sbMagicPower read u.magic). */
export function skillLike(e) {
  const fixed = num(e?.power?.fixed);
  const school = e?.school ?? "";
  return { name: `${schoolLabel(school)} Magic ${num(e?.level, 0)}`, magic: { school, level: num(e?.level, 0), ...(fixed != null ? { power: { fixed } } : {}) } };
}

/**
 * Blocks to show: saved sb.magic entries, then magic Unique skills not moved yet (read-only view before the
 * owner's sheet saves the move). Block: { i, legacy, school, label, level, fixed, value, schools, fairies, isFairy, note, skill }
 */
export function magicBlocks(raw = {}) {
  const saved = arr(raw.magic).map((e, i) => ({ e, i, legacy: false }));
  const legacy = legacyMagicSkills(raw.uniqueSkills).map(({ index, u }) => ({ e: entryFromSkill(u), i: index, legacy: true }));
  return [...saved, ...legacy].filter((x) => x.e).map(({ e, i, legacy }) => {
    const skill = skillLike(e); const ms = parseMagicSkill(skill);
    const fixed = num(e.power?.fixed);
    const label = schoolLabel(e.school);
    return { i, legacy, school: e.school ?? "", label, level: num(e.level, 0), fixed, value: fixed == null ? null : fixed - 7,
      schools: ms?.schools ?? [], fairies: arr(e.fairies), isFairy: e.school === "fairy",
      note: e.from && e.from.trim() !== `${label} Magic ${num(e.level, 0)}` ? e.from : "", skill };
  });
}

/** Fairy spell allowed by the ticked contracts: basic always; a type spell needs its type; special needs all six. Unknown -> allowed. */
export function fairyAllows(doc, fairies = []) {
  const sys = doc?.system ?? {}; const d = doc?.flags?.["sw25-ce"]?.data ?? {};
  const type = String(sys.fairytype ?? d.fairyType ?? "").toLowerCase();
  const prop = String(sys.fairyprop ?? d.fairyProp ?? "").toLowerCase().replace(/^fairy/, "");
  const set = new Set(fairies);
  if (type === "specialfairy") return FAIRY_TYPES.every((t) => set.has(t.key));
  if (prop && FAIRY_TYPES.some((t) => t.key === prop)) return set.has(prop);
  return true;
}

const TYPE_TO_SCHOOL = Object.fromEntries(Object.entries(SCHOOL_TO_TYPE).map(([k, v]) => [v, k]));
/** School key of a spell doc: system.school / Writer flags, else the legacy item bucket (system.type "sorcerer" -> truespeech). */
export function spellSchoolKey(doc) {
  const s = String(doc?.system?.school ?? doc?.flags?.["sw25-ce"]?.data?.school ?? doc?.flags?.["sw25-ce"]?.school ?? "").toLowerCase();
  if (s) return WORD_KEY[s] ?? s;
  return TYPE_TO_SCHOOL[String(doc?.system?.type ?? "").toLowerCase()] ?? "";
}
const ownedMeta = (doc) => ({ ...spellMeta(doc), school: spellSchoolKey(doc), owned: true, itemId: doc._id ?? doc.id ?? null });

/**
 * Spells a block can cast. Compendium docs: school + level (Fairy also by contracts). Owned spell items (dropped on the
 * stat block) of the block's school always show (aboveLevel when over the skill level) and replace a same-name copy.
 * Returns [{ meta, doc }] sorted by level, name.
 */
export function blockSpells(block, docs = [], owned = []) {
  const mine = owned.filter((d) => block.schools.includes(spellSchoolKey(d))).map((doc) => ({ meta: ownedMeta(doc), doc }));
  const names = new Set(mine.map((x) => x.meta.name));
  const pack = spellsForSkill({ schools: block.schools, level: block.level }, docs)
    .map((m) => ({ meta: m, doc: docs.find((x) => (m.uuid && x.uuid === m.uuid) || x.name === m.name) ?? null }))
    .filter(({ meta, doc }) => !names.has(meta.name) && (!block.isFairy || fairyAllows(doc, block.fairies)));
  for (const x of mine) x.meta.aboveLevel = x.meta.level > block.level;
  return [...mine, ...pack].sort((a, b) => a.meta.level - b.meta.level || a.meta.name.localeCompare(b.meta.name));
}

/** Schools the "Add magic skill" row / Unassigned prompt can create. */
export const ADDABLE = new Set([...MAGIC_SCHOOLS.map((s) => s.key), "summoning"]);

/** Owned spells no block can cast, grouped by school: [{ school, label, canAdd, level, spells:[doc] }]. */
export function unassignedSpells(blocks, owned = []) {
  const covered = new Set(blocks.flatMap((b) => b.schools));
  const groups = new Map();
  for (const d of owned) {
    const k = spellSchoolKey(d); if (k && covered.has(k)) continue;
    if (k === "wizardry" && covered.has("truespeech") && covered.has("spiritualism")) continue;
    if (!groups.has(k)) groups.set(k, { school: k, label: k ? schoolLabel(k) : "", canAdd: ADDABLE.has(k), level: 1, spells: [] });
    const g = groups.get(k); g.spells.push(d); g.level = Math.max(g.level, Number(spellMeta(d).level) || 1);
  }
  return [...groups.values()];
}

/** "Add magic skill" row values -> entry (null when invalid). */
export function newMagicEntry({ school, level, power }) {
  if (!ADDABLE.has(school)) return null;
  const lv = Math.max(1, Math.min(20, Math.trunc(num(level, 1))));
  const v = num(power, 0);
  return { school, level: lv, power: { fixed: v + 7 }, fairies: [], from: "" };
}

/** MP bar numbers for the paying part. */
export function mpBar(pool) {
  const max = Number(pool?.mpMax) || 0; const cur = Number(pool?.mp) || 0;
  return { cur, max, pct: max > 0 ? Math.max(0, Math.min(100, Math.round((cur / max) * 100))) : 0 };
}

const SPELL_FALLBACK = "systems/sw25-ce/assets/icons/weapon.svg";
const BAD_IMG = /mystery-man|item-bag|^$/;
/** One aligned spell card: icon, name + target/range/resist, Lv, MP, Power N or GM-only/Public toggle, Cast. */
export function spellCard(meta, doc, gmMap = {}, extra = {}) {
  const sys = doc?.system ?? {}; const d = doc?.flags?.["sw25-ce"]?.data ?? {};
  const power = meta.power ? (typeof meta.power === "object" ? (meta.power.rate ?? meta.power.value ?? null) : meta.power) : null;
  const resist = meta.resist || sys.resist || "";
  const sub = [sys.target || d.target, sys.range || d.range, resist ? `resist ${resist}` : ""].filter(Boolean).join(" · ");
  const img = String(doc?.img ?? "");
  return { name: meta.name, uuid: meta.uuid ?? null, level: meta.level, sub: sub || "—",
    cost: meta.cost?.raw || (meta.cost?.base != null ? `${meta.cost.base} MP` : "—"),
    img: BAD_IMG.test(img) ? null : img, fallback: SPELL_FALLBACK,
    hasPower: power != null && power !== "", power, key: slugKey(meta.name), gmOnly: !power && spellGmOnly(gmMap, meta.name),
    owned: !!meta.owned, itemId: meta.itemId ?? null, aboveLevel: !!meta.aboveLevel, ...extra };
}

export const SHOWN_SPELLS = 4;
/**
 * Magic section view: { has, blocks, mp: {cur,max,pct,name}, partChoices, partIndex, multiPart, schools, fairyTypes }.
 * rawSb = system.sb source; viewParts = sbView.parts; docs = spell docs; partIndex = chosen paying part (flag).
 */
export function buildMagicContext({ rawSb = {}, viewParts = [], docs = [], owned = [], gmMap = {}, partIndex = null } = {}) {
  const pool = sbPoolInfo(arr(rawSb.parts), viewParts, partIndex);
  const blocks = magicBlocks(rawSb).map((b) => {
    const cards = blockSpells(b, docs, owned).map(({ meta, doc }) => spellCard(meta, doc, gmMap));
    // Spell items on the sheet always show; other spells after the first SHOWN_SPELLS fold into "+ N more".
    let n = 0; const shown = []; const more = [];
    for (const c of cards) (c.owned || n++ < SHOWN_SPELLS ? shown : more).push(c);
    return { ...b, shown, more, count: cards.length,
      castFormula: b.value == null ? null : `2d6${b.value >= 0 ? "+" : ""}${b.value}`,
      castLabel: `${b.label} Magic ${b.level}: Casting`,
      fairyTypes: b.isFairy ? FAIRY_TYPES.map((t) => ({ ...t, on: b.fairies.includes(t.key) })) : null };
  });
  const unassigned = unassignedSpells(blocks, owned).map((g) => ({ ...g,
    cards: g.spells.map((d) => spellCard({ ...ownedMeta(d) }, d, gmMap, { castable: false })) }));
  return { has: blocks.length > 0 || unassigned.length > 0, blocks, unassigned, mp: { ...mpBar(pool), name: pool.name }, partIndex: pool.index,
    partChoices: pool.choices.map((c) => ({ ...c, selected: c.i === pool.index })), multiPart: pool.choices.length > 1,
    schools: MAGIC_SCHOOLS, fairyTypes: FAIRY_TYPES };
}
