/* sw25-ce: Skill Checks section + Initiative button (Foundry glue). Pure logic: module/rules/skill-checks.mjs. */
import * as SK from "../rules/skill-checks.mjs";
import { SKILL_CHECK_CATALOG } from "../data/skill-check-catalog.mjs";
import { classSkillsOf, bestClass } from "../rules/class-pick.mjs";
import { revealWeakness } from "../documents/item.mjs";

const FLAG = "sw25-ce";
const i18n = (k, d) => { try { const has = game.i18n.has?.(k); return has === false ? d ?? k : game.i18n.localize(k); } catch { return d ?? k; } };

function labelsFor() {
  const ab = {}; for (const k of SK.ABILITY_KEYS) ab[k] = i18n(`SW25.Ability.${k[0].toUpperCase()}${k.slice(1)}.abbr`, k);
  const group = {}; for (const g of SK.GROUP_ORDER) group[g] = i18n(`SW25.V2.SkillChecks.Group.${g}`, SK.checkLabel(g));
  const check = {}; for (const c of SKILL_CHECK_CATALOG) { const k = `SW25.V2.SkillChecks.Check.${c.id}`; if (game.i18n.has?.(k)) check[c.id] = game.i18n.localize(k); }
  return { ability: ab, group, check, adv: i18n("SW25.V2.SkillChecks.Adventurer", "Adventurer"), none: i18n("SW25.V2.SkillChecks.None", "— none (2d6)"),
    situational: i18n("SW25.V2.SkillChecks.SitModShort", "Situational ±"), global: i18n("SW25.V2.SkillChecks.AllModShort", "All checks ±") };
}

/** Class items -> [{id,name,level,grants}] (data-driven: classSkills, never class names). */
export function actorClasses(actor) {
  return actor.items.filter((i) => i.type === "skill")
    .map((i) => ({ id: i.id, name: i.name, level: Number(i.system.skilllevel) || 0, grants: SK.grantsOf(classSkillsOf(i)) }))
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
}

function effectMods(actor) {
  const e = actor.system?.effect ?? {};
  return { allck: e.allck, allsc: e.allsc, package: e.package ?? {}, byName: e.checkinputmod ?? {}, mknow: e.mknow };
}

export function skillCheckModel(actor) {
  const saved = actor.flags?.[FLAG]?.skillChecks ?? {};
  const eng = actor.system?._rules;
  return SK.buildSkillChecks({
    catalog: SKILL_CHECK_CATALOG, classes: actorClasses(actor), advLevel: Number(actor.system?.attributes?.advlevel?.value) || 0,
    abilities: actor.system?.abilities ?? {}, saved, globalMod: Number(saved._all?.mod) || 0,
    effects: effectMods(actor), ruleMods: eng?.checkMods ?? [], labels: labelsFor(),
  });
}

/** Initiative from the Initiative check item (its total feeds the combat tracker) plus initiative rule mods. */
export function initiativeModel(actor) {
  const name = game.settings.get(game.system.id, "effectInitPC");
  const item = actor.items.find((i) => i.type === "check" && i.name === name);
  if (!item) return null;
  const s = item.system ?? {};
  let cls = null, lvl = 0;
  const cs = String(s.checkskill ?? "");
  if (cs === "adv") { cls = i18n("SW25.V2.SkillChecks.Adventurer", "Adventurer"); lvl = Number(actor.system?.attributes?.advlevel?.value) || 0; }
  else {
    const it = actor.items.find((i) => i.type === "skill" && i.name === cs) ?? (cs.startsWith("@") ? bestClass(actor.items, cs.slice(1)) : null);
    if (it) { cls = it.name; lvl = Number(it.system.skilllevel) || 0; }
  }
  const abil = SK.ABILITY_KEYS.includes(s.checkabi) ? s.checkabi : null;
  const res = SK.initiativeParts({ base: Number(s.checkbase) || 0, className: cls, classLevel: lvl,
    ability: abil ? labelsFor().ability[abil] : null, abilityMod: abil ? Number(actor.system?.abilities?.[abil]?.mod) || 0 : 0,
    ruleMods: actor.system?._rules?.checkMods ?? [], labels: { other: i18n("SW25.V2.Initiative.Other", "Other modifiers") } });
  return { ...res, itemId: item.id, className: cls, classLevel: lvl, label: item.name };
}

