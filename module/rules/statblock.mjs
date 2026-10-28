import { applyShards } from "./sb-shards.mjs";
/**
 * sw25-ce NPC / Monster stat block (SHEET_SPEC_NPC_MONSTER.md), pure logic.
 * Stored under system.sb.* so it never collides with the legacy sw25 monster fields
 * (legacy `weakness` is the weak-point TEXT and `weakpoint` the number, `loot`/`habitat` are strings).
 * Legacy values are read as fallbacks, so existing actors load unchanged.
 * Overrides: system.sb.overrides.<sb-path> = {mod?, value, locked}; e.g. overrides.parts.0.defense.
 */
export const STAT_DEFAULTS = () => ({
  level: null, reputation: 0, weakness: 0, weakPoint: "", weakPointData: null, weaknessRevealed: false, reputationReached: false, initiative: 0,
  movement: { ground: null, groundMode: "", other: null, otherMode: "" }, movementSpeed: null,
  fortitude: { value: 0, fixed: 7 }, willpower: { value: 0, fixed: 7 }, useFixed: true,
  parts: [], partCount: 1, coreParts: "", uniqueSkills: [], magic: [], loot: [], swordShards: 0, useDeathCheck: false,
  description: "", source: "",
  // monster-only (NPCs keep intelligence/perception/soulscars optional)
  monsterType: "", intelligence: "", perception: "", disposition: "", soulscars: 0, languages: [], habitat: [],
  // NPC Person tab
  title: "", faction: "", settlement: "", race: "", attitude: "", hostile: false,
  neutral: false, // monster-only: Hostile toggle OFF (monsters default Hostile)
  classLevels: [], relationships: [], services: [], notes: "", secrets: "",
  overrides: {},
});
export const PART_DEFAULTS = () => ({ name: "", count: 1, accuracy: null, damage: null, evasion: null, defense: 0, hp: 0, hpValue: null, mp: null, mpValue: null, isCore: false });

const get = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
const set = (o, p, v) => { const ks = p.split("."); let a = o; for (const k of ks.slice(0, -1)) a = a[k] ??= {}; a[ks.at(-1)] = v; };
const num = (v) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));
const arr = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []);
const splitList = (v) => (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? v.split(/[,、\n]/).map((s) => s.trim()).filter(Boolean) : []);

/** Parse "12", "12(Bipedal)/20(Flight)", "-/15" into a movement object. */
export function parseMovement(v) {
  if (v && typeof v === "object") return { ground: num(v.ground), groundMode: v.groundMode ?? "", other: num(v.other), otherMode: v.otherMode ?? "" };
  if (typeof v === "number") return { ground: v, groundMode: "", other: null, otherMode: "" };
  const [g, o] = String(v ?? "").split("/");
  const one = (s) => { const m = String(s ?? "").trim().match(/^(-|\d+)?\s*(?:\(([^)]*)\))?/) ?? []; return [m[1] && m[1] !== "-" ? Number(m[1]) : null, m[2] ?? ""]; };
  const [ground, groundMode] = one(g); const [other, otherMode] = one(o);
  return { ground, groundMode, other, otherMode };
}

/** Override for an sb path: misc mod, then locked value wins. */
export function overrideFor(ov, p, v) {
  const o = (ov ?? {})[p] ?? get(ov ?? {}, p); // flat "parts.0.defense" (spec example) or nested
  if (!o || typeof o !== "object") return { value: v, overridden: false };
  let out = v;
  if (num(o.mod) && typeof out === "number") out += Number(o.mod);
  if (o.locked && o.value !== null && o.value !== undefined && o.value !== "") return { value: Number.isNaN(Number(o.value)) ? o.value : Number(o.value), overridden: true };
  return { value: out, overridden: false };
}

