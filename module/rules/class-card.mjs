/**
 * sw25-ce: view model for the Classes card on the PC sheet (Classes & Feats tab).
 *
 * Pure (no Foundry globals) so it can be unit tested. The sheet passes game.i18n.localize in.
 * Every number on the card is a die button; each one carries a breakdown that always adds up to the
 * value shown: Class level + Stat bonus [+ Mod] [+ Effects] = total. The stat bonus is the remainder,
 * so whatever the item/actor derivation (rule engine, effects) produced, the tooltip matches the button.
 */

export const CLASS_CARD_STATS = [
  { key: "dex", icon: "dex", long: "SW25.Ability.Dex.long", abbr: "SW25.Ability.Dex.abbr" },
  { key: "agi", icon: "agi", long: "SW25.Ability.Agi.long", abbr: "SW25.Ability.Agi.abbr" },
  { key: "str", icon: "str", long: "SW25.Ability.Str.long", abbr: "SW25.Ability.Str.abbr" },
  { key: "vit", icon: "vit", long: "SW25.Ability.Vit.long", abbr: "SW25.Ability.Vit.abbr" },
  { key: "int", icon: "int", long: "SW25.Ability.Int.long", abbr: "SW25.Ability.Int.abbr" },
  { key: "mnd", icon: "mnd", long: "SW25.Ability.Mnd.long", abbr: "SW25.Ability.Mnd.abbr" },
];

/** Class name -> icon in assets/icons (English and Japanese names). Unknown classes get the generic skill icon. */
const CLASS_ICONS = [
  [/fighter|grappler|fencer|battle ?dancer|ファイター|グラップラー|フェンサー|バトルダンサー/i, "fighter"],
  [/shooter|marksman|シューター/i, "accuracy"],
  [/artificer|magitech|マギテック/i, "magitech"],
  [/sorcerer|ソーサラー|sage|セージ/i, "truespeech"],
  [/conjurer|コンジャラー/i, "spiritualism"],
  [/wizard|ウィザード|daemon|demon|デーモン|abyss|アビス/i, "spell"],
  [/priest|プリースト|geomancer|ジオマンサー/i, "divination"],
  [/fairy|フェアリー/i, "fairy"],
  [/druid|ドルイド/i, "growth"],
  [/scout|スカウト/i, "evasion"],
  [/ranger|レンジャー/i, "hp"],
  [/enhancer|エンハンサー|war ?leader|ウォーリーダー/i, "combatability"],
  [/bard|バード/i, "mnd"],
  [/rider|ライダー/i, "agi"],
  [/alchemist|アルケミスト/i, "alchemy"],
  [/dark ?hunter|ダークハンター/i, "weapon"],
];

export function classIconFor(name) {
  const n = String(name ?? "");
  for (const [re, icon] of CLASS_ICONS) if (re.test(n)) return icon;
  return "skill";
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** "+1", "-2", "" for zero/empty. */
export function signed(v) {
  const n = num(v);
  if (!n) return "";
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * Breakdown of one die button. Parts always sum to total.
 * @returns {{total:number, parts:{label:string, value:number, op:string, abs:number}[], formula:string}}
 */
export function cellBreakdown({ total, level, mod = 0, effects = 0, levelLabel, statLabel }) {
  const t = num(total), lv = num(level), m = num(mod), e = num(effects);
  const bonus = t - lv - m - e;
  const raw = [
    { label: levelLabel, value: lv, always: true },
    { label: statLabel, value: bonus, always: true },
    { label: "mod", value: m },
    { label: "effects", value: e },
  ].filter((p) => p.always || p.value);
  const parts = raw.map((p, i) => ({ label: p.label, value: p.value, abs: Math.abs(p.value), op: i === 0 ? (p.value < 0 ? "−" : "") : (p.value < 0 ? "−" : "+") }));
  return { total: t, parts, formula: `2d6 + ${t}` };
}

function checkChip(c) {
  const s = c.system ?? {};
  return {
    id: c._id, name: c.name, power: s.checkmethod === "power",
    formula: s.formula, checkbase: s.checkbase, powertable: s.powertable,
    applypower: s.applypower, powerTypesButton: s.powerTypesButton,
    applycheck: s.applycheck, checkTypesButton: s.checkTypesButton,
  };
}

/**
 * @param {object} o
 * @param {object} o.system   actor system data (prepared)
 * @param {object[]} o.skills class (skill) items, already sorted
 * @param {object[]} o.checks check items
 * @param {(k:string)=>string} [o.localize]
 */
export function buildClassCard({ system = {}, skills = [], checks = [], localize = (k) => k } = {}) {
  const L = (k) => localize(k);
  const bonusWord = L("SW25.V2.ClassCard.Bonus");
  const statLabel = (st) => `${L(st.long)} ${bonusWord}`;
  const labels = { mod: L("SW25.V2.ClassCard.Mod"), effects: L("SW25.V2.ClassCard.Effects") };
  const fixLabels = (b) => { for (const p of b.parts) if (labels[p.label] && (p.label === "mod" || p.label === "effects")) p.label = labels[p.label]; return b; };

  const attrs = system.attributes ?? {};
  const abilities = system.abilities ?? {};
  const used = num(attrs.useexp), total = num(attrs.totalexp);
  const exp = { used, total, over: used > total, pct: total > 0 ? Math.max(0, Math.min(100, Math.round((used / total) * 100))) : 0 };

  const advLevel = num(attrs.advlevel?.value);
  const advMod = num(attrs.advlevel?.mod);
  const advEff = num(system.efallskadvmod) + num(system.efallscmod) + num(system.efallacmod);
  const advName = L("SW25.Attributes.Advlevel");
  const adv = {
    level: advLevel, mod: attrs.advlevel?.mod ?? 0, modSet: advMod !== 0,
    cells: CLASS_CARD_STATS.map((st) => ({
      ...st, statLong: L(st.long),
      ...fixLabels(cellBreakdown({ total: abilities[st.key]?.advbase, level: advLevel, mod: advMod, effects: advEff, levelLabel: advName, statLabel: statLabel(st) })),
      value: abilities[st.key]?.advbase,
    })),
    checks: checks.filter((c) => c.system?.checkskill === "adv").map(checkChip),
  };

  const rows = skills.map((item) => {
    const s = item.system ?? {};
    const level = num(s.skilllevel), mod = num(s.skillmod);
    const eff = num(s.efallskmod) + num(s.efallscmod) + num(s.efallacmod);
    return {
      id: item._id, name: item.name, level: s.skilllevel, mod: s.skillmod, modSet: mod !== 0, modText: signed(mod),
      icon: classIconFor(item.name),
      cells: CLASS_CARD_STATS.map((st) => ({
        ...st, statLong: L(st.long),
        ...fixLabels(cellBreakdown({ total: s.skillbase?.[st.key], level, mod, effects: eff, levelLabel: item.name, statLabel: statLabel(st) })),
        value: s.skillbase?.[st.key],
      })),
      checks: checks.filter((c) => c.system?.checkskill === item.name).map(checkChip),
    };
  });

  return {
    exp, adv, rows,
    stats: CLASS_CARD_STATS.map((st) => ({ ...st, longLabel: L(st.long), abbrLabel: L(st.abbr) })),
  };
}
