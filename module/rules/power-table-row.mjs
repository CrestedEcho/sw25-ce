/* sw25-ce: the 21-slot power-table array the damage roll reads (see helpers/powerroll.mjs PT). PURE.
 * Slots 3..12 come straight from item.system.pt3..pt12; slot 13 is the bonus (powerbase) exactly once. */
export function buildPowerTable(sys, m = {}) {
  return [sys.power, sys.totalcvalue, 0,
    sys.pt3, sys.pt4, sys.pt5, sys.pt6, sys.pt7, sys.pt8, sys.pt9, sys.pt10, sys.pt11, sys.pt12,
    sys.powerbase, m.halfpow ?? 0, m.halfpowmod ?? 0, m.lethaltech ?? 0, m.criticalray ?? 0, m.pharmtool ?? 0, m.powup ?? 0, m.powmod ?? 0];
}
const blank = (v) => v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) || Number(v) === 0;
/** True when a weapon has a power but no own table rows (e.g. a world copy made by an old compendium build). */
export function missingOwnRows(sys) {
  if (!sys || sys.power === null || sys.power === undefined || sys.power === "") return false;
  for (let i = 3; i <= 12; i++) if (!blank(sys[`pt${i}`])) return false;
  return true;
}
