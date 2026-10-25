#!/usr/bin/env node
/**
 * Build per-category compendium packs from Writer data (/workspace/sw25/gen/data/<category>/*.json).
 * Output goes to a TEMP dir (default /tmp/sw25-compendia-build/packs/<pack>); never into the live packs/.
 * Usage: node tools/build-compendia.mjs [--data DIR] [--out DIR] [--only fighter,fencer,priest] [--json-only]
 * Deterministic _id from category+slug; flags.sw25-ce.slug is what grant refs resolve against.
 * The Writer JSON is kept verbatim in flags.sw25-ce.data for later richer mapping.
 */
import { SCHOOL_TO_TYPE } from "../module/rules/spell-school.mjs";
import { statBlockFromData, dispositionFor, npcToggleDisposition, parseMovement } from "../module/rules/statblock.mjs";
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";

const here = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(here, "..");
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const DATA = path.resolve(arg("data", path.resolve(ROOT, "../gen/data")));
const OUT = path.resolve(arg("out", "/tmp/sw25-compendia-build"));
const ONLY = arg("only", "") ? new Set(arg("only").split(",")) : null;
const JSON_ONLY = process.argv.includes("--json-only");
if (path.resolve(OUT).startsWith(path.join(ROOT, "packs"))) { console.error("refusing to write into live packs/"); process.exit(2); }

export const PACKS = {
  classes: { name: "sw25-classes", label: "SW2.5 Classes", type: "Item" },
  feats: { name: "sw25-feats", label: "SW2.5 Combat Feats", type: "Item" },
  spells: { name: "sw25-spells", label: "SW2.5 Spells", type: "Item" },
  items: { name: "sw25-items", label: "SW2.5 Items", type: "Item" },
  monsters: { name: "sw25-monsters", label: "SW2.5 Monsters", type: "Actor" },
  gods: { name: "sw25-gods", label: "SW2.5 Gods", type: "JournalEntry" },
};
const KEYDOC = { Item: "items", Actor: "actors", JournalEntry: "journal" };
// XP table: Writer exptable wins; else major -> A, minor -> B.
export const exptableOf = (d) => d.exptable || ({ major: "A", minor: "B" })[String(d.category ?? "").toLowerCase()] || "";
/** Recursively list Writer JSON files; nested files get slug "<subdir>/<slug>" (matches grant refs like divine-lyphos/peace). */
export function listData(dir, prefix = "") {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith("_") || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listData(p, prefix + e.name + "/"));
    else if (e.name.endsWith(".json")) {
      const d = JSON.parse(fs.readFileSync(p, "utf8"));
      if (d.slug) out.push({ ...d, slug: prefix + d.slug, ...(prefix ? { baseSlug: d.slug } : {}) });
    }
  }
  return out;
}
export const idFor = (cat, slug) => {
  const h = crypto.createHash("sha1").update(`sw25-ce:${cat}:${slug}`).digest();
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(h.subarray(0, 16), (b) => A[b % 62]).join("");
};
// Writer data is inconsistent: priest has category "major"/tier "wizard"; fighter has category "warrior"/tier "major".
export function skillTypeOf(d) {
  const v = [d.category, d.tier].map((x) => String(x ?? "").toLowerCase());
  if (v.includes("warrior")) return "fighterskill";
  if (v.includes("wizard") || v.includes("magic")) return "magicuserskill";
  return "otherskill";
}
/** MP cost may be a number or text ("MP50-200", "MP5 + HP5", "MP10 + 5-point min. Mako Stone"). Returns {raw, base, max, extra, flag}. */
export function parseMp(v) {
  if (v === null || v === undefined || v === "") return { raw: "", base: null, flag: null };
  if (typeof v === "number") return { raw: String(v), base: v, flag: null };
  const raw = String(v).trim(); const m = raw.match(/^MP\s*(\d+)(?:\s*-\s*(\d+))?\s*(.*)$/i);
  if (!m) return { raw, base: null, flag: "unparsed" };
  const out = { raw, base: Number(m[1]), flag: null };
  if (m[2]) { out.max = Number(m[2]); out.flag = "range"; }
  const rest = m[3].trim();
  if (rest) { out.extra = rest.replace(/^\+\s*/, ""); const hp = rest.match(/HP\s*(\d+)/i); const mako = rest.match(/(\d+)-point min\. Mako Stone/i);
    if (hp) out.hpCost = Number(hp[1]); if (mako) out.makoStone = Number(mako[1]); out.flag = out.flag ? out.flag + "+extra" : "extra"; }
  return out;
}
/** Private book Power table (gen/data/rules/power-table.json, NEVER committed): { table: { "<power>": [v3..v12] } }.
 * Read at build time; missing/unreadable file -> null (weapons without their own powerTable keep blank rows). */
export const POWER_TABLE_FILE = path.join(DATA, "rules", "power-table.json");
export const powerTableWarnings = new Set();
let PT_CACHE;
export function loadPowerTable(file = POWER_TABLE_FILE) {
  try { const j = JSON.parse(fs.readFileSync(file, "utf8")); const t = j && typeof j.table === "object" ? j.table : j;
    return t && typeof t === "object" ? t : null; }
  catch (e) { if (e.code !== "ENOENT") console.warn(`power table unreadable (${file}): ${e.message}`); return null; }
}
const globalPowerTable = () => (PT_CACHE === undefined ? (PT_CACHE = loadPowerTable()) : PT_CACHE);
/** Row [v3..v12] for a numeric power from the table; warns (once per value) when the value isn't there. */
export function powerRow(power, table = globalPowerTable(), who = "") {
  if (power === null || power === undefined || power === "" || typeof power === "object" || !table) return null;
  const row = table[String(Number(power))];
  if (Array.isArray(row) && row.length === 10) return row.map(Number);
  const msg = `power ${power} not in power table${who ? ` (${who})` : ""}`;
  if (!powerTableWarnings.has(msg)) { powerTableWarnings.add(msg); console.warn(msg); }
  return null;
}
const ownRow = (t) => (Array.isArray(t) && t.length === 10 ? t.map(Number) : null);
const ptFields = (row) => (row ? Object.fromEntries(row.map((v, i) => [`pt${i + 3}`, v])) : {});
/** Weapon roll fields: power, crit (cvalue), own Accuracy/Extra Damage modifiers, and the book row as pt3..pt12
 * (the shipped Reference Power Table is blank, so without these every roll read 0). An explicit powerTable wins;
 * otherwise the row comes from the private Power table by power value. */
