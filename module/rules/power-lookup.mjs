/**
 * sw25-ce: power table lookup (pure). Order per Power:
 *   1. the world's "Reference Power Table" journal row, when that row is filled (any non-zero value);
 *   2. the bundled unofficial community power table (module/data/power-table.mjs);
 *   3. nothing -> { value: 0, source: null } (caller warns).
 * A natural 2 (total <= 2) is always 0 damage (automatic failure), never a table lookup.
 */
import { POWER_TABLE } from "../data/power-table.mjs";

/** A journal row counts only when it has 10 entries (totals 3..12) and at least one non-zero number. */
export function journalRowFilled(row) {
  return Array.isArray(row) && row.length >= 10 && row.every((x) => x !== "" && x != null && Number.isFinite(Number(x))) && row.some((x) => Number(x) !== 0);
}

export function powerLookup(power, total, { journal = null, bundled = POWER_TABLE } = {}) {
  const t = Math.min(12, Math.floor(Number(total)));
  if (!(t > 2)) return { value: 0, source: "natural2" };
  const p = Math.floor(Number(power));
  if (!Number.isFinite(p)) return { value: 0, source: null };
  const j = journal?.[p] ?? journal?.[String(p)];
  if (journalRowFilled(j)) return { value: Number(j[t - 3]), source: "journal" };
  const b = bundled?.[p];
  if (Array.isArray(b) && Number.isFinite(Number(b[t - 3]))) return { value: Number(b[t - 3]), source: "bundled" };
  return { value: 0, source: null };
}
