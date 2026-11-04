/**
 * sw25-ce: ability parts as numbers. New characters start with blank ("") race values (Technique/Body/Mind) and
 * A–F scores from template.json; adding those raw joined them as text ("" + 9 + 0 -> "90"), so class skill bases
 * came out in the hundreds or thousands until the sheet was saved. Blank, null or invalid counts as 0.
 */
export function abNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
