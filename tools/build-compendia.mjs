#!/usr/bin/env node
/**
 * Build per-category compendium packs from Writer data (/workspace/sw25/gen/data/<category>/*.json).
 * Output goes to a TEMP dir (default /tmp/sw25-compendia-build/packs/<pack>); never into the live packs/.
 * Usage: node tools/build-compendia.mjs [--data DIR] [--out DIR] [--only fighter,fencer,priest] [--json-only]
 * Deterministic _id from category+slug; flags.sw25-ce.slug is what grant refs resolve against.
 * The Writer JSON is kept verbatim in flags.sw25-ce.data for later richer mapping.
 */
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
};
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
const desc = (d) => [d.summary, d.description].filter((x) => x && x !== "null").map((t) => `<p>${String(t).replace(/</g, "&lt;")}</p>`).join("");

export function toDoc(cat, d) {
  const _id = idFor(cat, d.slug);
  const base = { _id, name: d.name, flags: { "sw25-ce": { slug: d.slug, data: d } }, _key: `!${PACKS[cat].type === "Actor" ? "actors" : "items"}!${_id}` };
  const sys = { description: desc(d), rules: d.rules ?? [] };
  switch (cat) {
    case "classes": return { ...base, type: "skill", img: "icons/svg/book.svg", system: { ...sys, skilltype: skillTypeOf(d), exptable: d.exptable ?? "", skilllevel: 1, autoFeats: d.autoFeats ?? [] } };
    case "feats": return { ...base, type: "combatability", img: "icons/svg/sword.svg", system: { ...sys, use: d.use ?? "", autoFeats: d.autoFeats ?? [] } };
    case "spells": return { ...base, type: "spell", img: "icons/svg/daze.svg", system: { ...sys, mpcost: d.mpCost ?? "", target: d.target ?? "", time: d.duration ?? "", resist: d.resistance ?? "" } };
    case "items": return { ...base, type: d.type === "weapon" ? "weapon" : d.type === "armor" ? "armor" : d.type === "accessory" ? "accessory" : "item", img: "icons/svg/item-bag.svg", system: { ...sys, category: d.category ?? "", reqstr: d.minStr ?? null, price: d.price ?? null } };
    case "monsters": {
      const { rules, ...msys } = sys;
      return { ...base, type: "monster", img: "icons/svg/mystery-man.svg", system: { ...msys, monlevel: d.level }, items: [], effects: [] };
    }
  }
}

async function main() {
  const report = {};
  const srcRoot = path.join(OUT, "src");
  fs.rmSync(OUT, { recursive: true, force: true });
  for (const [cat, p] of Object.entries(PACKS)) {
    const dir = path.join(DATA, cat);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
    const out = path.join(srcRoot, p.name); fs.mkdirSync(out, { recursive: true });
    let n = 0;
    for (const f of files) {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      if (!d.slug || (ONLY && !ONLY.has(d.slug))) continue;
      const doc = toDoc(cat, d);
      fs.writeFileSync(path.join(out, `${d.slug}_${doc._id}.json`), JSON.stringify(doc, null, 2) + "\n");
      n++;
    }
    report[p.name] = n;
  }
  if (!JSON_ONLY) {
    const { compilePack } = await import("@foundryvtt/foundryvtt-cli");
    for (const p of Object.values(PACKS)) {
      const s = path.join(srcRoot, p.name);
      if (!fs.existsSync(s) || !fs.readdirSync(s).length) continue;
      await compilePack(s, path.join(OUT, "packs", p.name), { log: false });
    }
  }
  console.log(JSON.stringify({ out: OUT, counts: report }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main().catch((e) => { console.error(e); process.exit(1); });
