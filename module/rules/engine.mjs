/* sw25-ce rule-element engine. PURE: no Foundry globals, so it is unit-testable in Node.
 *
 * Rule  = { key, mode: add|multiply|override|upgrade|downgrade, value, level_min, level_max,
 *           predicate: [token...], priority, label }
 * Order for every target: base (sheet maths) -> Active Effects (already in base data)
 *        -> rules (by priority; default override 10, multiply 20, add 30, upgrade 40, downgrade 50)
 *        -> misc modifier (overrides.<t>.mod) -> locked manual override (overrides.<t>.value) wins.
 * Rules hold EXTRAS only: the sheet already adds class level to weapon damage / magic power and
 * MP = MND + 3 x magic-class levels.
 */

export const SCHOOLS = ["sc", "cn", "wz", "pr", "mt", "fr", "dr", "dm", "ab", "bm"];
export const ABILITIES = ["dex", "agi", "str", "vit", "int", "mnd"];
const SCHOOL_NAMES = { truespeech: "sc", sorcerer: "sc", spiritualism: "cn", conjurer: "cn", wizard: "wz",
  divine: "pr", priest: "pr", magitech: "mt", artificer: "mt", fairy: "fr", nature: "dr", druid: "dr",
  summoning: "dm", daemonologist: "dm", abyssal: "ab", arcane: "bm", bibliomancer: "bm" };

/* Overridable actor targets: target -> system path of the derived value. */
export const ACTOR_TARGETS = {
  "hp.max": "hp.max",
  "mp.max": "mp.max",
  "evasion": "dodgebase",
  "defense": "attributes.protectionpoint",
  "move": "attributes.move.normal",
  "accuracy": "itemhitbase",
  ...Object.fromEntries(ABILITIES.map((a) => [`ability.${a}`, `abilities.${a}.value`])),
  ...Object.fromEntries(SCHOOLS.map((s) => [`magic.power.${s}`, `attributes.${s}power`])),
};

/* Writer key -> { target, kind }.
 * kind: actor  = numeric actor target above
 *       weapon = per-weapon (selected attack weapon) value
 *       legacy = routed into the existing classRules aggregate (critMod/minStrMult/castPenalty)
 *       check  = predicate-scoped check modifier list (classRules.checkMods)
 *       flag   = boolean passive switch read by roll/chat code (ruleFlags)
 *       equip  = equipment permission (rankAllowed -> rankCheck; warns, never blocks)
 *       spell  = read by the spell cast dialog (spell-cast.mjs)
 *       counter = named per-character counter (value = name), read as @counter:<name>
 *       note   = recorded and shown, not applied (no sheet support yet)                       */
export const KEY_ALIASES = {
  "attack.critThreshold": { target: "critMod", kind: "legacy" },
  "equip.minStrMultiplier": { target: "minStrMult", kind: "legacy" },
  "spell.armorPenalty": { target: "castPenalty", kind: "legacy" },
  "attack.extraDamage": { target: "weapon.extraDamage", kind: "weapon" },
  "attack.accuracy": { target: "weapon.accuracy", kind: "weapon" },
  "check.evasion": { target: "evasion", kind: "actor" },
  "check.penalty": { target: "check", kind: "check" },
  "check.bonus": { target: "check", kind: "check" },
  "hp.bonus": { target: "hp.max", kind: "actor" },
  "mp.bonus": { target: "mp.max", kind: "actor" },
  "defense.bonus": { target: "defense", kind: "actor" },
  "evasion.bonus": { target: "evasion", kind: "actor" },
  "move.bonus": { target: "move", kind: "actor" },
  "spell.mpSurcharge.outOfInfluence": { target: "spell.mpSurcharge", kind: "spell" },
  "counter.track": { target: "counter", kind: "counter" },
  "spell.extraTargets": { target: "spell.extraTargets", kind: "spell" },
  "spell.mpMultiplier": { target: "spell.mpMultiplier", kind: "spell" },
  "equip.rankAllowed": { target: "equip.rankAllowed", kind: "equip" },
  "attack.noStray": { target: "noStray", kind: "flag" },
};
for (const t of Object.keys(ACTOR_TARGETS)) KEY_ALIASES[t] ??= { target: t, kind: "actor" };
for (const [n, s] of Object.entries(SCHOOL_NAMES)) KEY_ALIASES[`magic.power.${n}`] ??= { target: `magic.power.${s}`, kind: "actor" };
for (const a of ABILITIES) KEY_ALIASES[`ability.${a}.bonus`] ??= { target: `ability.${a}`, kind: "actor" };

