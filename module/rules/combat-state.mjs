/* sw25-ce combat-state helpers. PURE (no Foundry globals).
 * Declarations (flags.sw25-ce.declare = { active:[slug], lingering:[slug] }):
 *  - declaring adds the slug to active (its attack-scoped rules apply) and lingering (its
 *    duration:1round risk rules apply);
 *  - a weapon damage roll consumes active (declarations default to ONE attack);
 *  - the actor's next turn start clears everything (duration:1round = until your next turn).
 */
export const SYS = "sw25-ce";

const uniq = (a) => [...new Set(a)];
export function declState(raw) {
  return { active: uniq([].concat(raw?.active ?? [])).map(String), lingering: uniq([].concat(raw?.lingering ?? [])).map(String) };
}
/** declared:<slug> tokens used by a rule list (array or object form). */
export function declaredSlugs(rules) {
  const list = Array.isArray(rules) ? rules : Object.values(rules ?? {});
  const out = [];
  for (const r of list) for (const t of [].concat(r?.predicate ?? [])) {
    const m = String(t).trim().match(/^declared:(.+)$/);
    if (m) out.push(m[1]);
  }
  return uniq(out);
}
export function toggleDeclare(raw, slugs, on) {
  const s = declState(raw);
  const list = [].concat(slugs).map(String);
  if (on) return { active: uniq([...s.active, ...list]), lingering: uniq([...s.lingering, ...list]) };
  // un-declaring before the attack happened undoes the risk too
  return { active: s.active.filter((x) => !list.includes(x)), lingering: s.lingering.filter((x) => !list.includes(x) || !s.active.includes(x)) };
}
export function consumeAttack(raw) { const s = declState(raw); return { active: [], lingering: s.lingering }; }
export function turnStart() { return { active: [], lingering: [] }; }
export function isDeclared(raw, slugs) { const s = declState(raw); return [].concat(slugs).some((x) => s.active.includes(x)); }