async function postCard(actor, { title, head, parts, roll }) {
  const d = roll.dice?.[0]?.total ?? roll.terms?.[0]?.total;
  const tooltip = await roll.getTooltip();
  const R = foundry.applications.handlebars.renderTemplate;
  const skcHead = await R("systems/sw25-ce/templates/roll/skill-check-head.hbs", {
    title, ...head, parts: parts.map((p) => ({ ...p, valueText: p.value < 0 ? `${p.value}` : `+${p.value}` })) });
  const body = await R("systems/sw25-ce/templates/roll/roll-check.hbs", {
    formula: roll.formula, tooltip, total: roll.total, critical: d === 12 ? 1 : null, fumble: d === 2 ? 1 : null, apply: "-", checktype: "", selfCheck: true });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), flavor: title, rollMode: globalThis.sw25RollMode?.(), rolls: [roll], content: skcHead + body,
    flags: { sw25: { total: roll.total, orgtotal: roll.total, formula: roll.formula, rolls: roll, tooltip, apply: "-", checktype: "", selfCheck: true, skcHead, skillCheck: head.checkId ?? null } },
  });
}

/** Click on a Skill Checks die: roll 2d6 + parts, post the card. Never called automatically. */
export async function rollSkillCheck(actor, id) {
  const row = skillCheckModel(actor).rows.find((r) => r.id === id);
  if (!row) return null;
  const roll = await new Roll(row.formula).evaluate();
  const msg = await postCard(actor, { title: row.label, roll, parts: row.parts, head: {
    checkId: row.id, kind: "skill", className: row.className, classLevel: row.classLevel, grants: row.grants, none: row.selected === SK.NONE,
    adv: row.selected === SK.ADV, limit: row.limit, natural: row.natural, calc: row.calc } });
  if (id === "monster-knowledge") revealWeakness(game.user.targets, roll.total);
  return { roll, msg };
}

/** Initiative button: chat card AND combat tracker (adds the actor's token to the active combat if it is not in it yet). */
export async function rollInitiativeButton(actor) {
  const info = initiativeModel(actor);
  const parts = info?.parts ?? [];
  const roll = await new Roll(info?.formula ?? "2d6").evaluate();
  await postCard(actor, { title: i18n("SW25.V2.Initiative.Title", "Initiative"), roll, parts, head: {
    checkId: "initiative", kind: "initiative", className: info?.className ?? null, classLevel: info?.classLevel ?? 0, grants: !!info?.className, none: !info?.className, calc: info?.calc ?? "2d6" } });
  const combat = game.combat;
  if (!combat) { ui.notifications.info(i18n("SW25.V2.Initiative.NoCombat")); return roll; }
  try {
    let cbt = combat.combatants.find((c) => c.actorId === actor.id && (!actor.isToken || c.tokenId === actor.token?.id));
    if (!cbt) {
      const tok = actor.getActiveTokens(false, true).find((t) => t.parent?.id === (combat.scene?.id ?? canvas?.scene?.id));
      if (!tok) { ui.notifications.info(i18n("SW25.V2.Initiative.NoToken")); return roll; }
      [cbt] = await combat.createEmbeddedDocuments("Combatant", [{ tokenId: tok.id, sceneId: tok.parent.id, actorId: actor.id, hidden: tok.hidden }]);
      ui.notifications.info(i18n("SW25.V2.Initiative.Added"));
    }
    if (cbt) await combat.setInitiative(cbt.id, roll.total);
  } catch (e) { console.warn("sw25 | initiative to tracker", e); ui.notifications.warn(i18n("SW25.V2.Initiative.Failed")); }
  return roll;
}

/** Save a class choice / ± for one check (flags only; no schema change). */
export function saveSkillCheck(actor, id, field, value) {
  const key = id === "_all" ? "_all" : id;
  if (!/^[a-z0-9_][a-z0-9-]*$/i.test(key)) return;
  const v = field === "mod" ? (Number(value) || 0) : String(value);
  return actor.update({ [`flags.${FLAG}.skillChecks.${key}.${field}`]: v });
}

export function bindSkillCheckListeners(sheet, html) {
  const actor = sheet.actor;
  html.on("click", ".skc-roll", (ev) => { ev.preventDefault(); ev.stopPropagation(); rollSkillCheck(actor, ev.currentTarget.dataset.check); });
  html.on("change", ".skc-class", (ev) => { ev.stopPropagation(); saveSkillCheck(actor, ev.currentTarget.dataset.check, "class", ev.currentTarget.value); });
  html.on("change", ".skc-mod", (ev) => { ev.stopPropagation(); saveSkillCheck(actor, ev.currentTarget.dataset.check, "mod", ev.currentTarget.value); });
  html.on("click", ".sw-init", (ev) => { ev.preventDefault(); ev.stopPropagation(); rollInitiativeButton(actor); });
  html.on("click", ".sw-racial-of", (ev) => { ev.preventDefault(); ev.stopPropagation(); sheet._tabs?.[0]?.activate?.("bio"); });
}