export function resolveKey(key) {
  if (KEY_ALIASES[key]) return KEY_ALIASES[key];
  return { target: key, kind: "note", unknown: true };
}

const MODE_PRIORITY = { override: 10, multiply: 20, add: 30, upgrade: 40, downgrade: 50 };
export const MODES = Object.keys(MODE_PRIORITY);

/* ---------------------------------------------------------------- legacy adapter */
/** Convert the ce.7 object form {critMod,minStrMult,attackOnly,castPenalty} (or an array) to rule[]. */
export function normalizeRules(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((r) => r && typeof r === "object" && r.key);
  if (typeof raw === "object" && !raw.key) {
    const vals = Object.values(raw);
    if (vals.length && vals.every((v) => v && typeof v === "object" && v.key)) return vals; // Foundry object-ified array
    const out = [];
    const onlyAtk = raw.attackOnly !== false;
    if (Number(raw.critMod)) out.push({ key: "attack.critThreshold", mode: "add", value: Number(raw.critMod), predicate: onlyAtk ? ["attack.usesThisClass", "min:8"] : ["min:8"], label: "legacy" });
    if (Number(raw.minStrMult) > 0 && Number(raw.minStrMult) !== 1) out.push({ key: "equip.minStrMultiplier", mode: "override", value: Number(raw.minStrMult), predicate: onlyAtk ? ["attack.usesThisClass", "roundUp"] : ["roundUp"], label: "legacy" });
    const cp = raw.castPenalty ?? {};
    if (Number(cp.metal)) out.push({ key: "spell.armorPenalty", mode: "add", value: -Math.abs(Number(cp.metal)), predicate: ["armor.metal"], label: "legacy" });
    if (Number(cp.nonmetal)) out.push({ key: "spell.armorPenalty", mode: "add", value: -Math.abs(Number(cp.nonmetal)), predicate: ["armor.nonMetal", `armor.minStr>=${Number(cp.nonmetalMinStr) || 0}`], label: "legacy" });
    return out;
  }
  return [];
}
export const migrateLegacyRules = normalizeRules;

/* ---------------------------------------------------------------- formulas */
/** Evaluate a number, "@path" formula, or {key:value} map (picked by ctx.selectors). */
export function evalValue(value, data = {}, selectors = {}) {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object") {
    for (const sel of Object.values(selectors ?? {})) if (sel != null && Object.hasOwn(value, sel)) return evalValue(value[sel], data, selectors);
    return null;
  }
  const s = String(value).trim();
  if (s === "") return null;
  if (!/[@a-z]/i.test(s) && !isNaN(Number(s))) return Number(s);
  const expr = s.replace(/@counter:([\w.-]+)/g, (_, n) => `(${Number(data?.counters?.[n]) || 0})`).replace(/@([a-zA-Z_][\w.]*)/g, (_, p) => {
    const v = getPath(data, p);
    const n = Number(typeof v === "object" && v ? v.value : v);
    return Number.isFinite(n) ? `(${n})` : "(0)";
  });
  const safe = expr.replace(/\b(floor|ceil|round|min|max|abs)\b/g, "");
  if (!/^[\d\s+\-*/().,]*$/.test(safe)) return typeof value === "string" && !/[@()+\-*/]/.test(s) ? s : null;
  try {
    // eslint-disable-next-line no-new-func
    const r = Function("floor", "ceil", "round", "min", "max", "abs", `"use strict";return (${expr});`)(Math.floor, Math.ceil, Math.round, Math.min, Math.max, Math.abs);
    return Number.isFinite(r) ? r : null;
  } catch { return null; }
}

