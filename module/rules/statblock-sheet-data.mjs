/**
 * Pure helpers for the styled NPC / Monster stat-block sheet (no Foundry globals; unit-tested).
 * View model built from the derived sbView (prepareStatBlock) + raw system.sb (for edit values).
 */
const SYS = "sw25-ce";
export const ICON_ROOT = `systems/${SYS}/assets/icons`;
export const QUILL = `systems/${SYS}/assets/ui/override-quill.webp`;
export const ARRAY_FIELDS = ["parts", "uniqueSkills", "loot", "classLevels", "relationships", "services"];

/** monsterType (book category, any case/spelling) -> `_type-<slug>` icon slug. */
const TYPE_SLUGS = { barbarous: "barbarous", animal: "animal", plant: "plant", undead: "undead", construct: "construct", golem: "golem",
  magitech: "magitech", mythicalbeast: "mythical", mythical: "mythical", daemon: "daemon", demon: "daemon", humanoid: "humanoid", fairy: "fairy", fae: "fairy" };
export function monsterTypeIcon(t) {
  const slug = TYPE_SLUGS[String(t ?? "").toLowerCase().replace(/[^a-z]/g, "")];
  return slug ? `${ICON_ROOT}/monsters/_type-${slug}.webp` : null;
}

/** Unique-skill tag glyphs (CR I p393); icon where the Artist set has one. */
export const SKILL_TAGS = {
  passive: { glyph: "◯", label: "Passive", icon: `${ICON_ROOT}/ui/tag-passive.webp` },
  major: { glyph: "►", label: "Major action", icon: `${ICON_ROOT}/ui/tag-major.webp` },
  minor: { glyph: "⏩", label: "Minor action", icon: `${ICON_ROOT}/ui/tag-minor.webp` },
  prep: { glyph: "△", label: "Preparation", icon: `${ICON_ROOT}/ui/tag-prep.webp` },
  declared: { glyph: "🗨", label: "Declared", icon: `${ICON_ROOT}/ui/tag-declared.webp` },
};

const list = (v) => (Array.isArray(v) ? v.filter((x) => x !== "" && x != null).join(", ") : String(v ?? ""));
const dash = (v) => (v === null || v === undefined || v === "" ? "—" : v);

/** Tab order: NPC Person|Combat|Inventory|Notes (hostile -> Combat first); monster Combat|Lore|Notes. */
export function sheetTabs(type, hostile) {
  if (type !== "npc") return ["combat", "lore", "notes"];
  return hostile ? ["combat", "person", "inventory", "notes"] : ["person", "combat", "inventory", "notes"];
}

/** Accent: NPC teal, monster + hostile NPC rust. */
export const accentFor = (type, hostile) => (type === "npc" && !hostile ? "teal" : "rust");

/** "Guard Captain, Harvesgard · Lv 6" / "Lv 1 · Barbarous". */
export function roleLine(type, sb) {
  if (type === "npc") return [[sb.title, sb.settlement || sb.faction].filter(Boolean).join(", "), `Lv ${sb.level ?? 1}`].filter(Boolean).join(" · ");
  return [`Lv ${sb.level ?? 1}`, sb.monsterType].filter(Boolean).join(" · ");
}

