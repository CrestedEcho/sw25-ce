// Willpower, Fortitude and Evasion are checks the roller makes for themselves.
// They roll for the actor that owns the sheet or button and never pick, list or show targets.
// (Defense is a flat value, not a roll, so it is not covered here.)

const BASE = ["fortitude", "willpower", "evasion", "dodge", "生命抵抗力", "精神抵抗力", "回避力", "回避", "생명저항력", "정신저항력", "회피력"];
const KEYS = ["SW25.Config.ResVit", "SW25.Config.ResMnd", "SW25.Item.Armor.Dodge", "SW25.Resist.Check.Dodge", "SW25.Resist.Check.Vitres", "SW25.Resist.Check.Mndres"];

const norm = (s) => String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
  .replace(/\s*(check|roll|判定|판정)$/u, "").trim();

/** Localized names of the self checks, from the running game (if any). */
export function selfCheckNames(i18n = globalThis.game?.i18n) {
  const out = new Set(BASE);
  for (const k of KEYS) {
    const v = i18n?.localize?.(k);
    if (v && v !== k) out.add(norm(v));
  }
  return out;
}

/**
 * True when a roll label or item name is Willpower, Fortitude or Evasion.
 * Handles card labels like "Evasion (Fencer Check)/14", "Goblin (Evasion)",
 * "Straight Roll - Fortitude (Check)" and "Bob: Willpower". "Evasion Ring" is not a match.
 */
export function isSelfCheck(label, names = selfCheckNames()) {
  let s = String(label ?? "").replace(/<[^>]*>/g, " ").trim();
  if (!s) return false;
  s = s.split(/\s[-–—]\s|\n|[:：]\s*/u).map((x) => x.trim()).filter(Boolean).pop() ?? "";
  s = s.replace(/\s*\/\s*[\d\s/,]+$/u, "").trim();
  const m = s.match(/^(.*?)\s*[(（]([^()（）]*)[)）]\s*$/u);
  const parts = m ? [m[1], m[2]] : [s];
  return parts.some((p) => names.has(norm(p)));
}

/** Dataset / item helper: explicit data-selfcheck, or a matching label/name. */
export function isSelfCheckRoll({ dataset, label, item } = {}) {
  if (dataset && dataset.selfcheck !== undefined && dataset.selfcheck !== "false") return true;
  if (item && isSelfCheck(item.name)) return true;
  return isSelfCheck(label ?? dataset?.label);
}

/** Strip every target UI (live "Applies to" line, legacy "Target:" button, chips) from a rendered card. */
export function stripTargetUI(root) {
  root?.querySelectorAll?.('.sw25-live-targets, button.chat-target, .chat-target, .targetname, .target-chip')
    .forEach((el) => el.remove());
}

/**
 * Item check button / click: which = "" (plain check), "1", "2", "3", or "power".
 * Power (damage) rolls are never self checks.
 */
export function isSelfCheckItem(item, which = "", names = selfCheckNames()) {
  if (!item || which === "power") return false;
  if (isSelfCheck(item.name, names)) return true;
  const sub = which ? item.system?.[`label${which}`] : "";
  return !!sub && isSelfCheck(sub, names);
}
