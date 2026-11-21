/* sw25-ce: 1H / 2H stance switch (PURE, unit-tested).
 * A weapon has a second grip when system.altgrip.usage and system.altgrip.power are filled in.
 * Switching swaps the grip fields between the weapon and system.altgrip, so every existing
 * calculation (Accuracy tile, damage, attack card) simply reads the active grip. Data-driven only. */
export const GRIP_FIELDS = ["usage", "hit", "dmod", "power", "cvalue", "reqstr"];
const filled = (v) => v !== undefined && v !== null && String(v).trim() !== "";

export function hasAltGrip(sys = {}) {
  const a = sys.altgrip ?? {};
  return filled(a.usage) && filled(a.power) && String(a.usage) !== String(sys.usage ?? "");
}

/** "1H#" -> "1H"; anything starting with 2H-ish ("2H", "S2H", "P2H") -> "2H". */
export function gripShort(usage) {
  const u = String(usage ?? "");
  if (/2H/.test(u)) return "2H";
  if (/1H/.test(u)) return "1H";
  return u || "—";
}

/** View for the Weapons card: null when the weapon has only one grip. */
export function stanceView(sys = {}, label = gripShort) {
  if (!hasAltGrip(sys)) return null;
  const cur = { usage: sys.usage, short: gripShort(sys.usage), label: label(sys.usage), icon: `stance-${gripShort(sys.usage).toLowerCase()}`, active: true };
  const alt = { usage: sys.altgrip.usage, short: gripShort(sys.altgrip.usage), label: label(sys.altgrip.usage), icon: `stance-${gripShort(sys.altgrip.usage).toLowerCase()}`, active: false };
  const list = [cur, alt].sort((a, b) => a.short.localeCompare(b.short));
  return { options: list };
}

function gripValue(f, v) {
  if (f === "usage") return v == null ? "" : String(v);
  if (f === "reqstr") return v == null ? "" : v;
  if (!filled(v)) return f === "cvalue" ? 10 : 0;
  const n = Number(v); return Number.isFinite(n) ? n : (f === "cvalue" ? 10 : 0);
}

/** Update data that swaps the active grip with the stored one (null when there is nothing to switch to). */
export function gripSwapUpdate(sys = {}, wantUsage = null) {
  if (!hasAltGrip(sys)) return null;
  if (wantUsage != null && String(wantUsage) === String(sys.usage)) return null;
  const up = {};
  for (const f of GRIP_FIELDS) {
    up[`system.${f}`] = gripValue(f, sys.altgrip[f]);
    up[`system.altgrip.${f}`] = gripValue(f, sys[f]);
  }
  return up;
}