/** Normalise + derive the stat block. `legacy` = the actor's system (for fallbacks). Returns a new object plus .locked[] paths. */
export function prepareStatBlock(sbIn, legacy = {}, type = "monster") {
  const sb = Object.assign(STAT_DEFAULTS(), structuredClone(sbIn ?? {}));
  // legacy fallbacks (only when the new field is empty)
  if (!sbIn?.level && legacy.monlevel) sb.level = Number(legacy.monlevel) || 1;
  if (sb.level == null || sb.level === "") sb.level = 1;
  if (!sb.reputation && legacy.popularity) sb.reputation = Number(legacy.popularity) || 0;
  if (!sb.weakness && legacy.weakpoint) sb.weakness = Number(legacy.weakpoint) || 0;
  if (!sb.weakPoint && typeof legacy.weakness === "string") sb.weakPoint = legacy.weakness;
  if (!sb.initiative && legacy.preemptive) sb.initiative = Number(legacy.preemptive) || 0;
  for (const k of ["intelligence", "perception", "monsterType"]) if (!sb[k] && legacy[k === "monsterType" ? "type" : k]) sb[k] = legacy[k === "monsterType" ? "type" : k];
  if (!sb.disposition && legacy.reaction) sb.disposition = legacy.reaction;
  if (!sb.soulscars && legacy.impurity) sb.soulscars = Number(legacy.impurity) || 0;
  sb.languages = splitList(sb.languages).length ? splitList(sb.languages) : splitList(legacy.language ?? legacy.langage);
  sb.habitat = splitList(sb.habitat).length ? splitList(sb.habitat) : splitList(legacy.habitat);
  if (!sb.coreParts && legacy.corepart) sb.coreParts = legacy.corepart;
  // movement: object wins, else legacy movementSpeed / move string; mirror movementSpeed = ground
  const m = sbIn?.movement && Object.values(sbIn.movement).some((x) => x !== null && x !== "") ? sbIn.movement : (sb.movementSpeed ?? legacy.move ?? null);
  sb.movement = parseMovement(m);
  sb.movementSpeed = sb.movement.ground;
  // check pairs: fixed = value + 7 unless locked
  const locked = [];
  const ov = sb.overrides ?? {};
  const pair = (base, x) => {
    if (x == null) return null;
    const p = typeof x === "object" ? { value: num(x.value) ?? 0, fixed: num(x.fixed) } : { value: Number(x) || 0, fixed: null };
    const v = overrideFor(ov, `${base}.value`, p.value); if (v.overridden) locked.push(`${base}.value`);
    const f = overrideFor(ov, `${base}.fixed`, v.value + 7); if (f.overridden) locked.push(`${base}.fixed`);
    return { value: v.value, fixed: f.value };
  };
  sb.fortitude = pair("fortitude", sb.fortitude ?? 0);
  sb.willpower = pair("willpower", sb.willpower ?? 0);
  sb.parts = arr(sb.parts).map((p, i) => {
    const q = Object.assign(PART_DEFAULTS(), p);
    q.count = Math.max(1, Number(q.count) || 1);
    q.accuracy = pair(`parts.${i}.accuracy`, q.accuracy);
    q.evasion = pair(`parts.${i}.evasion`, q.evasion);
    for (const k of ["defense", "hp", "mp"]) { const r = overrideFor(ov, `parts.${i}.${k}`, num(q[k])); if (r.overridden) locked.push(`parts.${i}.${k}`); q[k] = r.value; }
    q._hpAuto = q.hpValue == null || q.hpValue === ""; q._mpAuto = q.mpValue == null || q.mpValue === "";
    if (q._hpAuto) q.hpValue = q.hp; if (q._mpAuto) q.mpValue = q.mp;
    return q;
  });
  if (sb.parts.length && !sb.parts.some((p) => p.isCore)) sb.parts[0].isCore = sb.parts.length === 1;
  sb.partCount = sb.parts.reduce((a, p) => a + p.count, 0) || 1;
  if (!sb.coreParts) sb.coreParts = sb.parts.filter((p) => p.isCore).map((p) => p.name).join(", ");
  for (const k of ["level", "reputation", "weakness", "initiative", "soulscars", "swordShards", "movement.ground", "movement.other"]) {
    const r = overrideFor(ov, k, num(get(sb, k))); if (r.overridden) locked.push(k); set(sb, k, r.value);
  }
  // Sword Shards (monsters only, derived; CRB I p.384)
  applyShards(sb, type === "npc" ? 0 : sb.swordShards, locked);
  sb.loot = arr(sb.loot).map((l) => ({ roll: "", min: null, max: null, always: /^always$/i.test(String(l.roll ?? "")), item: "", price: null, materialCard: null, ...l }));
  sb.uniqueSkills = arr(sb.uniqueSkills).map((u) => ({ name: "", tags: [], part: null, check: null, resist: null, resistResult: null, magic: null, description: "", ...u }));
  sb.locked = locked;
  return sb;
}

/** Token disposition from the stat block. Returns a CONST.TOKEN_DISPOSITIONS key. */
export function dispositionFor(sb, type) {
  const a = String((type === "npc" ? sb.attitude : sb.disposition) ?? "").toLowerCase();
  if (type === "npc") { if (sb.hostile) return "HOSTILE"; return a === "neutral" ? "NEUTRAL" : a === "hostile" ? "HOSTILE" : "FRIENDLY"; }
  // Monsters: the Hostile toggle always wins; the Lore "Disposition" text is descriptive only.
  return sb.neutral ? "NEUTRAL" : "HOSTILE";
}

/** NPC Hostile / Fellow toggles -> token disposition key (CrestedEcho 2026-10-25):
 * Hostile ON -> Hostile; otherwise Fellow ON -> Friendly; otherwise Neutral. */
/** Monster Hostile toggle (default ON): OFF -> Neutral. Stored inverted as sb.neutral so existing monsters stay Hostile. */
export const monsterToggleDisposition = ({ neutral = false } = {}) => (neutral ? "NEUTRAL" : "HOSTILE");
/** Hostile toggle state for either actor type. */
export const isHostileToggle = (sb, type) => (type === "npc" ? !!sb?.hostile : !sb?.neutral);
export const npcToggleDisposition = ({ hostile = false, fellow = false } = {}) => (hostile ? "HOSTILE" : fellow ? "FRIENDLY" : "NEUTRAL");
export const DISPOSITION_LABELS = { "-2": "Secret", "-1": "Hostile", 0: "Neutral", 1: "Friendly" };

/** Writer monster/NPC JSON -> {name, type, system.sb} (unknown fields remain in the caller's flags). */
export function statBlockFromData(d) {
  const sb = {}; const keys = Object.keys(STAT_DEFAULTS());
  for (const k of keys) if (d[k] !== undefined) sb[k] = d[k];
  if (d.weakPoint === undefined && d.weakpoint) sb.weakPoint = d.weakpoint;
  if (d.movement === undefined && d.movementSpeed !== undefined) sb.movement = parseMovement(d.movementSpeed);
  // Import only: seed the monster Hostile toggle from the Lore Disposition text once; afterwards the toggle wins.
  if (sb.neutral === undefined && /^(neutral|friendly)$/i.test(String(sb.disposition ?? "").trim())) sb.neutral = true;
  return sb;
}
