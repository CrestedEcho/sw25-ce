/**
 * sw25-ce: which new attack-flow card a weapon click should open (pure, no Foundry globals).
 * Weapons on a character sheet used to roll the old chat output from the Weapons list
 * (Check / Power buttons, the item image, and the item chat card's buttons).
 * They now go to the same cards as the Accuracy / Damage tiles:
 *   "attack" -> attack card (Accuracy / Evasion / Damage buttons),  "damage" -> damage card (power lookup + Apply).
 * null = keep the old behaviour (not a character's weapon, or another kind of click).
 */
const ATTACK = new Set(["check", "dice", "buttoncheck"]);
const DAMAGE = new Set(["power", "buttonpower"]);

export function weaponRoute(actor, item, kind) {
  if (actor?.type !== "character" || item?.type !== "weapon") return null;
  if (ATTACK.has(kind)) return "attack";
  if (DAMAGE.has(kind)) return "damage";
  return null;
}
