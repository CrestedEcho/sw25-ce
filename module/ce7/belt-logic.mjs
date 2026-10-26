/** Pure belt / consumable logic (no Foundry globals) — shared by PC and stat-block sheets; unit-tested. */
export const slotsArray = (s) => (Array.isArray(s) ? [...s] : Object.values(s ?? {}));

/** Tick/untick an item on the belt. Returns { slots, changed, full }. */
export function toggleBeltSlot(slots, id, on, n) {
  const b = slotsArray(slots);
  if (!on) { const out = b.map((x) => (x === id ? "" : x)); return { slots: out, changed: out.some((x, i) => x !== b[i]), full: false }; }
  if (b.includes(id)) return { slots: b, changed: false, full: false };
  while (b.length < n) b.push("");
  const free = b.slice(0, n).findIndex((x) => !x);
  if (free < 0) return { slots: b, changed: false, full: true };
  b[free] = id; return { slots: b, changed: true, full: false };
}

/** Uses source of truth: system.uses (if max > 0) else system.quantity. */
export function usesOf(it) {
  const um = Number(it.system?.uses?.max) || 0;
  if (um > 0) return { mode: "uses", value: Math.min(Number(it.system.uses.value) || 0, um), max: um };
  const q = Math.max(0, Number(it.system?.quantity) || 0);
  const qmax = Number(it.system?.qmax) || 0;
  return { mode: "qty", value: q, max: Math.max(q, qmax) };
}

/** Plan for consuming one use: { ok, left, delete, update }. Last use -> delete the item (and clear its belt slot). */
export function consumePlan(it) {
  const u = usesOf(it);
  if (u.value <= 0) return { ok: false, left: 0, delete: false, update: null };
  const left = u.value - 1;
  if (left <= 0) return { ok: true, left: 0, delete: true, update: null };
  return { ok: true, left, delete: false, update: u.mode === "uses" ? { "system.uses.value": left } : { "system.quantity": left } };
}

/** Does the consumable carry a rollable formula (check dice 0-3 or a power roll)? */
export function hasFormula(it) {
  const s = it.system ?? {};
  return !!(s.usedice || s.usedice1 || s.usedice2 || s.usedice3 || s.usepower);
}
