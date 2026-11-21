// ce.25 batch (Echo-approved mockups): rest math, Adventurer Rolls card, check times, stance switch,
// modifier "why" notes, Session Notes data (numbering / duplicate guard / list / export), and template wiring.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { restResult, clampGain } from "../module/rules/rest.mjs";
import * as SK from "../module/rules/skill-checks.mjs";
import { SKILL_CHECK_CATALOG } from "../module/data/skill-check-catalog.mjs";
import { hasAltGrip, gripSwapUpdate, stanceView, gripShort } from "../module/rules/weapon-grip.mjs";
import { weaponCardRow } from "../module/rules/weapon-battle.mjs";
import { whyOf, withWhy, MOD_WHY_KEYS } from "../module/rules/mod-why.mjs";
import { pcEvasion } from "../module/rules/attack-card.mjs";
import * as SL from "../module/rules/session-log.mjs";

const rd = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");

/* ---------- rest ---------- */
test("sleep 3h: HP +ceil(10% max), MP +ceil(50% max)", () => {
  const r = restResult({ hours: 3, ok: true, hp: { value: 10, max: 33 }, mp: { value: 4, max: 25 } });
  assert.equal(r.hp.gain, 4); assert.equal(r.hp.after, 14);      // 3.3 -> 4
  assert.equal(r.mp.gain, 13); assert.equal(r.mp.after, 17);     // 12.5 -> 13
  assert.equal(r.hp.before, 10); assert.equal(r.mp.before, 4);
});
test("sleep 6h: HP +ceil(20% max), MP back to max", () => {
  const r = restResult({ hours: 6, ok: true, hp: { value: 10, max: 33 }, mp: { value: 4, max: 25 } });
  assert.equal(r.hp.gain, 7); assert.equal(r.hp.after, 17);      // 6.6 -> 7
  assert.equal(r.mp.gain, 21); assert.equal(r.mp.after, 25);
});
test("rest never goes above max and never lowers an over-max value", () => {
  const r = restResult({ hours: 3, ok: true, hp: { value: 32, max: 33 }, mp: { value: 30, max: 25 } });
  assert.equal(r.hp.gain, 1); assert.equal(r.hp.after, 33);
  assert.equal(r.mp.gain, 0); assert.equal(r.mp.after, 30);
  assert.equal(clampGain(5, 10, 2.1), 3);
  const exact = restResult({ hours: 3, ok: true, hp: { value: 0, max: 30 }, mp: { value: 0, max: 20 } });
  assert.equal(exact.hp.gain, 3); assert.equal(exact.mp.gain, 10); // exact 10% / 50% are not bumped up
});
test("not fed / sheltered / bedded: no recovery at all", () => {
  const r = restResult({ hours: 6, ok: false, hp: { value: 1, max: 33 }, mp: { value: 0, max: 25 } });
  assert.equal(r.ok, false); assert.equal(r.hp.gain, 0); assert.equal(r.mp.gain, 0); assert.equal(r.hp.after, 1);
});
test("blank HP/MP values count as 0 and unknown hours fall back to 6h", () => {
  const r = restResult({ hours: 7, ok: true, hp: { value: "", max: "20" }, mp: { value: null, max: 10 } });
  assert.equal(r.hours, 6); assert.equal(r.hp.after, 4); assert.equal(r.mp.after, 10);
});

