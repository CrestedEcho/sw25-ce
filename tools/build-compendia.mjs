#!/usr/bin/env node
/**
 * Build per-category compendium packs from Writer data (/workspace/sw25/gen/data/<category>/*.json).
 * Output goes to a TEMP dir (default /tmp/sw25-compendia-build/packs/<pack>); never into the live packs/.
 * Usage: node tools/build-compendia.mjs [--data DIR] [--out DIR] [--only fighter,fencer,priest] [--json-only]
 * Deterministic _id from category+slug; flags.sw25-ce.slug is what grant refs resolve against.
 * The Writer JSON is kept verbatim in flags.sw25-ce.data for later richer mapping.
 */
import { statBlockFromData, dispositionFor } from "../module/rules/statblock.mjs";
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
      return { ...base, type: "spell", img: "icons/svg/daze.svg", system: { ...sys, mpcost: mp.base ?? mp.raw, mpcostText: mp.raw, element: d.element ?? "", ...(d.mpRule ? { mpRule: d.mpRule } : {}), ...(d.power ? { power: d.power, powerCrit: d.powerCrit ?? null } : {}), ...(d.powerByDeityRank ? { powerByDeityRank: d.powerByDeityRank } : {}), ...(d.weapon ? { weapon: d.weapon } : {}), target: d.target ?? "", time: d.duration ?? "", resist: d.resistance ?? "" } };
    }
    case "items": return { ...base, type: d.type === "weapon" ? "weapon" : d.type === "armor" ? "armor" : d.type === "accessory" ? "accessory" : "item", img: "icons/svg/item-bag.svg", system: { ...sys, category: d.category ?? "", reqstr: d.minStr ?? null, price: d.price ?? null } };
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
      if (/@counter:/.test(String(r.value ?? ""))) (unapplied["@counter:<name>"] ??= []).push(d.slug);
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
  if (!JSON_ONLY) {
    const { compilePack } = await import("@foundryvtt/foundryvtt-cli");
    for (const p of Object.values(PACKS)) {
      const s = path.join(srcRoot, p.name);
      if (!fs.existsSync(s) || !fs.readdirSync(s).length) continue;
      await compilePack(s, path.join(OUT, "packs", p.name), { log: false });
    }
  }
  const check = await checkRefs(all);
  const spellNotes = all.filter((x) => x.cat === "spells").map(({ d }) => { const doc = toDoc("spells", d); const f = doc.flags["sw25-ce"]; return f.warnings ? { slug: d.slug, mp: f.mp.raw, warnings: f.warnings } : null; }).filter(Boolean);
  check.spellWarnings = spellNotes; check.featTodos = all.filter((x) => x.cat === "feats" && x.d.todo).map(({ d }) => ({ slug: d.slug, todo: d.todo }));
  fs.writeFileSync(path.join(OUT, "folders.txt"), Object.entries(trees).map(([k, v]) => `== ${k}\n${v}`).join("\n\n") + "\n");
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ counts: report, itemGaps: gaps, ...check }, null, 2));
  console.log(JSON.stringify({ out: OUT, counts: report, unresolved: check.unresolved, unmappedKeys: check.unmappedKeys, documentedNotApplied: check.documentedNotApplied, spellWarnings: check.spellWarnings, featTodos: check.featTodos }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main().catch((e) => { console.error(e); process.exit(1); });