export function weaponSystem(d, table = globalPowerTable()) {
  const out = { power: d.power ?? null, cvalue: d.critThreshold ?? 10, hit: Number(d.accuracy) || 0, dmod: Number(d.extraDamage) || 0 };
  return Object.assign(out, ptFields(ownRow(d.powerTable) ?? powerRow(d.power, table, d.slug ?? d.name)));
}
/** Spell power fields: numeric power -> pt3..pt12 (own powerTable, else table row); {rate} object without a table gets one. */
export function spellPowerFields(d, table = globalPowerTable()) {
  if (d.power && typeof d.power === "object") {
    if (ownRow(d.power.table) || d.power.rate == null) return { power: d.power };
    const row = powerRow(d.power.rate, table, d.slug); return { power: row ? { ...d.power, table: row } : d.power };
  }
  if (!d.power) return {};
  return { power: d.power, ...ptFields(ownRow(d.powerTable) ?? powerRow(d.power, table, d.slug)) };
}
const hasPowerTable = (d) => Array.isArray(d.powerTable) ? d.powerTable.length > 0 : !!(d.power || d.powerTable || d.powerByDeityRank || d.weapon?.table);
const desc = (d) => [d.summary, d.description].filter((x) => x && x !== "null").map((t) => `<p>${String(t).replace(/</g, "&lt;")}</p>`).join("");

