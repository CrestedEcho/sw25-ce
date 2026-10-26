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

/** Stack size (system.quantity; unset/invalid -> 1). */
export const qtyOf = (it) => { const q = Number(it?.system?.quantity); return Number.isFinite(q) && it?.system?.quantity !== "" && it?.system?.quantity != null ? Math.max(0, Math.floor(q)) : 1; };

/**
 * Plan for consuming one use: { ok, left, qty, delete, update, consumes }.
 * - Limited with per-item uses (uses.max > 0): spend a use; when the last use of one item is spent and
 *   quantity > 1, take one off the stack and refill uses (stays on the belt). Delete only on the last item.
 * - Limited without uses.max, or not limited: each use takes one off quantity; delete at 0.
 */
export function consumePlan(it) {
  if (!isConsumable(it)) return { ok: !!it, left: null, qty: null, delete: false, update: null, consumes: false };
  const q = qtyOf(it);
  const um = Number(it.system?.uses?.max) || 0;
  if (isLimited(it) && um > 0) {
    const v = Math.min(Number(it.system.uses?.value) || 0, um);
    if (v <= 0 && q <= 1) return { ok: false, left: 0, qty: q, delete: false, update: null, consumes: true };
    if (v <= 0) return { ok: true, left: um - 1, qty: q - 1, delete: false, consumes: true, update: um - 1 > 0 ? { "system.quantity": q - 1, "system.uses.value": um - 1 } : { "system.quantity": q - 1, "system.uses.value": um } };
    const left = v - 1;
    if (left > 0) return { ok: true, left, qty: q, delete: false, update: { "system.uses.value": left }, consumes: true };
    if (q > 1) return { ok: true, left: um, qty: q - 1, delete: false, update: { "system.quantity": q - 1, "system.uses.value": um }, consumes: true };
    return { ok: true, left: 0, qty: 0, delete: true, update: null, consumes: true };
  }
  if (q <= 0) return { ok: false, left: 0, qty: 0, delete: false, update: null, consumes: true };
  const nq = q - 1;
  if (nq <= 0) return { ok: true, left: 0, qty: 0, delete: true, update: null, consumes: true };
  return { ok: true, left: nq, qty: nq, delete: false, update: { "system.quantity": nq }, consumes: true };
}

/** Short stack label: "x1000 · 2/2 uses", "x3", "2/2 uses" (x1 omitted). */
export function stackLabel(it) {
  const q = qtyOf(it); const um = Number(it?.system?.uses?.max) || 0;
  const uses = isLimited(it) && um > 0 ? `${Math.min(Number(it.system.uses?.value) || 0, um)}/${um} uses` : "";
  const qs = q !== 1 || !uses ? `x${q}` : "";
  return [qs, uses].filter(Boolean).join(" · ");
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
    .map((it) => { const lim = isLimited(it); const u = usesOf(it); return { id: it.id ?? it._id, name: it.name, img: it.img, unlimited: !lim, left: lim ? u.value : null, max: lim ? u.max : null, stack: stackLabel(it) }; });
}

/** Put `id` into belt slot `idx` (moving it if it already sits elsewhere). Returns new slots array. */
export function assignBeltSlot(slots, idx, id) {
  const b = slotsArray(slots).map((x) => (x === id ? "" : x));
  while (b.length <= idx) b.push("");
  b[idx] = id; return b;
}