/** Build the template context. view = system.sbView, raw = system.sb source. */
export function buildStatBlockContext({ type, view = {}, raw = {}, isGM = false, img = "", classNames = {} }) {
  const hostile = type === "npc" && !!view.hostile;
  const locked = new Set(view.locked ?? []);
  const rawParts = Array.isArray(raw.parts) ? raw.parts : Object.values(raw.parts ?? {});
  const num = (path, value, base) => ({ path, value: dash(value), edit: locked.has(path) ? value : (base ?? value ?? ""), locked: locked.has(path) });
  const pair = (path, p, rawP) => (p ? { value: num(`${path}.value`, p.value, rawP?.value ?? p.value), fixed: p.fixed, fixedLocked: locked.has(`${path}.fixed`) } : null);
  const parts = (view.parts ?? []).map((p, i) => ({
    i, name: p.name, count: p.count, isCore: p.isCore, damage: p.damage ?? "",
    accuracy: pair(`parts.${i}.accuracy`, p.accuracy, rawParts[i]?.accuracy),
    evasion: pair(`parts.${i}.evasion`, p.evasion, rawParts[i]?.evasion),
    defense: num(`parts.${i}.defense`, p.defense, rawParts[i]?.defense),
    hp: num(`parts.${i}.hp`, p.hp, rawParts[i]?.hp), hpValue: p.hpValue,
    mp: num(`parts.${i}.mp`, p.mp, rawParts[i]?.mp), mpValue: p.mpValue,
    dead: p.hp > 0 && Number(p.hpValue) <= 0,
  }));
  const skills = (view.uniqueSkills ?? []).map((u, i) => ({
    i, name: u.name, part: u.part, description: u.description ?? "",
    tags: (u.tags ?? []).map((t) => ({ key: t, ...(SKILL_TAGS[t] ?? { glyph: "·", label: t }) })),
    check: u.check ? `${u.check.value}(${u.check.fixed ?? u.check.value + 7})` : "",
    resist: u.resist ? `${u.resist}${u.resistResult ? ` / ${u.resistResult}` : ""}` : "",
  }));
  const loot = (view.loot ?? []).map((l, i) => ({ i, roll: l.always ? "Always" : l.roll, item: l.item, price: l.price, materialCard: l.materialCard ?? "", always: l.always }));
  const tabs = sheetTabs(type, hostile);
  const mv = view.movement ?? {};
  const fmtMove = (v, m) => (v == null ? "—" : `${v}${m ? ` (${m})` : ""}`);
  const classLevels = (raw.classLevels ?? []).map((c) => `${classNames[c.classSlug] ?? (c.classSlug ? c.classSlug[0].toUpperCase() + c.classSlug.slice(1) : "?")} ${c.level ?? ""}`.trim());
  // Calm-NPC Person summary: Lv / HP / MP / Def from the main part. Inputs carry data-sb-path (no name),
  // so the Combat-tab part inputs remain the only form fields for that path (single source of truth).
  const ci = Math.max(0, (view.parts ?? []).findIndex((p) => p.isCore));
  const cp = (view.parts ?? [])[ci];
  const pct = (v, m) => (m > 0 ? Math.max(0, Math.min(100, Math.round((Number(v ?? m) / m) * 100))) : 0);
  const summary = type === "npc" && cp ? {
    level: view.level ?? "—", def: cp.defense ?? "—",
    hp: cp.hpValue ?? cp.hp, hpMax: cp.hp ?? 0, hpPct: pct(cp.hpValue, cp.hp), hpPath: `system.sb.parts.${ci}.hpValue`,
    mp: cp.mpValue ?? cp.mp, mpMax: cp.mp ?? 0, mpPct: pct(cp.mpValue, cp.mp), mpPath: `system.sb.parts.${ci}.mpValue`,
  } : null;
  return {
    summary,
    type, isNPC: type === "npc", isMonster: type !== "npc", hostile, isGM,
    accent: accentFor(type, hostile), roleLine: roleLine(type, view),
    typeIcon: type === "npc" ? null : monsterTypeIcon(view.monsterType), portrait: img,
    tabs: tabs.map((t, n) => ({ key: t, label: t[0].toUpperCase() + t.slice(1), first: n === 0 })), initialTab: tabs[0],
    quill: QUILL, sb: view, raw,
    stats: {
      level: num("level", view.level, raw.level), reputation: num("reputation", view.reputation, raw.reputation),
      weakness: num("weakness", view.weakness, raw.weakness), initiative: num("initiative", view.initiative, raw.initiative),
      soulscars: num("soulscars", view.soulscars, raw.soulscars), swordShards: num("swordShards", view.swordShards, raw.swordShards),
      fortitude: pair("fortitude", view.fortitude, raw.fortitude), willpower: pair("willpower", view.willpower, raw.willpower),
      moveGround: num("movement.ground", mv.ground, raw.movement?.ground), moveOther: num("movement.other", mv.other, raw.movement?.other),
      movementText: `${fmtMove(mv.ground, mv.groundMode)} / ${fmtMove(mv.other, mv.otherMode)}`,
    },
    languages: list(view.languages), habitat: list(view.habitat), classLevels: classLevels.join(", "),
    parts, showSections: (view.partCount ?? 1) > 1, skills, loot,
    relationships: (raw.relationships ?? []).map((r, i) => ({ i, ...r })), services: (raw.services ?? []).map((s, i) => ({ i, ...s })),
    // NPC knowledge fields hidden when empty (spec §4)
    showIntel: type !== "npc" || !!view.intelligence, showPerception: type !== "npc" || !!view.perception, showSoulscars: type !== "npc" ? true : !!view.soulscars,
  };
}

/**
 * Turn flat form data into an actor update:
 * - `system.sb.<arr>.<i>.<k>` keys are folded into whole arrays (Foundry would otherwise turn them into objects);
 * - numeric fields whose path is locked write `system.sb.overrides.<path>.value` instead of the base value.
 */
export function foldSubmitData(flat, raw = {}, lockedPaths = []) {
  const out = {}; const arrays = {}; const locked = new Set(lockedPaths);
  for (const [k, v] of Object.entries(flat)) {
    const m = k.match(/^system\.sb\.([A-Za-z]+)\.(\d+)\.(.+)$/);
    if (m && ARRAY_FIELDS.includes(m[1])) {
      const [, field, idx, sub] = m; const path = `${field}.${idx}.${sub}`;
      if (locked.has(path)) { out[`system.sb.overrides.${path}.value`] = v; continue; }
      arrays[field] ??= structuredClone(Array.isArray(raw[field]) ? raw[field] : Object.values(raw[field] ?? {}));
      const row = (arrays[field][Number(idx)] ??= {});
      setPath(row, sub, sub === "tags" && typeof v === "string" ? v.split(/[,\s]+/).filter(Boolean) : v);
      continue;
    }
    const s = k.match(/^system\.sb\.(.+)$/);
    if (s && locked.has(s[1])) { out[`system.sb.overrides.${s[1]}.value`] = v; continue; }
    out[k] = v;
  }
  for (const [f, a] of Object.entries(arrays)) out[`system.sb.${f}`] = a;
  return out;
}
function setPath(o, p, v) { const ks = p.split("."); let a = o; for (const k of ks.slice(0, -1)) { if (a[k] == null || typeof a[k] !== "object") a[k] = {}; a = a[k]; } a[ks.at(-1)] = v; }

/** New blank rows for "+" buttons. */
export const NEW_ROWS = {
  parts: () => ({ name: "New part", count: 1, accuracy: { value: 0 }, damage: "2d", evasion: { value: 0 }, defense: 0, hp: 10, hpValue: null, mp: null, mpValue: null, isCore: false }),
  uniqueSkills: () => ({ name: "New skill", tags: ["passive"], description: "" }),
  loot: () => ({ roll: "2-7", min: 2, max: 7, always: false, item: "", price: null, materialCard: null }),
  relationships: () => ({ name: "", relation: "" }),
  services: () => ({ name: "", price: null, notes: "" }),
  classLevels: () => ({ classSlug: "", level: 1 }),
};
