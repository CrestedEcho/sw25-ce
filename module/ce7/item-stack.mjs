/**
 * Drop stacking: an Item dropped on a character sheet adds to the quantity of an owned item with the
 * same name, type, price and (for monster loot) material card, instead of creating a second copy.
 * Only quantity-bearing, non-equippable types stack; weapons, armour and accessories never do.
 * Pure helpers (no Foundry globals) so they can be tested in node.
 */
export const STACKABLE_TYPES = new Set(["item", "consumable", "resource"]);

const norm = (v) => (v == null ? "" : String(v).trim());
/** Material card for loot: flags["sw25-ce"].data.materialCard (monster loot) or system.materialCard if a type has one. */
export const cardOf = (it) => norm(it?.flags?.["sw25-ce"]?.data?.materialCard ?? it?.system?.materialCard);
export const qtyOf = (it) => { const q = Number(it?.system?.quantity); return Number.isFinite(q) && q > 0 ? q : 1; };

/** Same stack? name + type + price + card must all match. */
export const sameStack = (a, b) => !!a && !!b && STACKABLE_TYPES.has(a.type) && a.type === b.type
  && norm(a.name) === norm(b.name) && norm(a.system?.price) === norm(b.system?.price) && cardOf(a) === cardOf(b);

/**
 * @param {object[]} owned   the actor's items (documents or plain data)
 * @param {object} src       dropped item data (toObject())
 * @param {{shiftKey?: boolean, sameActor?: boolean}} opts
 * @returns {{id: string, update: object}|null}  quantity update for the existing item, or null to create normally
 */
export function stackPlan(owned, src, { shiftKey = false, sameActor = false } = {}) {
  if (shiftKey || sameActor || !STACKABLE_TYPES.has(src?.type)) return null;
  const hit = [...(owned ?? [])].find((i) => sameStack(i, src));
  if (!hit) return null;
  return { id: hit.id ?? hit._id, update: { "system.quantity": qtyOf(hit) + qtyOf(src) } };
}