/* ---------- Adventurer Rolls + times ---------- */
test("Adventurer card has exactly Climb, Strength, Jump, Detect, Swim (no Insight)", () => {
  assert.deepEqual(SK.ADVENTURER_CHECKS.map((c) => [c.id, c.ability]), [["climb", "str"], ["strength", "str"], ["jump", "agi"], ["detect", "int"], ["swim", "agi"]]);
  assert.deepEqual(SK.ADVENTURER_CHECKS.find((c) => c.id === "swim").times, ["1min", "1round"]);
  assert.ok(!SK.ADVENTURER_CHECKS.some((c) => c.id === "insight"));
  assert.ok(!SK.EXTRA_CHECKS.some((c) => ["jump", "swim"].includes(c.id)));
  assert.ok(SK.EXTRA_CHECKS.some((c) => c.id === "performance"), "Performance stays where it was");
});
test("Adventurer rows: 2d6 + Adventurer level + ability bonus (+ check modifiers)", () => {
  const rows = SK.buildAdventurerChecks({ advLevel: 5, abilities: { str: { mod: 2 }, agi: { mod: 3 }, int: { mod: 1 } }, saved: { "adv-jump": { mod: -1 } }, globalMod: 1 });
  const v = Object.fromEntries(rows.map((r) => [r.checkId, r.value]));
  assert.deepEqual(v, { climb: 8, strength: 8, jump: 8, detect: 7, swim: 9 });
  assert.equal(rows.find((r) => r.checkId === "swim").times.filter((t) => t.combat).length, 1);
  assert.ok(rows.every((r) => r.id.startsWith(SK.ADV_PREFIX)));
});
test("class checks: time column, flat 2d6 rows greyed, natural marker kept", () => {
  const classes = [{ id: "k", name: "K", level: 3, grants: SK.grantsOf([{ package: "technique", checks: ["set-trap*"] }]) }];
  const m = SK.buildSkillChecks({ catalog: SKILL_CHECK_CATALOG, classes, abilities: { dex: { mod: 2 } } });
  const st = m.rows.find((r) => r.id === "set-trap"); const dg = m.rows.find((r) => r.id === "disguise");
  assert.equal(st.time, "10min"); assert.equal(st.natural, true); assert.equal(st.flat, false);
  assert.equal(dg.flat, true); assert.equal(dg.value, 0); assert.equal(dg.formula, "2d6");
  assert.equal(SK.checkTime("investigation"), "1hour"); assert.equal(SK.checkTime("spot-trap"), "instant"); assert.equal(SK.checkTime("nope"), "");
  for (const c of SKILL_CHECK_CATALOG) if (c.id !== "initiative" && c.id !== "engineering") assert.ok(SK.checkTime(c.id), `time for ${c.id}`);
  const lang = JSON.parse(rd("lang/en.json"));
  for (const code of new Set(Object.values(SK.CHECK_TIMES))) assert.ok(lang.SW25.V2.SkillChecks.Time[code], code);
});
test("skill-check template: Adventurer card on top, time column, tree marker with tooltip key", () => {
  const t = rd("templates/actor/parts/actor-skillchecks.hbs");
  assert.ok(t.indexOf("skc-adv") < t.indexOf("SkillChecks.Title"));
  assert.match(t, /skc-time/); assert.match(t, /i-natural/); assert.match(t, /SkillChecks\.NaturalOnly/); assert.match(t, /r\.flat/);
  assert.equal(JSON.parse(rd("lang/en.json")).SW25.V2.SkillChecks.NaturalOnly, "Ranger: natural environments only");
});