export function toDoc(cat, d) {
  const _id = idFor(cat, d.slug);
  const base = { _id, name: d.name, flags: { "sw25-ce": { slug: d.slug, data: d } }, _key: `!${KEYDOC[PACKS[cat].type]}!${_id}` };
  const sys = { description: desc(d), rules: d.rules ?? [] };
  switch (cat) {
    case "classes": return { ...base, type: "skill", img: "icons/svg/book.svg", system: { ...sys, skilltype: skillTypeOf(d), exptable: exptableOf(d), skilllevel: 1, autoFeats: d.autoFeats ?? [] } };
    case "feats": if (d.todo) base.flags["sw25-ce"].todo = d.todo; return { ...base, type: "combatability", img: "icons/svg/sword.svg", system: { ...sys, use: d.use ?? "", nonCombat: d.nonCombat === true || (NON_COMBAT ??= nonCombatSlugs()).has(d.slug), autoFeats: d.autoFeats ?? [] } };
    case "spells": {
      const mp = parseMp(d.mpCost); const god = d.slug.match(/^spells?\/?divine-([^/]+)\/|^divine-([^/]+)\//);
      const warn = [mp.flag && `mp:${mp.flag}`, /power table/i.test(d.todo ?? "") && !hasPowerTable(d) && "power-table-empty"].filter(Boolean);
      Object.assign(base.flags["sw25-ce"], { mp, ...(d.element ? { element: d.element } : {}), ...(god ? { god: god[1] ?? god[2] } : {}), ...(warn.length ? { warnings: warn } : {}), ...(d.todo ? { todo: d.todo } : {}) });
      return { ...base, type: "spell", img: "icons/svg/daze.svg", system: { ...sys, type: SCHOOL_TO_TYPE[String(d.school ?? "").toLowerCase()] ?? "", mpcost: mp.base ?? mp.raw, mpcostText: mp.raw, element: d.element ?? "", ...(d.mpRule ? { mpRule: d.mpRule } : {}), ...(d.power ? { ...spellPowerFields(d), powerCrit: d.powerCrit ?? null } : {}), ...(d.powerByDeityRank ? { powerByDeityRank: d.powerByDeityRank } : {}), ...(d.weapon ? { weapon: d.weapon } : {}), target: d.target ?? "", time: d.duration ?? "", resist: d.resistance ?? "" } };
    }
    case "items": return { ...base, type: d.type === "weapon" ? "weapon" : d.type === "armor" ? "armor" : d.type === "accessory" ? "accessory" : "item", img: "icons/svg/item-bag.svg", system: { ...sys, category: d.category ?? "", reqstr: d.minStr ?? null, price: d.price ?? null, ...(d.type === "weapon" ? weaponSystem(d) : {}) } };
    case "gods": {
      const { data, ...f } = base.flags["sw25-ce"];
      const html = desc({ description: [d.title, d.domain, d.holySymbol && `Holy symbol: ${d.holySymbol}`, d.alignmentRaceNotes].filter(Boolean).join(". ") })
        + (d.sayings?.length ? `<ul>${d.sayings.map((x) => `<li>${String(x).replace(/</g, "&lt;")}</li>`).join("")}</ul>` : "")
        + (d.specialSpells?.length ? `<p>Special spells: ${d.specialSpells.map((x) => `Lv${x.level} ${x.name}`).join(", ")}</p>` : "");
      const pid = idFor("gods-page", d.slug);
      return { _id, name: d.name, flags: { "sw25-ce": { slug: d.slug, rank: d.rank, data } }, _key: base._key,
        pages: [{ _id: pid, name: d.name, type: "text", text: { content: html, format: 1 }, _key: `!journal.pages!${_id}.${pid}` }] };
    }
    case "monsters": {
      const { rules, ...msys } = sys;
      return { ...base, type: d.type === "npc" ? "npc" : "monster", img: "icons/svg/mystery-man.svg", system: { ...msys, monlevel: d.level, sb: statBlockFromData({ ...d, description: msys.description }) },
        prototypeToken: { disposition: { FRIENDLY: 1, NEUTRAL: 0, HOSTILE: -1 }[dispositionFor(statBlockFromData(d), d.type === "npc" ? "npc" : "monster")] }, items: [], effects: [] };
    }
  }
}

/** Keys documented in the Writer's RULE_KEYS.md: passed through verbatim, not errors, but reported as not applied (engine support needs approval). */
export function documentedKeys(file = path.join(DATA, "RULE_KEYS.md")) {
  try { return new Set([...fs.readFileSync(file, "utf8").matchAll(/^\|\s*`([\w.]+)`/gm)].map((m) => m[1])); } catch { return new Set(); }
}
/** Non-combat feat slugs from feats/_non-combat.json (underscore files are never entries). */
export function nonCombatSlugs(file = path.join(DATA, "feats", "_non-combat.json")) {
  try { const j = JSON.parse(fs.readFileSync(file, "utf8")); return new Set(Array.isArray(j) ? j : j.nonCombat ?? []); } catch { return new Set(); }
}
let NON_COMBAT = null;
const KIND_CAT = { feat: ["feats"], spell: ["spells"], feature: ["feats", "classes"], technique: ["feats"], weapon: ["items"], item: ["items"] };
/** Check every grant ref / choose option against the built slugs, and every rule key against the engine. */
export async function checkRefs(all) {
  const { resolveKey } = await import("../module/rules/engine.mjs");
  const slugs = {}; for (const { cat, d } of all) (slugs[cat] ??= new Set()).add(d.slug);
  const unresolved = []; const unmapped = {}; const unapplied = {}; const documented = documentedKeys();
  for (const { cat, d } of all) {
    for (const r of d.rules ?? []) {
      if (!r?.key) continue; const k = resolveKey(r.key);
      if (k.unknown || k.kind === "note") ((k.unknown && !documented.has(r.key)) ? (unmapped[r.key] ??= []) : (unapplied[r.key] ??= [])).push(d.slug);
    }
    for (const g of d.autoFeats ?? []) {
      if (g.choose) {
        if (g.choose === "god") for (const o of g.options ?? []) { const id = typeof o === "object" ? o.id ?? o.ref : o; if (!slugs.gods?.has(id)) unresolved.push({ from: d.slug, choose: "god", ref: id }); }
        for (const o of g.options ?? []) if (o && typeof o === "object" && o.ref && !Object.values(slugs).some((s) => s.has(o.ref))) unresolved.push({ from: d.slug, choose: g.choose, ref: o.ref });
        continue;
      }
      const ref = g.ref ?? g.uuid; if (!ref || /^(Compendium|Item)\./.test(ref)) continue;
      const cats = KIND_CAT[g.kind] ?? Object.keys(slugs);
      if (!cats.some((c) => slugs[c]?.has(ref))) unresolved.push({ from: d.slug, kind: g.kind, ref });
    }
  }
  return { unresolved, unmappedKeys: unmapped, documentedNotApplied: unapplied };
}
/** Inline weapon/item grants (e.g. Grappler Throw: {kind:"weapon", ref, stats}) become sw25-items entries. */
export function inlineItems(classes) {
  const out = [];
  for (const c of classes) for (const g of c.autoFeats ?? []) {
    if (!["weapon", "armor", "item"].includes(g.kind) || !g.stats || !g.ref) continue;
    const { kind, ref, level, level_max, when, stats, ...rest } = g;
    out.push({ ...rest, slug: ref, name: g.name ?? ref.replace(/(^|-)(\w)/g, (m, a, b) => (a ? " " : "") + b.toUpperCase()), type: kind,
      minStr: stats.minStr, power: stats.power, powerTable: stats.powerTable, critThreshold: stats.crit, accuracy: stats.accuracy, price: stats.price, stats, grantedBy: c.slug });
  }
  return out;
}

// ---------- Compendium folders ----------
const cap = (s) => String(s ?? "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/ Ice$/, "/Ice");
const lvl = (n) => (Number.isFinite(Number(n)) && n !== null && n !== "" ? [`Level ${Number(n)}`, Number(n)] : ["Level ?", 999]);
const SCHOOL_ORDER = ["truespeech", "spiritualism", "divine", "magitech", "fairy", "nature", "summoning", "abyssal"];
const SCHOOL_LABEL = { truespeech: "Truespeech Magic", spiritualism: "Spiritualism Magic", divine: "Divine Magic", magitech: "Magitech", fairy: "Fairy Magic", nature: "Nature Magic", summoning: "Summoning Magic", abyssal: "Abyssal Magic" };
const ELEMENT_ORDER = ["basic", "earth", "water-ice", "fire", "wind", "light", "dark", "special"];
const SLOT_ORDER = ["head", "face", "ears", "neck", "back", "right hand", "left hand", "waist", "feet", "other"];
const SLOT_ALIAS = { boots: "feet", foot: "feet", shoes: "feet", ear: "ears", hand: "other", "right-hand": "right hand", "left-hand": "left hand", righthand: "right hand", lefthand: "left hand" };
const RANK_ORDER = ["B", "A", "S", "SS"];
const rankSeg = (r) => { const R = String(r ?? "").toUpperCase(); return RANK_ORDER.includes(R) ? [`Rank ${R}`, RANK_ORDER.indexOf(R)] : ["Unranked", 99]; };
const idx = (arr, v, fb = 50) => { const i = arr.indexOf(v); return i < 0 ? fb : i; };
/** Folder path for one entry: array of [name, sortKey]. Empty array = root. */
export function folderPathFor(cat, d) {
  switch (cat) {
    case "spells": {
      const school = String(d.school ?? "").toLowerCase(); const top = [SCHOOL_LABEL[school] ?? (cap(school) || "Unsorted"), idx(SCHOOL_ORDER, school)];
      if (school === "divine") {
        const god = d.slug.match(/(?:^|\/)divine-([^/]+)\//)?.[1];
        if (god) return [top, [`Special: ${cap(god)}`, 100 + god.charCodeAt(0)]]; // 1 spell per level: flat, sorted by level
        return [top, ["Common", 0], lvl(d.level)];
      }
      if (school === "fairy") { const e = String(d.element ?? "").toLowerCase(); return [top, e ? [cap(e), idx(ELEMENT_ORDER, e)] : ["General", 90]]; } // 1 spell per level per element: flat, sorted by level
      return [top, lvl(d.level)];
    }
    case "items": {
      const t = String(d.type ?? "").toLowerCase();
      if (t === "weapon") return [["Weapons", 0], [cap(d.category) || "Uncategorized", 0], rankSeg(d.rank)];
      if (t === "armor") return [["Armor", 1], [cap(d.category) || "Uncategorized", 0], rankSeg(d.rank)];
      if (t === "shield") return [["Shields", 2], rankSeg(d.rank)];
      if (t === "accessory" || t === "gear" || d.slot) {
        const raw = String(d.slot ?? d.equipSlot ?? "").toLowerCase().trim(); const s = SLOT_ALIAS[raw] ?? raw;
        const slot = SLOT_ORDER.includes(s) ? s : "other";
        const cls = d.classRestriction ?? d.classes ?? d.restrictedTo;
        const clsName = Array.isArray(cls) ? (cls.length ? cls.map(cap).join(", ") : "") : cap(cls ?? "");
        return [["Gear", 3], [slot === "feet" ? "Feet (Boots)" : cap(slot), idx(SLOT_ORDER, slot)], clsName ? [clsName, 1] : ["Any Class", 0], rankSeg(d.rank)];
      }
      if (t === "consumable" || t === "potion" || t === "herb") return [["Consumables", 4], [cap(d.category) || "General", 0]];
      return [["Other Items", 9], [cap(d.category || t) || "General", 0]];
    }
    case "classes": {
      const st = skillTypeOf(d); const [n, k] = st === "fighterskill" ? ["Warrior Classes", 0] : st === "magicuserskill" ? ["Wizard Classes", 1] : ["Other Classes", 2];
      const tier = String(d.category ?? "").toLowerCase(); return [[n, k], tier === "major" ? ["Major (Table A)", 0] : tier === "minor" ? ["Minor (Table B)", 1] : [cap(tier) || "Unsorted", 2]];
    }
    case "gods": { const r = String(d.rank ?? "").toLowerCase(); return [[cap(r) ? `${cap(r)} Gods` : "Unsorted", idx(["ancient", "major", "minor"], r)]]; }
    case "monsters": return [[cap(d.monsterType || (d.type === "npc" ? "NPC" : "")) || "Uncategorized", 0], lvl(d.level)];
    case "feats": { const nc = d.nonCombat === true || (NON_COMBAT ??= nonCombatSlugs()).has(d.slug); return [nc ? ["Non-combat Feats", 1] : ["Combat Feats", 0]]; }
  }
  return [];
}
/** Build Folder docs for a pack and set doc.folder on every entry. Sibling order: sortKey then name; sorting "m" (manual) so sort is honoured. */
export function buildFolders(cat, entries) {
  const type = PACKS[cat].type; const nodes = new Map();
  for (const { doc, d } of entries) {
    let parent = null; let key = "";
    for (const [name, sk] of folderPathFor(cat, d)) {
      key += "/" + name;
      if (!nodes.has(key)) nodes.set(key, { _id: idFor(`folder:${cat}`, key), name, type, folder: parent, sorting: "a", sort: 0, sk, color: null, description: "", flags: { "sw25-ce": { path: key } }, count: 0 });
      parent = nodes.get(key)._id; nodes.get(key).count++;
    }
    doc.folder = parent; doc.sort = 0;
  }
  // spells: entries sort by level then name (manual sort), so flat element/god folders read Lv1..Lv15
  if (cat === "spells") { const names = [...new Set(entries.map((e) => e.doc.name))].sort((a, b) => a.localeCompare(b));
    for (const { doc, d } of entries) doc.sort = (Number(d.level) || 0) * 10000 + names.indexOf(doc.name); }
  const all = [...nodes.values()]; const byParent = {};
  for (const f of all) (byParent[f.folder ?? ""] ??= []).push(f);
  for (const sibs of Object.values(byParent)) sibs.sort((a, b) => a.sk - b.sk || a.name.localeCompare(b.name)).forEach((f, i) => { f.sort = (i + 1) * 100000; });
  // folders containing level subfolders sort manually (Level 2 < Level 10); entries inside leaves alphabetical
  for (const f of all) if (byParent[f._id] || cat === "spells") f.sorting = "m";
  return all.map(({ sk, count, ...f }) => ({ ...f, _key: `!folders!${f._id}` }));
}
/** Text tree with counts, for the report. */
export function folderTree(folders, entries) {
  const kids = {}; for (const f of folders) (kids[f.folder ?? ""] ??= []).push(f);
  const direct = {}; for (const { doc } of entries) direct[doc.folder ?? ""] = (direct[doc.folder ?? ""] ?? 0) + 1;
  const total = (id) => (direct[id] ?? 0) + (kids[id] ?? []).reduce((s, f) => s + total(f._id), 0);
  const lines = []; const walk = (id, ind) => { for (const f of (kids[id] ?? []).sort((a, b) => a.sort - b.sort)) { lines.push(`${ind}${f.name} (${total(f._id)})`); walk(f._id, ind + "  "); } };
  walk("", ""); if (direct[""]) lines.push(`(root) ${direct[""]}`); return lines.join("\n");
}

// ---------- Private test actors (sw25-test-actors): never committed, built only into OUT ----------
export const TEST_ACTORS = { name: "sw25-test-actors", label: "SW2.5 Test Actors (private)", type: "Actor" };
const TA_FOLDERS = { pcs: ["PCs", 1], npcs: ["NPCs", 2], monsters: ["Monsters", 3] };
export const artPath = (group, slug, kind) => `assets/sw25-content/actors/${group}/${slug}-${kind}.webp`;
const embed = (actorId, doc, extra = {}) => { const _id = idFor(`embed:${actorId}`, doc.flags?.["sw25-ce"]?.slug ?? doc.name); const { folder, sort, _key, ...rest } = doc; return { ...rest, ...extra, _id, _key: `!actors.items!${actorId}.${_id}` }; };
/** Writer unique skill {name, icon, part, text} -> sb uniqueSkill; magic[] attaches {school, level, power} to the "<School> Magic N" skill. */
export function sbSkill(u, magic = []) {
  const m = String(u.name ?? "").match(/([A-Za-z]+)\s+Magic\s+(\d+)/i);
  const mg = m && magic.find((x) => String(x.school).toLowerCase() === m[1].toLowerCase());
  const { text, icon, ...rest } = u;
  return { ...rest, description: u.description ?? text ?? "", tags: u.tags ?? (icon ? [icon] : []), magic: u.magic ?? (mg ? { school: mg.school, level: mg.level, power: mg.power } : (m ? { school: m[1].toLowerCase(), level: Number(m[2]) } : null)) };
}
/** One test-actor JSON -> Actor doc. ctx = { lookup(cat, slug) -> Writer data | undefined, gaps: [] } */
export function testActorDoc(group, d, ctx = { lookup: () => undefined, gaps: [] }) {
  const _id = idFor("test-actors", `${group}/${d.slug}`);
  const gap = (msg) => ctx.gaps.push(`${group}/${d.slug}: ${msg}`);
  const base = { _id, name: d.name, img: artPath(group, d.slug, "portrait"), folder: null, sort: 0, effects: [], _key: `!actors!${_id}`,
    flags: { "sw25-ce": { slug: d.slug, testActor: true, source: d.source ?? "", ...(d.todo ? { todo: d.todo } : {}) } } };
  const token = (disp) => ({ name: d.name, texture: { src: artPath(group, d.slug, "token") }, disposition: disp, actorLink: group === "pcs" });
  const items = [];
  const addRef = (cat, slug, extra = {}) => { const src = ctx.lookup(cat, slug); if (!src) { gap(`unresolved ${cat} ref "${slug}"`); return null; } const it = embed(_id, toDoc(cat, src), extra); items.push(it); return it; };
  if (group === "pcs") {
    for (const c of d.classes ?? []) addRef("classes", c.slug, {}) && (items.at(-1).system.skilllevel = c.level);
    for (const f of d.feats ?? []) addRef("feats", f);
    // Spellcasting classes learn every spell of their school up to class level (SW2.5). Priest: general divine only
    // (god-specific spells need a deity); Fairy Tamer: element-dependent, not auto-granted.
    const spellLib = ctx.list?.("spells") ?? [];
    for (const c of d.classes ?? []) {
      const k = ctx.lookup("classes", c.slug); if (!k) continue;
      const schools = (k.classSkills ?? []).filter((x) => x.check === "spellcasting").flatMap((x) => x.limit ?? []);
      for (const school of schools) {
        if (school === "fairy") { gap(`${c.slug}: fairy spells not auto-granted (element choice)`); continue; }
        for (const sp of spellLib.filter((x) => x.school === school && Number(x.level) <= c.level && !toDoc("spells", x).flags["sw25-ce"].god).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)))
          items.push(embed(_id, toDoc("spells", sp)));
      }
    }
    const g = d.gear ?? {};
    const gearItem = (x, type, sys) => { const slug = x.slug ?? x.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      items.push(embed(_id, { name: x.name, type, img: "icons/svg/item-bag.svg", flags: { "sw25-ce": { slug, data: x } }, system: { description: "", rules: [], quantity: 1, price: x.price ?? "", ...sys } })); };
    // PC sheet "accuracy"/"extraDamage" are book TOTALS (class level + Dex/Str bonus); the engine adds those itself
    // from the weapon's class, so only the catalogue weapon's own modifiers go in hit/dmod.
    for (const w of g.weapons ?? []) { const cat = w.slug ? ctx.lookup("items", w.slug) : null;
      gearItem(w, "weapon", { type: w.category ?? "", usage: w.stance ?? "", range: w.range ?? "", reqstr: w.minStr ?? null, ...weaponSystem({ ...(cat ?? {}), ...w, accuracy: cat?.accuracy ?? 0, extraDamage: cat?.extraDamage ?? 0, powerTable: w.powerTable ?? cat?.powerTable }) }); }
    for (const a of g.armor ?? []) gearItem(a, "armor", { type: a.category ?? "", pp: a.defense ?? 0, dodge: a.evasion ?? 0, reqstr: a.minStr ?? null });
    for (const a of g.accessories ?? []) { if (!a.slot) gap(`accessory "${a.name}" has no slot`); gearItem(a, "accessory", { accpart: a.slot ?? "" }); }
    for (const s of g.items ?? []) { const m = String(s).match(/^(.*?)\s+x(\d+)$/); gearItem({ name: m ? m[1] : s }, "item", { quantity: m ? Number(m[2]) : 1 }); }
    const ab = d.abilities ?? {}; const B = ab.base ?? {}; const C = ab.correction ?? {};
    const A = { dex: ["dexterity", "tech"], agi: ["agility", "tech"], str: ["strength", "body"], vit: ["vitality", "body"], int: ["intelligence", "mind"], mnd: ["spirit", "mind"] };
    const abilities = {}; for (const [k, [long, b]] of Object.entries(A)) { abilities[k] = { racevalue: B[b] ?? "", valuebase: C[long] ?? ((ab[long] ?? 0) - (B[b] ?? 0)) }; if (ab[long] != null && (B[b] ?? 0) + (C[long] ?? 0) !== ab[long]) gap(`${long} ${ab[long]} != base ${B[b]} + correction ${C[long]}`); }
    if (d.racialAbilities?.length) gap("racialAbilities kept as flags only (no raceability items built)");
    if (d.languages?.length) gap("languages kept as flags only (character language items not built)");
    Object.assign(base.flags["sw25-ce"], { racialAbilities: d.racialAbilities ?? [], languages: d.languages ?? [], derived: d.derived ?? {} });
    return { ...base, type: "character", items, prototypeToken: token(1),
      system: { race: d.race ?? "", class: d.race ?? "", money: d.money ?? 0, faith: d.derived?.deity ?? "", hp: { value: d.hp ?? "" }, mp: { value: d.mp ?? "" }, abilities, attributes: { advlevel: { value: d.adventurerLevel ?? "" } } } };
  }
  if (d.fellow) {
    const rows = (d.actionTable ?? []).map((r) => ({ action: r.action ?? "", kind: /attack/i.test(r.action ?? "") ? "attack" : "check", dialogue: r.dialogue ?? "", value: r.value ?? "", effect: r.effect ?? "", mp: r.mp ?? 0 }));
    const classes = (d.classes ?? []).map((c) => { const k = ctx.lookup("classes", c.slug); if (!k) gap(`unresolved classes ref "${c.slug}"`); return `${k?.name ?? c.slug} ${c.level}`; }).join(", ");
    const fellow = { enabled: true, race: d.race ?? "", gender: d.gender ?? "", age: d.age ?? "", level: d.adventurerLevel ?? 1, classes, languages: d.languages ?? [], intro: d.introduction ?? "",
      wantsExp: d.wants?.experience ?? true, wantsReward: d.wants?.reward ?? true, owner: "", mp: { value: d.mp ?? 0, max: d.mp ?? 0 }, rows, consumables: d.consumables ?? [] };
    if (!d.parts) gap("Fellow has no stat block parts (sb left empty; Fellow card only)");
    return { ...base, type: "npc", items, prototypeToken: token(1),
      system: { description: "", sb: { ...statBlockFromData(d), hostile: false, race: d.race ?? "", classLevels: d.classes ?? [] }, fellow } };
  }
  // NPC / monster stat blocks (Kobold format)
  const parts = (d.parts ?? []).map((p) => { const { mainPart, ...q } = p; return { ...q, isCore: !!mainPart }; });
  const mi = parts.findIndex((p) => p.isCore); if (mi > 0) parts.unshift(...parts.splice(mi, 1));
  if (parts.length > 1 && mi < 0) gap("multi-part without mainPart");
  const magic = d.magic ?? [];
  const sb = { ...statBlockFromData({ ...d, parts }), parts, uniqueSkills: (d.uniqueSkills ?? []).map((u) => sbSkill(u, magic)), description: d.description ?? "" };
  if (d.movementFly) sb.movement = { ...parseMovement(d.movementSpeed), other: d.movementFly, otherMode: "Fly" };
  if (d.linkedForm) base.flags["sw25-ce"].linkedForm = d.linkedForm;
  for (const m of magic) if (!sb.uniqueSkills.some((u) => u.magic?.school === m.school)) gap(`magic ${m.school} has no matching "<School> Magic N" skill`);
  // Casters: the book's specific spell list (d.spells: slugs) if given, else every non-god spell of the school up to
  // the "<School> Magic N" level (fairy skipped: element-dependent). The cast button still also offers the compendium.
  const lib = ctx.list?.("spells") ?? [];
  if (Array.isArray(d.spells) && d.spells.length) for (const sl of d.spells) addRef("spells", typeof sl === "string" ? sl : sl.slug);
  else for (const m of magic) {
    const school = String(m.school ?? "").toLowerCase(); const lv = Number(m.level) || 0;
    if (school === "fairy") { gap(`${d.slug}: fairy spells not auto-granted (element choice)`); continue; }
    for (const sp of lib.filter((x) => x.school === school && Number(x.level) <= lv && !toDoc("spells", x).flags["sw25-ce"].god).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)))
      items.push(embed(_id, toDoc("spells", sp)));
  }
  const isNpc = group === "npcs";
  if (isNpc) { sb.hostile = d.hostile === true; }
  // Monsters: the Lore "Disposition" (e.g. Kobold "Neutral") seeds the Hostile toggle; a test actor can override
  // the token with "hostile": true/false without changing the book Lore text.
  else if (typeof d.hostile === "boolean") sb.neutral = !d.hostile;
  const disp = { FRIENDLY: 1, NEUTRAL: 0, HOSTILE: -1 }[isNpc ? npcToggleDisposition({ hostile: sb.hostile }) : (sb.neutral ? "NEUTRAL" : "HOSTILE")];
  return { ...base, type: isNpc ? "npc" : "monster", items, prototypeToken: token(disp), system: { description: d.description ?? "", monlevel: d.level ?? 1, sb } };
}
/** Build the test-actor source docs (+ folders). Returns { docs, gaps, todos, list }. */
export function buildTestActors(dir, lookup) {
  const docs = []; const gaps = []; const todos = {}; const list = {}; const folders = [];
  for (const [group, [fname, sort]] of Object.entries(TA_FOLDERS)) {
    const fid = idFor("folder:test-actors", group);
    folders.push({ _id: fid, name: fname, type: "Actor", folder: null, sorting: "a", sort: sort * 100000, color: null, description: "", flags: {}, _key: `!folders!${fid}` });
    const gdir = path.join(dir, group); if (!fs.existsSync(gdir)) continue;
    for (const f of fs.readdirSync(gdir).filter((x) => x.endsWith(".json") && !x.startsWith("_")).sort()) {
      const d = JSON.parse(fs.readFileSync(path.join(gdir, f), "utf8"));
      const doc = testActorDoc(group, d, { lookup, list: lookup.list, gaps }); doc.folder = fid; docs.push(doc);
      (list[fname] ??= []).push(`${doc.name} [${doc.type}${doc.system.fellow?.enabled ? ", fellow" : ""}, token ${({ 1: "Friendly", 0: "Neutral", "-1": "Hostile" })[doc.prototypeToken.disposition]}]`);
      if (d.todo) todos[`${group}/${d.slug}`] = d.todo;
    }
  }
  return { docs: [...folders, ...docs], gaps, todos, list };
}

