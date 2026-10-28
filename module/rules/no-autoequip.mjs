/**
 * Gear added to an actor is never auto-equipped; players decide (Echo, ce.17).
 * Compendium/world gear often has system.equip=true saved (old template default), so any
 * weapon/armor/accessory created on an existing actor (sheet drop, compendium, sidebar,
 * "create item", class grants, actor-to-actor) arrives unequipped.
 * Exception: a deliberate drop onto an equipment-card slot equips it afterwards via equipToSlot.
 * Items already owned keep their state (only preCreate is touched); actors created/imported
 * with embedded items keep theirs too.
 */
export const GEAR_TYPES = ["weapon", "armor", "accessory"];

/** Pure: should this new embedded item be forced to equip=false? */
export function shouldUnequipOnCreate({ type, equip, parentPersisted, keepEquip }) {
  return GEAR_TYPES.includes(type) && equip === true && !!parentPersisted && !keepEquip;
}

export function registerNoAutoEquip() {
  Hooks.on("preCreateItem", (item, data, options) => {
    const actor = item.parent;
    if (!(actor instanceof Actor)) return;
    // unlinked token actors are persisted via their token; world actors must already exist
    const parentPersisted = actor.isToken || !!(actor.id && game.actors?.has(actor.id));
    if (shouldUnequipOnCreate({ type: item.type, equip: item.system?.equip, parentPersisted, keepEquip: options?.sw25KeepEquip })) {
      item.updateSource({ "system.equip": false });
    }
  });
}
