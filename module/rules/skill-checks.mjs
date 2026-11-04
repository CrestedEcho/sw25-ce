/* sw25-ce Skill Checks (Classes tab). PURE: no Foundry globals, so it is unit-tested.
 * Driven by data only (never by class names): which checks a class grants comes from its classSkills
 * (see class-pick.mjs classSkillsOf). The row list is the shipped catalog (module/data/skill-check-catalog.mjs)
 * plus any extra check found on the actor's own class items, so homebrew classes add their own rows.
 * The player may roll any check with ANY of their classes (or Adventurer level, or none): rows turn green
 * only when the chosen class's data grants that check, and the chat card always names the class used. */

export const PACKAGE_ABILITY = { technique: "dex", movement: "agi", observation: "int", knowledge: "int" };
/** Package -> existing ActiveEffect key system.effect.package.<x> (SW25.checkpackages). */
export const PACKAGE_EFFECT = { technique: "fine", movement: "move", observation: "obse", knowledge: "know" };
export const GROUP_ORDER = ["technique", "movement", "observation", "knowledge", "other"];
export const ABILITY_KEYS = ["dex", "agi", "str", "vit", "int", "mnd"];
/** Checks with a fixed ability that are not in a class package (or whose package has no ability). */
export const EXTRA_CHECKS = [
  { id: "jump", group: "other", ability: "agi" },
  { id: "swim", group: "other", ability: "agi" },
  { id: "performance", group: "other", ability: "mnd" },
];
/** Packages that are not a list of checks (Heritor's multi-section checks are skipped; Initiative has its own button). */
export const SKIP_PACKAGES = ["multi-section-checks"];
export const EXCLUDE_CHECKS = ["initiative"];
export const NONE = "none";
export const ADV = "adv";

/** "disable-device*" -> {id:"disable-device", natural:true}; "monster-knowledge(identify only)" -> {id, limit:"identify only"}. */
export function parseCheckId(raw) {
  let s = String(raw ?? "").trim(), limit = null, natural = false;
  const m = s.match(/^(.*?)\s*\((.+)\)$/); if (m) { s = m[1].trim(); limit = m[2].trim(); }
  if (s.endsWith("*")) { s = s.slice(0, -1).trim(); natural = true; }
  return { id: s.toLowerCase().replace(/\s+/g, "-"), limit, natural };
}
/** "danger-sense" -> "Danger Sense" (fallback label when no translation exists). */
export const checkLabel = (id) => String(id).split("-").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const fmt = (n) => (n < 0 ? `- ${-n}` : `+ ${n}`);
const signed = (n) => (n < 0 ? `${n}` : `+${n}`);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** One class's classSkills -> [{id, package, limit, natural}] (checks it grants). */
export function grantsOf(classSkills, { skip = SKIP_PACKAGES } = {}) {
  const out = [];
  for (const e of Array.isArray(classSkills) ? classSkills : []) {
    if (!e || typeof e !== "object" || e.check) continue; // {check:"accuracy"} entries are combat checks
    if (!e.package || skip.includes(e.package)) continue;
    if (Array.isArray(e.checks)) for (const raw of e.checks) out.push({ ...parseCheckId(raw), package: e.package });
    else {
      // {package:"insight"} with no list means the package IS one check; an array limit (e.g. ["daemon"]) is a note
      const p = parseCheckId(e.package);
      out.push({ ...p, package: e.package, limit: p.limit ?? (Array.isArray(e.limit) ? e.limit.join("/") : (e.limit ?? null)) });
    }
  }
  return out;
}