/* ---------- stance ---------- */
test("1H/2H switch only for weapons with a second grip; swap exchanges the grip stats", () => {
  const sys = { usage: "1HB", hit: 0, dmod: 0, power: 17, cvalue: 10, reqstr: 17, altgrip: { usage: "2H", hit: 1, dmod: 2, power: "27", cvalue: 9, reqstr: 17 } };
  assert.ok(hasAltGrip(sys)); assert.ok(!hasAltGrip({ usage: "1H", altgrip: { usage: "", power: "" } })); assert.ok(!hasAltGrip({ usage: "2H" }));
  const up = gripSwapUpdate(sys, "2H");
  assert.equal(up["system.usage"], "2H"); assert.equal(up["system.power"], 27); assert.equal(up["system.cvalue"], 9); assert.equal(up["system.hit"], 1);
  assert.equal(up["system.altgrip.usage"], "1HB"); assert.equal(up["system.altgrip.power"], 17);
  assert.equal(gripSwapUpdate(sys, "1HB"), null, "already active");
  assert.equal(gripShort("S2H"), "2H"); assert.equal(gripShort("1H#"), "1H");
  const v = stanceView(sys); assert.deepEqual(v.options.map((o) => [o.short, o.active, o.icon]), [["1H", true, "stance-1h"], ["2H", false, "stance-2h"]]);
  assert.equal(weaponCardRow({ id: "w", name: "W", system: { usage: "1H" } }, {}).stance, null);
  assert.ok(weaponCardRow({ id: "w", name: "W", system: sys }, {}).stance);
  const tpl = rd("templates/actor/parts/actor-battleweapons.hbs");
  assert.match(tpl, /sw-stance-opt/);
  assert.match(rd("module/sheets/actor-sheet.mjs"), /gripSwapUpdate\(it\._source\?\.system/);
  assert.ok(JSON.parse(rd("template.json")).Item.weapon.altgrip, "altgrip defaults in template.json");
});

/* ---------- why ---------- */
test("modifier why notes: stored in flags, shown in card labels", () => {
  const flags = { "sw25-ce": { modWhy: { hitmod: " Targeting feat ", dmod: "" } } };
  assert.equal(whyOf(flags, "hitmod"), "Targeting feat"); assert.equal(whyOf(flags, "dmod"), ""); assert.equal(whyOf(undefined, "x"), "");
  assert.equal(withWhy("Accuracy modifier", "Targeting feat"), "Accuracy modifier (Targeting feat)");
  assert.equal(withWhy("Accuracy modifier", ""), "Accuracy modifier");
  const ev = pcEvasion({ dodgebase: 3, attributes: { dodgemod: 1 } }, { dodgemod: "Winged boots" });
  assert.ok(ev.parts.some((p) => p.label === "Evasion modifier (Winged boots)"));
  const sheet = rd("templates/actor/actor-character-sheet.hbs");
  for (const k of MOD_WHY_KEYS) assert.ok(sheet.includes(`name="flags.sw25-ce.modWhy.${k}"`), k);
  assert.match(rd("module/documents/item.mjs"), /withWhy\("Accuracy modifier", whyOf\(whyFlags, "hitmod"\)\)/);
});

/* ---------- sessions ---------- */
const mk = (n, extra = {}) => ({ id: `s${n}`, number: n, date: `2026-01-${String(n).padStart(2, "0")}`, title: `T${n}`, arc: "", notes: "", loot: "", created: n, ...extra });
test("session numbers: max + 1, duplicates detected, active = latest unless pinned", () => {
  const log = SL.normalizeLog({ sessions: { a: mk(1), b: mk(4), c: mk(2) } });
  assert.deepEqual(log.sessions.map((s) => s.number), [4, 2, 1]);
  assert.equal(SL.nextSessionNumber(log.sessions), 5);
  assert.equal(SL.nextSessionNumber([]), 1);
  assert.deepEqual(SL.duplicateNumbers([mk(1), mk(2), { ...mk(2), id: "x" }]), [2]);
  assert.equal(SL.activeSession(log).number, 4);
  assert.equal(SL.activeSession({ ...log, pinned: "s2" }).number, 2);
  assert.equal(SL.activeSession({ ...log, pinned: "gone" }).number, 4);
  const s = SL.makeSession(log.sessions, { id: "n", title: "New", now: Date.UTC(2026, 10, 20, 12) });
  assert.equal(s.number, 5); assert.match(s.date, /^2026-11-2\d$/);
});
test("new-session guard: in-flight lock per actor and a uniqueness re-check after create", () => {
  const ui = rd("module/sheets/session-ui.mjs");
  assert.match(ui, /if \(CREATING\.has\(actor\.id\)\) return null;/);
  assert.match(ui, /finally \{ CREATING\.delete\(actor\.id\); \}/);
  assert.match(ui, /duplicateNumbers\(getLog\(actor\)\.sessions\)/);
  assert.match(ui, /const fresh = getLog\(actor\)/);
  assert.ok(!/JournalEntry\.create|Folder\.create/.test(ui.slice(0, ui.indexOf("export async function exportJournal"))), "no journal/folder writes outside the export");
});
test("missing / old data defaults sanely", () => {
  const log = SL.normalizeLog(undefined);
  assert.deepEqual(log, { sessions: [], todos: [], misc: "", pinned: "", hideDone: false });
  assert.equal(SL.normalizeLog({ sessions: { x: null, y: { number: "3" } } }).sessions[0].number, 3);
});
test("list view: newest first, 20 per page, grouped by arc, collapsible, search across text", () => {
  const sessions = {}; for (let i = 1; i <= 45; i++) sessions[`s${i}`] = mk(i, { arc: i <= 20 ? "Barovia" : "Vallaki", notes: i === 7 ? "<p>Met Farmer <b>Joe</b></p>" : "" });
  const log = SL.normalizeLog({ sessions });
  const p1 = SL.listView(log, {});
  assert.equal(p1.pages, 3); assert.equal(p1.groups.reduce((t, g) => t + g.rows.length, 0), 20);
  assert.equal(p1.groups[0].rows[0].number, 45); assert.ok(p1.groups[0].rows[0].active);
  const p2 = SL.listView(log, { page: 2 });
  assert.deepEqual(p2.groups.map((g) => g.arc), ["Vallaki", "Barovia"]);
  assert.equal(p2.groups[1].total, 20);
  const coll = SL.listView(log, { page: 2, collapsed: ["Barovia"] });
  assert.equal(coll.groups[1].collapsed, true);
  const q = SL.listView(log, { query: "farmer joe" });
  assert.equal(q.matches, 1); assert.equal(q.groups[0].rows[0].number, 7);
  assert.equal(SL.listView(log, { page: 99 }).page, 3);
});
test("to-do view hides completed on request", () => {
  const log = SL.normalizeLog({ todos: { a: { text: "A", created: 1 }, b: { text: "B", done: true, doneIn: 4, created: 2 } }, hideDone: true });
  const v = SL.todoView(log); assert.equal(v.rows.length, 1); assert.equal(v.hidden, 1); assert.equal(v.doneCount, 1);
});
test("pasted base64 images are stripped; links and file paths stay", () => {
  const html = `<p>a<img src="data:image/png;base64,AAAA" alt="x">b</p><p><img src="worlds/w/map.webp"></p><a href="https://x.y/i.png">link</a><img src='data:image/gif;base64,BBB'>`;
  const out = SL.stripDataImages(html);
  assert.ok(!/data:/.test(out)); assert.match(out, /worlds\/w\/map\.webp/); assert.match(out, /https:\/\/x\.y\/i\.png/);
});
test("misc notes append to a session as paragraphs (text is escaped)", () => {
  assert.equal(SL.appendNotes("<p>old</p>", "Next level: <Power Strike>\n\nAsk GM"), "<p>old</p><p>Next level: &lt;Power Strike&gt;</p><p>Ask GM</p>");
  assert.equal(SL.appendNotes("<p>old</p>", "   "), "<p>old</p>");
});
test("txt export: headers, plain text, [x]/[ ] to-dos, misc", () => {
  const sessions = [mk(4, { title: "The Farmer Joe incident", campaign: "Lost Mines", arc: "Phandalin Road", notes: "<ul><li>On road</li><li>Encounter &amp; chase</li></ul>", loot: "<p>1 rusty pitchfork</p>" })];
  const todos = [{ text: "Buy a better sword", done: false }, { text: "Find the missing wagon", done: true, doneIn: 4 }];
  const txt = SL.exportText({ actorName: "Murderin Rob", sessions, todos, misc: "Ask GM about shards" });
  assert.match(txt, /^Session Notes: Murderin Rob\n=+\n/);
  assert.match(txt, /Session 4 · 2026-01-04 · The Farmer Joe incident\n-+\nCampaign: Lost Mines\nArc: Phandalin Road/);
  assert.match(txt, /Notes:\n- On road\n- Encounter & chase/);
  assert.match(txt, /Loot found:\n1 rusty pitchfork/);
  assert.match(txt, /\[ \] Buy a better sword\n\[x\] Find the missing wagon \(done in session 4\)/);
  assert.match(txt, /Misc notes\n-+\nAsk GM about shards\n$/);
  assert.ok(!/<[a-z]/i.test(txt));
  assert.equal(SL.exportFileName("Murderin Rob"), "Murderin-Rob-sessions.txt");
  assert.deepEqual(SL.sessionsFor({ sessions: [mk(2, { arc: "A" }), mk(1, { arc: "A" }), mk(3)] }, { kind: "arc", arc: "A" }).map((s) => s.number), [1, 2]);
});
test("journal export is a one-off copy and warns without permission", () => {
  const ui = rd("module/sheets/session-ui.mjs");
  assert.match(ui, /game\.user\?\.can\?\.\("JOURNAL_CREATE"\)/);
  assert.match(ui, /saveDataToFile/);
  assert.match(SL.sessionPageHtml(mk(1, { notes: `<img src="data:image/png;base64,AA">ok` })), /ok/);
  assert.ok(!/data:/.test(SL.sessionPageHtml(mk(1, { notes: `<img src="data:image/png;base64,AA">` }))));
});

/* ---------- sheet wiring ---------- */
test("sheet: Soulscars on impurity, sleep buttons, Session Notes tab, Background, merged feats", () => {
  const sheet = rd("templates/actor/actor-character-sheet.hbs");
  const head = sheet.slice(0, sheet.indexOf("</header>"));
  assert.match(head, /sw-soulscars/); assert.match(head, /system\.attributes\.impurity/); assert.match(head, /data-hours="3"/); assert.match(head, /data-hours="6"/);
  assert.match(sheet, /data-tab="sessions"/); assert.match(sheet, /actor-sessions\.hbs/);
  assert.match(sheet, /editor system\.background target="system\.background"/);
  assert.equal((sheet.match(/actor-ce7-feats\.hbs/g) ?? []).length, 1, "only one Feats panel");
  assert.ok(!/actor-noncombatfeats\.hbs/.test(sheet), "non-combat feats live inside the merged panel");
  assert.equal(JSON.parse(rd("template.json")).Actor.character.background, "");
  const pre = rd("module/helpers/templates.mjs");
  for (const p of ["actor-feats-quick.hbs", "actor-sessions.hbs"]) assert.ok(pre.includes(`templates/actor/parts/${p}`), p);
  const sess = rd("templates/actor/parts/actor-sessions.hbs");
  assert.ok(!/\bname="/.test(sess), "session inputs never go through the sheet form");
  const ui = rd("module/sheets/rest-ui.mjs");
  assert.match(ui, /DialogV2\.confirm/); assert.match(ui, /"system\.hp\.value": res\.hp\.after/);
});
test("icon slots: one file per icon, referenced from one CSS block", () => {
  const css = rd("css/sw25-sheet-v2.css");
  for (const f of ["soulscars", "sleep-3h", "sleep-6h", "stance-1h", "stance-2h", "ranger-natural"]) {
    assert.ok(fs.existsSync(new URL(`../assets/icons/${f}.svg`, import.meta.url)), f);
    assert.equal((css.match(new RegExp(`assets/icons/${f}\\.svg`, "g")) ?? []).length, 1, f);
  }
});
test("new ce.25 logic never hardcodes class names", () => {
  const classes = /\b(Fighter|Grappler|Fencer|Shooter|Sorcerer|Conjurer|Priest|Scout|Ranger|Sage|Enhancer|Bard|Rider|Alchemist)\b/;
  for (const f of ["module/rules/rest.mjs", "module/rules/session-log.mjs", "module/rules/weapon-grip.mjs", "module/rules/mod-why.mjs", "module/sheets/rest-ui.mjs", "module/sheets/session-ui.mjs", "templates/actor/parts/actor-sessions.hbs", "templates/actor/parts/actor-feats-quick.hbs"])
    assert.ok(!classes.test(rd(f)), f);
});
