/** Pure belt / consumable logic (no Foundry globals) — shared by PC and stat-block sheets; unit-tested. */
export const slotsArray = (s) => (Array.isArray(s) ? [...s] : Object.values(s ?? {}));

/** Tick/untick an item on the belt. Returns { slots, changed, full }. */
export function toggleBeltSlot(slots, id, on, n, item) {
  const b = slotsArray(slots);
  if (on && item !== undefined && !isConsumable(item)) return { slots: b, changed: false, full: false, rejected: true };
  if (!on) { const out = b.map((x) => (x === id ? "" : x)); return { slots: out, changed: out.some((x, i) => x !== b[i]), full: false }; }
  if (b.includes(id)) return { slots: b, changed: false, full: false };
  while (b.length < n) b.push("");
  const free = b.slice(0, n).findIndex((x) => !x);
  if (free < 0) return { slots: b, changed: false, full: true };
  b[free] = id; return { slots: b, changed: true, full: false };
}

/** Only items of type "consumable" may sit on the belt or be used up. Everything else (incl. type "item") is permanent. */
export const isConsumable = (it) => it?.type === "consumable";
/** Consumable that tracks uses (Has limited uses ticked). */
export const isLimited = (it) => isConsumable(it) && !!it.system?.limitedUses;

/** Drop belt entries whose item is missing or not a consumable. `getItem(id)` -> item|undefined. Returns { slots, changed }. */
export function sanitizeBelt(slots, getItem) {
  const b = slotsArray(slots);
  const out = b.map((id) => (id && isConsumable(getItem(id)) ? id : ""));
  return { slots: out, changed: out.some((x, i) => x !== (b[i] ?? "")) };
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
  // Non-consumables and unlimited consumables never decrement or delete: Use just posts the card / rolls.
  if (!isLimited(it)) return { ok: !!it, left: null, delete: false, update: null, consumes: false };
  const u = usesOf(it);
  if (u.value <= 0) return { ok: false, left: 0, delete: false, update: null, consumes: true };
  const left = u.value - 1;
  if (left <= 0) return { ok: true, left: 0, delete: true, update: null, consumes: true };
  return { ok: true, left, delete: false, update: u.mode === "uses" ? { "system.uses.value": left } : { "system.quantity": left }, consumes: true };
}

/** Does the consumable carry a rollable formula (check dice 0-3 or a power roll)? */
export function hasFormula(it) {
  const s = it.system ?? {};
  return !!(s.usedice || s.usedice1 || s.usedice2 || s.usedice3 || s.usepower);
}

/** Click-to-assign picker rows: consumables in `items` that are not already on the belt. Each row: { id, name, img, left, max, unlimited }. */
export function beltPickList(items, slots) {
  const on = new Set(slotsArray(slots).filter(Boolean));
  return [...(items ?? [])].filter((it) => isConsumable(it) && !on.has(it.id ?? it._id))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((it) => { const lim = isLimited(it); const u = usesOf(it); return { id: it.id ?? it._id, name: it.name, img: it.img, unlimited: !lim, left: lim ? u.value : null, max: lim ? u.max : null }; });
}

/** Put `id` into belt slot `idx` (moving it if it already sits elsewhere). Returns new slots array. */
export function assignBeltSlot(slots, idx, id) {
  const b = slotsArray(slots).map((x) => (x === id ? "" : x));
  while (b.length <= idx) b.push("");
  b[idx] = id; return b;
}
