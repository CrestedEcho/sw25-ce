/* sw25-ce: the one place a weapon's critical value is worked out (sheet tile, power table and damage card). PURE.
 * base = weapon cvalue (0/blank -> 10), efcmod = effect modifier, classMod = class rule (e.g. Fencer -1).
 * Class rules can't push it below 8; effects keep their old behaviour. */
export function weaponCritValue(cvalue, efcmod = 0, classMod = 0) {
  const base = Number(cvalue) || 10;
  let v = base + (Number(efcmod) || 0);
  if (classMod) v = Math.max(8, v + Number(classMod));
  return v;
}
