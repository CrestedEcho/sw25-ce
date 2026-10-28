/**
 * sw25-ce: spell MP cost helpers (pure).
 * Imported spells may carry only system.mpcost / mpcostText (no basempcost). Prepared data recomputes
 * mpcost = basempcost - reductions, so a missing base wiped the cost (0 -> clamped to 1).
 */
const blank = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const posNum = (v) => !blank(v) && Number.isFinite(Number(v)) && Number(v) > 0;

/** Base MP: a positive basempcost; else the stored source mpcost when positive; else a real 0; else null (blank / variable). */
export function baseMpCost(sys = {}, srcSys = {}) {
  if (posNum(sys?.basempcost)) return Number(sys.basempcost);
  if (posNum(srcSys?.mpcost)) return Number(srcSys.mpcost);
  const real0 = (v) => !blank(v) && Number(v) === 0;
  if (real0(sys?.basempcost) || real0(srcSys?.mpcost)) return 0;
  return null;
}

/** Final cost after reductions: min 1 only when the base is a real positive number; 0 stays 0; no base -> null. */
export function clampMpCost(base, reduced) {
  if (base == null) return null;
  if (!(base > 0)) return 0;
  const v = Number(reduced);
  return Number.isFinite(v) ? Math.max(1, v) : base;
}

/** True when the MP text is a variable cost (not a plain number), e.g. "X", "2+", "1-3". */
export function isVariableMpText(t) {
  return !blank(t) && !/^\s*\d+\s*$/.test(String(t));
}

/** Display/pay value from (prepared) system data: mpcost if set, else basempcost; "" when neither is set. */
export function spellMpValue(sys = {}) {
  if (!blank(sys?.mpcost) && Number.isFinite(Number(sys.mpcost))) return Number(sys.mpcost);
  if (!blank(sys?.basempcost) && Number.isFinite(Number(sys.basempcost))) return Number(sys.basempcost);
  return "";
}
