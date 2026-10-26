// Dev-only static preview of the power/damage chat card: node tools/preview/render-damage-card.mjs <out.html>
// Needs `handlebars` resolvable (NODE_PATH). Example data: Power 17, dice 6+3 -> table 6, +4 bonus, total 10.
import fs from "node:fs"; import { targetChipsHtml } from "../../module/helpers/target-chips.mjs"; import path from "node:path"; import { createRequire } from "node:module";
const H = createRequire(import.meta.url)("handlebars");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const en = JSON.parse(fs.readFileSync(path.join(root, "lang/en.json"), "utf8"));
const get = (k) => k.split(".").reduce((o, p) => o?.[p], en);
const L = (k, h = {}) => { let s = get(k) ?? k; for (const [a, b] of Object.entries(h)) s = s.replaceAll(`{${a}}`, b); return s; };
H.registerHelper("localize", (k, o) => L(k, o?.hash));
H.registerHelper("concat", (...a) => a.slice(0, -1).join(""));
H.registerHelper("eq", (a, b) => a === b); H.registerHelper("or", (...a) => a.slice(0, -1).some(Boolean));
H.registerHelper("sw25dmgf", () => "17 / 10 / +4");
const art = process.env.SW25_PREVIEW_ART ?? path.resolve(root, "../gen/art/masters/monsters");
const tok = (name, f) => ({ name, img: fs.existsSync(`${art}/${f}.png`) ? `file://${art}/${f}.png` : "" });
const fix = (s) => s.replaceAll("/systems/sw25-ce/", `file://${root}/`);
const tooltip = `<div class="dice-tooltip"><section class="tooltip-part"><div class="dice"><ol class="dice-rolls"><li class="roll die d6">6</li><li class="roll die d6">3</li><li style="margin-left:8px;font-weight:bold">= 9</li></ol></div></section></div>`;
const card = fix(H.compile(fs.readFileSync(path.join(root, "templates/roll/roll-power.hbs"), "utf8"))({
  formula: "k17@10+4", tooltip, power: 17, result: [6], results: 6, mod: 4, total: 10, showhalf: true, apply: "on", targetName: targetChipsHtml([tok("Kobold", "kobold")]) }));
const picker = (t) => fix(H.compile(fs.readFileSync(path.join(root, "templates/roll/roll-power.hbs"), "utf8"))({ tooltip, power: 17, result: [6], results: 6, mod: 4, total: 10, apply: "on", targetName: t })).split('<div class="dice-roll"')[0];
const states = `<div class="tips"><h3>Target picker states</h3><p>No target:</p><div class="chat">${picker("")}</div><p>Several targets:</p><div class="chat">${picker(targetChipsHtml([tok("Kobold", "kobold"), tok("Goblin", "../../_src/actors/monsters/goblin"), tok("Kobold Archer", "kobold")]))}</div></div>`;
const apply = `<div class="sw-attack-extras" style="border-top:1px dashed #999;margin-top:4px;padding-top:2px"><button type="button" class="sw-attack-apply">${L("SW25.Card.ApplyDamage", { n: 10 })}</button></div>`;
const tips = ["pd", "md", "cd", "hr", "mr"].map((t) => `<li><b>${L(`SW25.Card.${t}`)}</b> — ${L(`SW25.Card.${t}Tip`)}</li>`).join("")
  + `<li><b>${L("SW25.Card.Half")}</b> — ${L("SW25.Card.HalfTip")}</li><li><b>${L("SW25.Card.ApplyDamage", { n: 10 })}</b> — ${L("SW25.Card.ApplyDamageTip")}</li>`;
const html = `<html><head><link rel="stylesheet" href="file://${root}/css/sw25.css"><style>
body{background:#d9cfb8;font-family:"Signika",sans-serif;display:flex;gap:24px;padding:16px;margin:0}
.chat{width:300px;background:#f3ead8;border:1px solid #7a6a53;border-radius:4px;padding:8px}
.chat button{background:#e9e0cc;border:1px solid #9a8a70;cursor:pointer}.die{display:inline-flex;width:26px;height:26px;align-items:center;justify-content:center;border:1px solid #444;border-radius:4px;font-weight:bold;background:#fff}
.d20{clip-path:polygon(25% 5%,75% 5%,100% 50%,75% 95%,25% 95%,0 50%);background:#444;color:#fff;border:0}
.dice-total{display:flex;align-items:center;justify-content:center;font-weight:bold;margin:6px 0}.diceresult-apply{display:flex;align-items:center;gap:6px}
.sw25-dmghead .ico{-webkit-mask:var(--i) center/contain no-repeat}.tips{width:380px;font-size:13px}.chat-target{background:#e9e0cc;border:1px solid #9a8a70}
</style></head><body><div class="chat"><div style="font-weight:bold;border-bottom:1px solid #9a8a70;margin-bottom:4px">Human Warrior — Bastard Sword damage</div>${card}${apply}</div>
<div class="tips"><h3>Hover tooltips</h3><ul>${tips}<li><b>Target:</b> — ${L("SW25.Card.TargetTip")}</li></ul><p style="opacity:.7">Example data: Power 17, dice 6+3=9 → table 6, +4 bonus, total 10.</p>${states}</div></body></html>`;
fs.writeFileSync(process.argv[2] ?? "/tmp/damage-card.html", html);