// ---------- Private rules bible (sw25-rules): Markdown from gen/data/rules, never committed ----------
export const RULES_PACK = { name: "sw25-rules", label: "SW2.5 Rules Bible (private)", type: "JournalEntry", system: "sw25-ce" };
const OBSERVER = 2;
/** Split "---\nkey: value\n---\nbody" front matter (flat key: value lines). */
export function frontMatter(text) {
  const m = String(text).replace(/^\uFEFF/, "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: String(text) };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) { const k = line.match(/^([\w-]+)\s*:\s*(.*)$/); if (k) meta[k[1]] = k[2].replace(/^["']|["']$/g, "").trim(); }
  return { meta, body: m[2] };
}
const escH = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Inline Markdown: **bold**, *italic*, `code`, [text](url), [[slug]] / [[slug|label]] -> @UUID links. */
export function mdInline(s, link = () => null) {
  return escH(s)
    .replace(/\[\[([\w\/-]+)(?:\|([^\]]+))?\]\]/g, (all, slug, label) => link(slug, label) ?? `<em>${label ?? slug}</em>`)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
}
/** Small Markdown -> HTML: #-###### headings, paragraphs, -/* and 1. lists, > quotes, | tables |, --- rules. */
export function mdToHtml(md, link) {
  const out = []; const lines = String(md).split(/\r?\n/); let i = 0;
  const inl = (t) => mdInline(t, link);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,6})\s+(.*)$/))) { out.push(`<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
    if (/^\s*[-*]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l)) {
      const ol = /^\s*\d/.test(l); const items = [];
      while (i < lines.length && (ol ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/).test(lines[i])) items.push(lines[i++].replace(/^\s*(?:[-*]|\d+[.)])\s+/, ""));
      out.push(`<${ol ? "ol" : "ul"}>${items.map((t) => `<li>${inl(t)}</li>`).join("")}</${ol ? "ol" : "ul"}>`); continue;
    }
    if (/^\s*>/.test(l)) { const q = []; while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, "")); out.push(`<blockquote>${mdToHtml(q.join("\n"), link)}</blockquote>`); continue; }
    if (/^\s*\|/.test(l)) {
      const rows = []; while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const sep = rows[1] && /^[\s|:-]+$/.test(rows[1]);
      const head = sep ? `<thead><tr>${cells(rows[0]).map((c) => `<th>${inl(c)}</th>`).join("")}</tr></thead>` : "";
      const body = rows.slice(sep ? 2 : 0).map((r) => `<tr>${cells(r).map((c) => `<td>${inl(c)}</td>`).join("")}</tr>`).join("");
      out.push(`<table>${head}<tbody>${body}</tbody></table>`); continue;
    }
    const para = []; while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*[-*]\s|\s*\d+[.)]\s|\s*>|\s*\|)/.test(lines[i])) para.push(lines[i++].trim());
    if (!para.length) { out.push(`<p>${inl(lines[i++].trim())}</p>`); continue; }
    out.push(`<p>${inl(para.join(" "))}</p>`);
  }
  return out.join("\n");
}
const chapterName = (dir) => dir.replace(/^\d+[-_ ]*/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
/**
 * Build the rules-bible docs from <dir>/<chapter>/<NN-entry>.md (+ optional <chapter>/_chapter.md with title:).
 * Slug = file name without the NN- prefix (front matter slug: overrides); [[slug]] links resolve across chapters.
 * Returns { docs, list, broken }.
 */
export function buildRules(dir, { packId = `${RULES_PACK.system}.${RULES_PACK.name}` } = {}) {
  const chapters = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith(".")).map((e) => e.name).sort();
  const folders = []; const entries = []; const broken = [];
  chapters.forEach((ch, ci) => {
    const cdir = path.join(dir, ch);
    const cmeta = fs.existsSync(path.join(cdir, "_chapter.md")) ? frontMatter(fs.readFileSync(path.join(cdir, "_chapter.md"), "utf8")).meta : {};
    const fid = idFor("folder:rules", ch);
    folders.push({ _id: fid, name: cmeta.title || chapterName(ch), type: "JournalEntry", folder: null, sorting: "m", sort: (ci + 1) * 1000, color: null, description: "", flags: { "sw25-ce": { chapter: ch } }, _key: `!folders!${fid}` });
    fs.readdirSync(cdir).filter((f) => f.endsWith(".md") && !f.startsWith("_")).sort().forEach((f, ei) => {
      const { meta, body } = frontMatter(fs.readFileSync(path.join(cdir, f), "utf8"));
      const slug = meta.slug || f.replace(/\.md$/, "").replace(/^\d+[-_]/, "");
      entries.push({ ch, f, slug, meta, body, fid, sort: (ei + 1) * 1000 });
    });
  });
  const bySlug = new Map(); for (const e of entries) { e._id = idFor("rules", e.slug); if (bySlug.has(e.slug)) broken.push(`${e.ch}/${e.f}: duplicate slug ${e.slug}`); bySlug.set(e.slug, e); }
  const docs = entries.map((e) => {
    const title = e.meta.title || chapterName(e.slug);
    const link = (slug, label) => { const t = bySlug.get(slug); if (!t) { broken.push(`${e.ch}/${e.f}: [[${slug}]]`); return null; } return `@UUID[Compendium.${packId}.JournalEntry.${t._id}]{${label ?? (t.meta.title || chapterName(t.slug))}}`; };
    // "## Page: Name" splits an entry into several pages; otherwise one page
    const parts = e.body.split(/^##\s+Page:\s*(.+)$/m);
    const pagesSrc = [{ name: title, md: parts[0] }]; for (let k = 1; k < parts.length; k += 2) pagesSrc.push({ name: parts[k].trim(), md: parts[k + 1] ?? "" });
    const pagesUse = pagesSrc.filter((p, k) => k > 0 || p.md.trim() || pagesSrc.length === 1);
    const src = e.meta.source ? `<p class="sw-rule-source"><em>Source: ${escH(e.meta.source)}${e.meta.page ? `, p. ${escH(e.meta.page)}` : ""}</em></p>\n` : "";
    const pages = pagesUse.map((p, k) => {
      const pid = idFor(`rules-page:${e.slug}`, String(k));
      return { _id: pid, name: p.name, type: "text", title: { show: true, level: 1 }, text: { format: 1, content: (k === 0 ? src : "") + mdToHtml(p.md, link) },
        sort: (k + 1) * 1000, ownership: { default: -1 }, flags: {}, _key: `!journal.pages!${e._id}.${pid}` };
    });
    return { _id: e._id, name: title, folder: e.fid, sort: e.sort, pages, categories: [], ownership: { default: OBSERVER },
      flags: { "sw25-ce": { slug: e.slug, chapter: e.ch, source: e.meta.source ?? null, page: e.meta.page ?? null } }, _key: `!journal!${e._id}` };
  });
  const list = {}; for (const e of entries) (list[e.ch] ??= []).push(e.slug);
  return { docs: [...folders, ...docs], list, broken };
}

async function main() {
  const report = {}; const trees = {}; const gaps = [];
  const all = [];
  const srcRoot = path.join(OUT, "src");
  fs.rmSync(OUT, { recursive: true, force: true });
  for (const [cat, p] of Object.entries(PACKS)) {
    const dir = path.join(DATA, cat);
    if (!fs.existsSync(dir)) continue;
    const out = path.join(srcRoot, p.name); fs.mkdirSync(out, { recursive: true });
    let n = 0;
    const rows = listData(dir);
    if (cat === "items") { const seen = new Set(rows.map((r) => r.slug)); for (const x of inlineItems(listData(path.join(DATA, "classes")))) if (!seen.has(x.slug)) { seen.add(x.slug); rows.push(x); } }
    const entries = [];
    for (const d of rows) {
      if (ONLY && !ONLY.has(d.slug)) continue;
      entries.push({ doc: toDoc(cat, d), d }); n++; all.push({ cat, d });
    }
    const folders = buildFolders(cat, entries);
    for (const f of folders) fs.writeFileSync(path.join(out, `_folder_${f._id}.json`), JSON.stringify(f, null, 2) + "\n");
    for (const { doc, d } of entries) fs.writeFileSync(path.join(out, `${d.slug.replace(/\//g, "__")}_${doc._id}.json`), JSON.stringify(doc, null, 2) + "\n");
    report[p.name] = n; (report.folders ??= {})[p.name] = folders.length; (trees[p.name] = folderTree(folders, entries));
    gaps.push(...entries.filter(({ d }) => cat === "items").flatMap(({ d }) => [!d.rank && `${d.slug}: no rank`, ["accessory", "gear"].includes(d.type) && !d.slot && `${d.slug}: no slot`].filter(Boolean)));
  }
  // private test actors (gen/data/test-actors) -> sw25-test-actors
  const taDir = path.join(DATA, "test-actors"); let ta = null;
  if (fs.existsSync(taDir)) {
    const lib = {}; for (const { cat, d } of all) (lib[cat] ??= new Map()).set(d.slug, d);
    for (const cat of ["classes", "feats"]) { const dd = path.join(DATA, cat); if (fs.existsSync(dd)) for (const d of listData(dd)) (lib[cat] ??= new Map()).has(d.slug) || lib[cat].set(d.slug, d); }
    const lookup = (cat, slug) => lib[cat]?.get(slug); lookup.list = (cat) => [...(lib[cat]?.values() ?? [])];
    ta = buildTestActors(taDir, lookup);
    const out = path.join(srcRoot, TEST_ACTORS.name); fs.mkdirSync(out, { recursive: true });
    for (const doc of ta.docs) fs.writeFileSync(path.join(out, `${doc._id}.json`), JSON.stringify(doc, null, 2) + "\n");
    report[TEST_ACTORS.name] = ta.docs.filter((x) => !x._key.startsWith("!folders")).length;
  }
  // private rules bible (gen/data/rules) -> sw25-rules
  const rulesDir = path.join(DATA, "rules"); let rb = null;
  if (fs.existsSync(rulesDir)) {
    rb = buildRules(rulesDir, { packId: arg("rules-pack-id", `${RULES_PACK.system}.${RULES_PACK.name}`) });
    const out = path.join(srcRoot, RULES_PACK.name); fs.mkdirSync(out, { recursive: true });
    for (const doc of rb.docs) fs.writeFileSync(path.join(out, `${doc._id}.json`), JSON.stringify(doc, null, 2) + "\n");
    report[RULES_PACK.name] = rb.docs.filter((x) => !x._key.startsWith("!folders")).length;
  }
  if (!JSON_ONLY) {
    const { compilePack } = await import("@foundryvtt/foundryvtt-cli");
    for (const p of [...Object.values(PACKS), TEST_ACTORS, RULES_PACK]) {
      const s = path.join(srcRoot, p.name);
      if (!fs.existsSync(s) || !fs.readdirSync(s).length) continue;
      await compilePack(s, path.join(OUT, "packs", p.name), { log: false });
    }
  }
  const check = await checkRefs(all);
  const spellNotes = all.filter((x) => x.cat === "spells").map(({ d }) => { const doc = toDoc("spells", d); const f = doc.flags["sw25-ce"]; return f.warnings ? { slug: d.slug, mp: f.mp.raw, warnings: f.warnings } : null; }).filter(Boolean);
  check.spellWarnings = spellNotes; check.featTodos = all.filter((x) => x.cat === "feats" && x.d.todo).map(({ d }) => ({ slug: d.slug, todo: d.todo }));
  fs.writeFileSync(path.join(OUT, "folders.txt"), Object.entries(trees).map(([k, v]) => `== ${k}\n${v}`).join("\n\n") + "\n");
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ counts: report, itemGaps: gaps, ...(ta ? { testActors: { list: ta.list, gaps: ta.gaps, todos: ta.todos } } : {}), ...(rb ? { rules: { list: rb.list, broken: rb.broken } } : {}), ...check }, null, 2));
  console.log(JSON.stringify({ out: OUT, counts: report, unresolved: check.unresolved, unmappedKeys: check.unmappedKeys, documentedNotApplied: check.documentedNotApplied, spellWarnings: check.spellWarnings, featTodos: check.featTodos, powerTable: PT_CACHE ? "loaded" : "missing", powerTableWarnings: [...powerTableWarnings] }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main().catch((e) => { console.error(e); process.exit(1); });