/** Catalog from many classSkills lists: [{id, group, ability}] (group = most common core package). */
export function buildCatalog(lists, { extra = [], exclude = [] } = {}) {
  const map = new Map();
  for (const list of lists) for (const g of grantsOf(list)) {
    if (exclude.includes(g.id)) continue;
    const c = map.get(g.id) ?? { id: g.id, count: {} };
    c.count[g.package] = (c.count[g.package] ?? 0) + 1; map.set(g.id, c);
  }
  const out = [];
  for (const c of map.values()) {
    const core = Object.entries(c.count).filter(([k]) => PACKAGE_ABILITY[k])
      .sort((a, b) => b[1] - a[1] || GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]));
    const group = core[0]?.[0] ?? "other";
    out.push({ id: c.id, group, ability: PACKAGE_ABILITY[group] ?? "int" });
  }
  for (const x of extra) {
    const i = out.findIndex((c) => c.id === x.id);
    if (i >= 0) { if (out[i].group === "other") out[i] = { ...out[i], ...x }; } else out.push({ id: x.id, group: x.group ?? "other", ability: x.ability ?? "int" });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Add checks granted by the actor's classes that the catalog lacks (homebrew). */
export function mergeCatalog(catalog, classes = [], { exclude = EXCLUDE_CHECKS } = {}) {
  const map = new Map(catalog.map((c) => [c.id, { ...c }]));
  for (const k of classes) for (const g of k.grants ?? []) {
    if (exclude.includes(g.id) || map.has(g.id)) continue;
    const group = PACKAGE_ABILITY[g.package] ? g.package : "other";
    map.set(g.id, { id: g.id, group, ability: PACKAGE_ABILITY[g.package] ?? "int", homebrew: true });
  }
  for (const id of exclude) map.delete(id);
  return [...map.values()];
}

/** Does a rule-engine check modifier apply to `id`? checks [] or ["all"] = every check. */
export function ruleModApplies(m, id, classId) {
  if (!m?.active) return false;
  const list = m.checks ?? [];
  if (list.length && !list.includes("all") && !list.includes(id)) return false;
  // a class's own rule (e.g. its metal-armour penalty) only touches checks rolled with that class
  if (m.sourceType === "skill" && m.sourceId && m.sourceId !== classId) return false;
  return true;
}

/** Non-roll modifier parts for one check. */
export function modParts({ id, label, pkg, saved = {}, globalMod = 0, effects = {}, ruleMods = [], classId = null, labels = {} }) {
  const parts = [];
  const push = (value, text, kind) => { const v = num(value); if (v) parts.push({ value: v, label: text, kind }); };
  push(effects.allck, labels.allck ?? "All checks (effect)", "effect");
  push(effects.allsc, labels.allsc ?? "Skill checks (effect)", "effect");
  const pe = PACKAGE_EFFECT[pkg]; if (pe) push(effects.package?.[pe], labels[`pkg.${pe}`] ?? `${checkLabel(pkg)} package (effect)`, "effect");
  push(effects.byName?.[label] ?? effects.byName?.[id], labels.named ?? "Check effect", "effect");
  if (id === "monster-knowledge") push(effects.mknow, labels.mknow ?? "Monster Knowledge (effect)", "effect");
  for (const m of ruleMods) if (ruleModApplies(m, id, classId)) push(m.value, m.source ? `${m.label} (${m.source})` : m.label, "rule");
  push(globalMod, labels.global ?? "All checks ±", "player");
  push(saved.mod, labels.situational ?? "Situational ±", "player");
  return parts;
}

/** Roll formula with Foundry flavour labels, e.g. "2d6 + 3[MyClass Lv 3] + 2[Agi] - 4[Metal armour]". */
export function rollFormula(parts) {
  let f = "2d6";
  for (const p of parts) if (num(p.value)) f += ` ${fmt(num(p.value))}[${String(p.label).replace(/[\[\]]/g, "")}]`;
  return f;
}
/** Human calculation, e.g. "2d6 + 3 (MyClass Lv 3) + 2 (Agi) - 4 (Metal armour)". */
export function calcText(parts) {
  let f = "2d6";
  for (const p of parts) if (num(p.value) || p.always) f += ` ${fmt(num(p.value))} (${p.label})`;
  return f;
}

/**
 * Build the Skill Checks view model.
 * classes: [{id, name, level, grants:[{id,package,limit,natural}]}]; advLevel: Adventurer level;
 * abilities: {dex:{mod},...}; saved: {<checkId>: {class, mod}}; globalMod: number;
 * effects: {allck, allsc, package:{fine,...}, byName:{label:n}, mknow}; ruleMods: [{label, source, sourceId, sourceType, value, checks, active}];
 * labels: optional translations {check:{id:label}, group:{...}, ability:{...}, none, adv, situational, global, ...}.
 */
export function buildSkillChecks({ catalog = [], classes = [], advLevel = 0, abilities = {}, saved = {}, globalMod = 0, effects = {}, ruleMods = [], labels = {} } = {}) {
  const L = (id) => labels.check?.[id] ?? checkLabel(id);
  const ABBR = { dex: "Dex", agi: "Agi", str: "Str", vit: "Vit", int: "Int", mnd: "Spi", ...(labels.ability ?? {}) };
  const rows = [];
  for (const c of mergeCatalog(catalog, classes)) {
    const granting = classes.map((k) => ({ k, g: (k.grants ?? []).find((g) => g.id === c.id) })).filter((x) => x.g)
      .sort((a, b) => num(b.k.level) - num(a.k.level));
    const def = granting[0]?.k.id ?? NONE;
    const s = saved[c.id] ?? {};
    let sel = s.class ?? def;
    if (sel !== NONE && sel !== ADV && !classes.some((k) => k.id === sel)) sel = def; // class removed -> default
    const cls = classes.find((k) => k.id === sel) ?? null;
    const grant = cls ? granting.find((x) => x.k.id === cls.id)?.g ?? null : null;
    const pkg = grant?.package && PACKAGE_ABILITY[grant.package] ? grant.package : c.group;
    const abil = c.group === "other" ? c.ability : (PACKAGE_ABILITY[pkg] ?? c.ability);
    const amod = num(abilities?.[abil]?.mod);
    const label = L(c.id);
    const base = [];
    if (cls) base.push({ value: num(cls.level), label: `${cls.name} Lv ${num(cls.level)}`, kind: "class", always: true });
    else if (sel === ADV) base.push({ value: num(advLevel), label: `${labels.adv ?? "Adventurer"} Lv ${num(advLevel)}`, kind: "class", always: true });
    if (sel !== NONE) base.push({ value: amod, label: ABBR[abil] ?? abil, kind: "ability", always: true });
    const mods = modParts({ id: c.id, label, pkg, saved: s, globalMod, effects, ruleMods, classId: cls?.id ?? null, labels });
    const parts = [...base, ...mods];
    const value = parts.reduce((t, p) => t + num(p.value), 0);
    rows.push({
      id: c.id, label, group: c.group, homebrew: !!c.homebrew, selected: sel, grants: !!grant,
      limit: grant?.limit ?? null, natural: !!grant?.natural,
      grantedBy: granting.map((x) => x.k.name + (x.g.limit ? ` (${x.g.limit})` : "") + (x.g.natural ? " *" : "")),
      options: [
        { value: NONE, label: labels.none ?? "— none (2d6)", selected: sel === NONE, grants: false },
        { value: ADV, label: `${labels.adv ?? "Adventurer"} ${num(advLevel)}`, selected: sel === ADV, grants: false },
        ...classes.map((k) => ({ value: k.id, label: `${k.name} ${num(k.level)}${granting.some((x) => x.k.id === k.id) ? " ✔" : ""}`, selected: k.id === sel, grants: granting.some((x) => x.k.id === k.id) })),
      ],
      className: cls?.name ?? (sel === ADV ? (labels.adv ?? "Adventurer") : null), classLevel: cls ? num(cls.level) : sel === ADV ? num(advLevel) : 0,
      ability: sel === NONE ? null : abil, abilityLabel: sel === NONE ? null : (ABBR[abil] ?? abil), abilityMod: sel === NONE ? 0 : amod,
      sitMod: num(s.mod), mods, parts, value, valueText: signed(value), modTotal: mods.reduce((t, p) => t + p.value, 0),
      formula: rollFormula(parts), calc: calcText(parts),
    });
  }
  const groups = GROUP_ORDER.map((g) => ({ key: g, label: labels.group?.[g] ?? checkLabel(g), ability: PACKAGE_ABILITY[g] ? (ABBR[PACKAGE_ABILITY[g]]) : null,
    rows: rows.filter((r) => r.group === g).sort((a, b) => a.label.localeCompare(b.label)) })).filter((g) => g.rows.length);
  return { groups, rows, globalMod: num(globalMod) };
}

/** Initiative breakdown from the Initiative check item's total (checkbase) plus rule-engine initiative mods. */
export function initiativeParts({ base = 0, className = null, classLevel = 0, ability = null, abilityMod = 0, ruleMods = [], labels = {} } = {}) {
  const parts = [];
  let rest = num(base);
  if (className) { parts.push({ value: num(classLevel), label: `${className} Lv ${num(classLevel)}`, kind: "class", always: true }); rest -= num(classLevel); }
  if (ability) { parts.push({ value: num(abilityMod), label: ability, kind: "ability", always: true }); rest -= num(abilityMod); }
  if (rest) parts.push({ value: rest, label: labels.other ?? "Other modifiers", kind: "effect" });
  for (const m of ruleMods) if (m.active && (m.checks ?? []).includes("initiative")) parts.push({ value: num(m.value), label: m.source ? `${m.label} (${m.source})` : m.label, kind: "rule" });
  const value = parts.reduce((t, p) => t + num(p.value), 0);
  return { parts, value, formula: rollFormula(parts), calc: calcText(parts) };
}