export function getPath(obj, p) {
  return String(p).split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
export function setPath(obj, p, v) {
  const ks = String(p).split(".");
  let o = obj;
  for (const k of ks.slice(0, -1)) o = o[k] ??= {};
  o[ks.at(-1)] = v;
}

/* ---------------------------------------------------------------- predicates */
/** @<id> -> choices[id]; the generic @choice falls back to the item's only/first pick (its `choose` id). */
export function choiceValue(choices = {}, id = "choice") {
  const v = getPath(choices ?? {}, id) ?? choices?.[id];
  if (v != null && v !== "") return v;
  if (id !== "choice") return null;
  return Object.values(choices ?? {}).find((x) => x != null && x !== "" && typeof x !== "object") ?? null;
}
const RANGED = ["bow", "crossbow", "gun", "throw", "thrown"];
const isMetal = (a) => a?.category === "metalarmor";
const isNonMetal = (a) => a?.category === "nonmetalarmor";

/**
 * Test predicate tokens. ctx = { source:{name, choices}, weapon, armors:[{category,reqstr}], declared:[], lingering:[], checks }.
 * declared:X is met when X is declared (ctx.declared), or for duration:1round rules while X lingers (ctx.lingering).
 * Returns { ok, situational, mods:{roundUp,min,max}, checks, notes }.
 * Unknown tokens never error: they make the rule "situational" (shown, not applied).
 */
export function testPredicate(pred = [], ctx = {}) {
  const res = { ok: true, situational: false, mods: {}, checks: null, notes: [] };
  const armorTests = [];
  const preds = [].concat(pred ?? []).map((x) => String(x).trim());
  const lasting = preds.includes("duration:1round");
  for (const raw of [].concat(pred ?? [])) {
    const t = String(raw).trim();
    if (!t) continue;
    let m;
    if (t === "roundUp") res.mods.roundUp = true;
    else if ((m = t.match(/^(min|max):(-?\d+(?:\.\d+)?)$/))) res.mods[m[1]] = Number(m[2]);
    else if (t === "attack.usesThisClass") {
      if (ctx.weapon === undefined) continue; // not attack-scoped here (e.g. legacy aggregate decides per item)
      if (!ctx.weapon || ctx.weapon.checkskill !== ctx.source?.name) res.ok = false;
    } else if (t === "attack.melee" || t === "attack.ranged") {
      if (!ctx.weapon) { res.ok = false; continue; }
      const ranged = RANGED.includes(String(ctx.weapon.category ?? "").toLowerCase()) || ctx.weapon.ranged === true;
      if ((t === "attack.melee") === ranged) res.ok = false;
    } else if ((m = t.match(/^weapon\.(\w+):(.+)$/))) {
      if (!ctx.weapon) { res.ok = false; continue; }
      let want = m[2];
      if (want.startsWith("@")) want = choiceValue(ctx.source?.choices, want.slice(1));
      if (want == null) { res.situational = true; res.notes.push(`${t}: no choice made`); continue; }
      if (String(ctx.weapon[m[1]] ?? "").toLowerCase() !== String(want).toLowerCase()) res.ok = false;
    } else if (t === "armor.metal") armorTests.push(isMetal);
    else if (t === "armor.nonMetal") armorTests.push(isNonMetal);
    else if ((m = t.match(/^armor\.minStr>=(\d+)$/))) { const n = Number(m[1]); armorTests.push((a) => (Number(a?.reqstr) || 0) >= n); }
    else if ((m = t.match(/^check:(.+)$/))) res.checks = m[1].split("|").map((s) => s.trim());
    else if ((m = t.match(/^choice\.([\w-]+)[:=](.+)$/))) {
      if (String(ctx.source?.choices?.[m[1]] ?? "") !== m[2]) res.ok = false;
    } else if ((m = t.match(/^declared:(.+)$/))) {
      const on = (ctx.declared ?? []).includes(m[1]) || (lasting && (ctx.lingering ?? []).includes(m[1]));
      if (!on) { res.situational = true; res.notes.push(`declared: ${m[1]}`); }
    } else if (t === "duration:1round") { /* handled with declared: (lingering until the actor's next turn) */ }
    else { res.situational = true; res.notes.push(t); }
  }
  if (armorTests.length) {
    const armors = ctx.armors ?? [];
    if (!armors.some((a) => armorTests.every((f) => f(a)))) res.ok = false;
  }
  return res;
}

/* ---------------------------------------------------------------- collection */
/**
 * sources: [{ id, name, type, level, rules, choices }]. data: roll data for @formulas.
 * Returns { active: [...], notes: [...] } — each active entry carries resolved info; nothing applied yet.
 */
export function collectRules(sources = [], { data = {}, selectors = {} } = {}) {
  const active = [];
  const notes = [];
  for (const src of sources) {
    const level = Number(src.level) || 0;
    for (const [i, r] of normalizeRules(src.rules).entries()) {
      if (r.disabled) continue;
      const lmin = r.level_min == null ? (src.type === "skill" ? 1 : 0) : Number(r.level_min);
      const lmax = r.level_max == null ? Infinity : Number(r.level_max);
      if (level < lmin || level > lmax) continue;
      const alias = resolveKey(r.key);
      const sel = { ...selectors, ...(src.selectors ?? {}) };
      const value = evalValue(r.value, { ...data, level, source: { level } }, sel);
      const entry = {
        ...r, mode: MODES.includes(r.mode) ? r.mode : "add", target: alias.target, kind: alias.kind,
        unknown: !!alias.unknown, value, rawValue: r.value, source: { id: src.id, name: src.name, type: src.type, level, choices: src.choices ?? {} },
        priority: Number.isFinite(Number(r.priority)) && r.priority !== null && r.priority !== "" ? Number(r.priority) : MODE_PRIORITY[r.mode] ?? 30,
        index: i,
      };
      if (alias.kind === "note") notes.push({ ...entry, reason: alias.unknown ? "unknown key" : "not applied by the sheet yet" });
      else active.push(entry);
    }
  }
  return { active, notes };
}

/* ---------------------------------------------------------------- application */
/** Apply rules (already filtered to one target) to a base value. Returns { value, steps }. */
export function combine(base, rules = []) {
  let v = Number(base) || 0;
  const steps = [{ label: "base", value: v }];
  const sorted = [...rules].sort((a, b) => a.priority - b.priority || a.index - b.index);
  let mods = {};
  for (const r of sorted) {
    const n = Number(r.value);
    if (!Number.isFinite(n)) continue;
    if (r.mode === "add") v += n;
    else if (r.mode === "multiply") v *= n;
    else if (r.mode === "override") v = n;
    else if (r.mode === "upgrade") v = Math.max(v, n);
    else if (r.mode === "downgrade") v = Math.min(v, n);
    mods = { ...mods, ...(r._mods ?? {}) };
    steps.push({ label: r.label || r.key, source: r.source?.name, mode: r.mode, value: v });
  }
  if (mods.min != null) v = Math.max(v, mods.min);
  if (mods.max != null) v = Math.min(v, mods.max);
  return { value: v, steps };
}

/** Misc modifier then locked manual override. ov = {mod, value, locked}. */
export function applyOverride(value, ov) {
  if (!ov) return { value, overridden: false };
  let v = Number(value) || 0;
  const mod = Number(ov.mod) || 0;
  v += mod;
  const locked = ov.locked === true && ov.value !== "" && ov.value != null && Number.isFinite(Number(ov.value));
  if (locked) v = Number(ov.value);
  return { value: v, overridden: locked, modded: !!mod };
}

/** Rules for one target that pass predicates in ctx. */
export function rulesFor(active, target, ctx = {}) {
  const out = [];
  const situational = [];
  for (const r of active) {
    if (r.target !== target) continue;
    const p = testPredicate(r.predicate, { ...ctx, source: r.source });
    if (!p.ok) continue;
    if (p.situational) { situational.push({ ...r, notes: p.notes }); continue; }
    out.push({ ...r, _mods: p.mods });
  }
  return { rules: out, situational };
}

/**
 * Apply all actor-kind rules + overrides to a (plain) system data object in place.
 * targets: subset of ACTOR_TARGETS keys to process. Returns a report { [target]: {base, value, steps, overridden} }.
 */
export function applyActorTargets(system, active, overrides = {}, ctx = {}, targets = Object.keys(ACTOR_TARGETS)) {
  const report = {};
  for (const t of targets) {
    const path = ACTOR_TARGETS[t];
    const base = getPath(system, path);
    if (base === undefined) continue;
    const { rules, situational } = rulesFor(active.filter((r) => r.kind === "actor"), t, ctx);
    const ov = overrides?.[t.replace(/\./g, "_")] ?? overrides?.[t];
    if (!rules.length && !situational.length && !(ov && (Number(ov.mod) || ov.locked))) continue;
    const c = combine(base, rules);
    const o = applyOverride(c.value, ov);
    setPath(system, path, o.value);
    report[t] = { base: Number(base) || 0, value: o.value, steps: c.steps, overridden: o.overridden, modded: o.modded, situational };
  }
  return report;
}

/** Per-weapon extras (weapon.extraDamage / weapon.accuracy) for one weapon. */
export function weaponExtras(active, weapon, ctx = {}) {
  const out = {};
  for (const t of ["weapon.extraDamage", "weapon.accuracy"]) {
    const { rules, situational } = rulesFor(active.filter((r) => r.kind === "weapon"), t, { ...ctx, weapon });
    const c = combine(0, rules);
    out[t.split(".")[1]] = { value: c.value, steps: c.steps, situational };
  }
  return out;
}

/** Counters declared by counter.track rules: [{ name, source, reset, firstMelee }]. */
export function counterDefs(active = [], all = active) {
  const defs = [];
  for (const r of active) {
    if (r.kind !== "counter") continue;
    const name = String(r.rawValue ?? r.value ?? "");
    if (!name || defs.some((d) => d.name === name)) continue;
    const pred = [].concat(r.predicate ?? []).map(String);
    // a reader with attack.firstMeleeThisTurn spends the counter on the first melee attack of the turn
    const firstMelee = all.some((x) => String(x.rawValue ?? "").includes(`@counter:${name}`) && [].concat(x.predicate ?? []).includes("attack.firstMeleeThisTurn"));
    defs.push({ name, source: r.source?.name, sourceId: r.source?.id, reset: pred.includes("reset:round") ? "round" : null, on: (pred.find((t) => t.startsWith("on:")) ?? "").slice(3) || null, firstMelee });
  }
  return defs;
}

/** Boolean passives (kind flag) whose predicates pass: { noStray: true, ... }. */
export function ruleFlags(active, ctx = {}) {
  const out = {};
  for (const r of active) {
    if (r.kind !== "flag") continue;
    const p = testPredicate(r.predicate, { ...ctx, source: r.source });
    if (p.ok && !p.situational) out[r.target] = r.value !== false && r.value !== 0 && r.value != null ? r.value : out[r.target] ?? false;
  }
  return out;
}

/* Equipment ranks: B and below need nothing; A needs a matching rankAllowed A (or S); S/SS need S. */
export const RANK_ORDER = ["C", "B", "A", "S", "SS"];
const normCat = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
/**
 * item = { type: weapon|armor, category, rank }. Returns { ok, needed, allowed:[ranks], sources:[names] }.
 * Matches predicates weapon.category:<cat|@choice> / armor.category:<cat|@choice>; a rule without a
 * category predicate allows every category. Unmade @choice never allows (warn, not block).
 */
export function rankCheck(active, item = {}) {
  const R = String(item.rank ?? "").toUpperCase();
  const needIdx = RANK_ORDER.indexOf(R);
  if (needIdx < RANK_ORDER.indexOf("A")) return { ok: true, needed: R || null, allowed: [], sources: [] };
  const kind = item.type === "weapon" ? "weapon" : "armor";
  const allowed = []; const sources = [];
  for (const r of active) {
    if (r.kind !== "equip" || r.target !== "equip.rankAllowed") continue;
    let match = true;
    for (const raw of [].concat(r.predicate ?? [])) {
      const m = String(raw).trim().match(/^(weapon|armor)\.category:(.+)$/);
      if (!m) continue;
      if (m[1] !== kind) { match = false; break; }
      let want = m[2];
      if (want.startsWith("@")) want = choiceValue(r.source?.choices, want.slice(1));
      if (want == null || normCat(want) !== normCat(item.category)) { match = false; break; }
    }
    if (!match) continue;
    const v = String(r.value ?? "").toUpperCase();
    allowed.push(v); sources.push(r.source?.name);
  }
  const best = Math.max(-1, ...allowed.map((v) => RANK_ORDER.indexOf(v)));
  const ok = needIdx <= Math.max(best, RANK_ORDER.indexOf("B")) || (R === "SS" && best >= RANK_ORDER.indexOf("S"));
  return { ok, needed: R, allowed, sources };
}

/** Check modifiers (check.penalty/bonus): list with active flag. */
export function checkMods(active, ctx = {}) {
  return active.filter((r) => r.kind === "check").map((r) => {
    const p = testPredicate(r.predicate, { ...ctx, source: r.source });
    return { label: r.label || r.key, source: r.source.name, value: Number(r.value) || 0, checks: p.checks ?? [], active: p.ok && !p.situational };
  });
}

/**
 * Legacy aggregate (same shape as ce.7 sw25AggregateClassRules) built from rules.
 * Keeps sw25CritModFor / sw25MinStrMultFor / sw25ApplyCastPenalties working unchanged.
 */
export function toLegacy(active) {
  const out = { critMod: 0, minStrMult: 1, castPenalty: {}, classes: [] };
  for (const r of active) {
    if (r.kind !== "legacy") continue;
    const pred = [].concat(r.predicate ?? []);
    const attackOnly = pred.includes("attack.usesThisClass");
    const n = Number(r.value);
    if (!Number.isFinite(n)) continue;
    if (r.target === "critMod") {
      out.classes.push({ name: r.source.name, critMod: n, minStrMult: 1, attackOnly });
      if (!attackOnly) out.critMod += n;
    } else if (r.target === "minStrMult" && n > 0) {
      out.classes.push({ name: r.source.name, critMod: 0, minStrMult: n, attackOnly });
      if (!attackOnly) out.minStrMult *= n;
    } else if (r.target === "castPenalty") {
      const cp = (out.castPenalty[r.source.name] ??= { metal: 0, nonmetal: 0, nonmetalMinStr: 0 });
      const pen = Math.abs(n);
      if (pred.includes("armor.metal")) cp.metal += pen;
      else if (pred.includes("armor.nonMetal")) {
        cp.nonmetal += pen;
        const m = pred.map((p) => String(p).match(/^armor\.minStr>=(\d+)$/)).find(Boolean);
        cp.nonmetalMinStr = m ? Number(m[1]) : 0;
      }
    }
  }
  return out;
}

/* ---------------------------------------------------------------- grants (autoFeats) */
/** Normalise one autoFeats entry. Legacy {uuid, level} -> {kind:"feat", ref:uuid}. */
export function normalizeGrant(g) {
  if (!g || typeof g !== "object") return null;
  if (g.choose) return { choose: String(g.choose), options: [].concat(g.options ?? []), level: Number(g.level) || 1, level_max: g.level_max ?? null, when: g.when ?? null };
  const ref = g.ref ?? g.uuid;
  if (!ref) return null;
  return { kind: g.kind ?? "feat", ref: String(ref), level: Number(g.level) || 1, level_max: g.level_max ?? null, when: g.when ?? null, name: g.name };
}
export function grantList(raw) {
  const arr = Array.isArray(raw) ? raw : Object.values(raw ?? {});
  return arr.map(normalizeGrant).filter(Boolean);
}
const optId = (o) => (typeof o === "object" && o ? String(o.id ?? o.ref ?? o.slug) : String(o));
const inRange = (g, lv) => lv >= g.level && (g.level_max == null || lv <= Number(g.level_max));
const whenOk = (g, choices) => !g.when || Object.entries(g.when).every(([k, v]) => [].concat(v).map(String).includes(String(choices?.[k] ?? "")));

/**
 * Pure grant planner.
 * granted: [{id, ref}] items already on the actor from this class.
 * overrides: { block:[ref], add:[{kind,ref}] } from flags.sw25-ce.grantOverrides.
 * Returns { want:[{kind,ref}], add:[{kind,ref}], remove:[id], pending:[choose entries needing a pick] }.
 * Choice options may themselves be grant refs: a chosen option that is an object with kind/ref is granted.
 */
export function planGrants(rawList, level, choices = {}, granted = [], overrides = {}) {
  const lv = Number(level) || 0;
  const list = grantList(rawList);
  const want = [];
  const pending = [];
  for (const g of list) {
    if (!inRange(g, lv) || !whenOk(g, choices)) continue;
    if (g.choose) {
      const picked = choices?.[g.choose];
      if (picked == null || picked === "") { pending.push(g); continue; }
      const opt = g.options.find((o) => optId(o) === String(picked));
      if (opt && typeof opt === "object" && opt.ref) want.push({ kind: opt.kind ?? "feat", ref: String(opt.ref) });
      continue;
    }
    want.push({ kind: g.kind, ref: g.ref });
  }
  const block = new Set((overrides?.block ?? []).map(String));
  for (const a of overrides?.add ?? []) if (a?.ref) want.push({ kind: a.kind ?? "feat", ref: String(a.ref) });
  const finalWant = want.filter((w, i) => !block.has(w.ref) && want.findIndex((x) => x.ref === w.ref) === i);
  const add = finalWant.filter((w) => !granted.some((g) => g.ref === w.ref));
  const remove = granted.filter((g) => !finalWant.some((w) => w.ref === g.ref)).map((g) => g.id);
  return { want: finalWant, add, remove, pending };
}

/** Item type(s) a grant kind may resolve to. */
export const KIND_TYPES = {
  feat: ["combatability"],
  spell: ["spell"],
  feature: ["otherfeature", "raceability"],
  technique: ["enhancearts", "magicalsong", "ridingtrick", "alchemytech", "phasearea", "tactics", "infusion", "barbarousskill", "essenceweave"],
  language: ["language"],
  weapon: ["weapon"],
  armor: ["armor"],
  item: ["item", "accessory"],
};
