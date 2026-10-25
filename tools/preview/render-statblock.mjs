// Dev-only static preview of the stat-block sheet: node tools/preview/render-statblock.mjs <outdir>
// Needs `handlebars` resolvable (NODE_PATH). Renders kobold / captain / captain-hostile HTML for a headless browser.
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
import { prepareStatBlock } from "../../module/rules/statblock.mjs";
import { buildStatBlockContext } from "../../module/rules/statblock-sheet-data.mjs";
const require = createRequire(import.meta.url); const Handlebars = require("handlebars");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../.."); const out = process.argv[2] ?? "/tmp/sb-preview";
fs.mkdirSync(out, { recursive: true });
const fix = (s) => s.replaceAll("systems/sw25-ce/", `file://${root}/`).replaceAll("../assets/", `file://${root}/assets/`);
const T = (p) => fix(fs.readFileSync(path.join(root, "templates/actor", p), "utf8"));
for (const p of ["sb-num", "sb-pair", "sb-combat"]) Handlebars.registerPartial(`file://${root}/templates/actor/sb/${p}.hbs`, T(`sb/${p}.hbs`));
Handlebars.registerHelper("checked", (v) => (v ? "checked" : ""));
Handlebars.registerHelper("selectOptions", (o, { hash }) => new Handlebars.SafeString(Object.entries(o).map(([k, v]) => `<option value="${k}" ${k === hash.selected ? "selected" : ""}>${v}</option>`).join("")));
Handlebars.registerHelper("editor", (h) => new Handlebars.SafeString(`<div class="editor">${h ?? ""}</div>`));
const sheet = Handlebars.compile(T("actor-statblock-sheet.hbs")); const css = fix(fs.readFileSync(path.join(root, "css/sw25-statblock.css"), "utf8"));
const kobold = { level: 1, monsterType: "Barbarous", source: "CR I p395", intelligence: "Low", perception: "Five senses", disposition: "Neutral", soulscars: 1,
  languages: ["Trade Common", "Barbaric", "Youma"], habitat: ["Forests", "Mountains", "Caves"], reputation: 6, weakness: 11, weakPoint: "Magic Damage +2 points",
  initiative: 10, movement: { ground: 12 }, fortitude: { value: 2 }, willpower: { value: 3 },
  parts: [{ name: "Weapon", accuracy: { value: 2 }, damage: "2d+1", evasion: { value: 1 }, defense: 1, hp: 13, mp: 10, isCore: true }],
  loot: [{ roll: "Always", item: "Crude Weapon", price: 10, materialCard: "Black White B" }, { roll: "2-9", item: "Nothing" }, { roll: "10+", item: "Bag of Silver x 1d", price: 30 }],
  description: "<p>Small dog-headed barbarous, often kept as servants by stronger kin.</p>", overrides: { willpower: { value: { value: 3, locked: true } } } };
const captain = { title: "Guard Captain", settlement: "Harvesgard", faction: "Harvesgard City Watch", race: "Human", attitude: "neutral", source: "Example only",
  classLevels: [{ classSlug: "fighter", level: 5 }, { classSlug: "ranger", level: 2 }], languages: ["Trade Common", "Regional (Harvesgard)"],
  relationships: [{ name: "Lord of Harvesgard", relation: "sworn to" }], services: [{ name: "Gate pass", price: 50, notes: "if attitude friendly" }],
  notes: "<p>Stern but fair.</p>", secrets: "Takes bribes from the smugglers' guild.", intelligence: "Average", perception: "Five senses",
  level: 6, reputation: 12, weakness: 16, weakPoint: "Accuracy +1", initiative: 14, movement: { ground: 13 }, fortitude: { value: 7 }, willpower: { value: 6 },
  parts: [{ name: "Longsword", accuracy: { value: 8 }, damage: "2d+8", evasion: { value: 7 }, defense: 6, hp: 42, mp: 12, isCore: true }],
  uniqueSkills: [{ name: "Power Strike", tags: ["declared"], description: "+damage, −evasion this round." }, { name: "Shield Training", tags: ["passive"], description: "Defense already included." }],
  loot: [{ roll: "Always", item: "Captain's Badge", price: 100 }, { roll: "2-7", item: "Purse (50G)", price: 50 }, { roll: "8+", item: "Fine Longsword", price: 440 }],
  overrides: { parts: { 0: { defense: { value: 7, locked: true } } } } };
const portrait = `file://${root}/assets/portrait.png`;
for (const [file, name, type, raw, tab] of [["monster_kobold", "Kobold", "monster", kobold, null], ["npc_captain", "Captain Marla Voss", "npc", captain, null], ["npc_captain_hostile", "Captain Marla Voss", "npc", { ...captain, hostile: true }, null]]) {
  const view = prepareStatBlock(raw, {}, type);
  const ctx = { ...buildStatBlockContext({ type, view, raw, isGM: true, img: portrait }), actor: { name }, cssClass: "sw25 sheet actor", editable: true, owner: true,
    attitudes: { "": "—", friendly: "Friendly", neutral: "Neutral", hostile: "Hostile" }, items: [], notesHTML: raw.notes, secretsHTML: raw.secrets, descriptionHTML: raw.description };
  const first = tab ?? ctx.initialTab;
  let html = sheet(ctx).replace(`data-tab="${first}">`, `data-tab="${first}" class="item active">`).replace(/<a class="item" data-tab="([a-z]+)" class="item active">/, '<a class="item active" data-tab="$1">');
  html = fix(html);
  html = `<html><head><meta charset="utf-8"><style>${css}
body{margin:0;width:760px;height:900px} .sw25-sb.window-content{height:884px} .sb-body .tab{display:none} .sb-body .tab[data-tab="${first}"]{display:block}
.fas{font-style:normal}.fa-plus:before{content:"+"}.fa-times:before{content:"×"}.fa-edit:before{content:"✎"}.fa-trash:before{content:"🗑"}.fa-feather:before{content:"✒"}</style></head>
<body><div class="sw25-sb window-content">${html}</div></body></html>`;
  fs.writeFileSync(path.join(out, `${file}.html`), html);
}
console.log(`wrote previews to ${out}`);
