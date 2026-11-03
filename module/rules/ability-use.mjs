/**
 * Declare / Use buttons for character abilities (pure; no Foundry globals).
 * Every non-passive ability (feats, techniques, racial abilities, other features) gets a Use button: it spends the
 * listed MP/HP cost and posts the item's card (with its roll buttons). Declared abilities (🗨 / ⏩ flags or
 * declared:<slug> rule predicates) also get a Declare chip. Nothing here enforces prerequisites or limits.
 */
import { declaredSlugs } from "./combat-state.mjs";

export const ABILITY_TYPES = Object.freeze(["combatability", "enhancearts", "magicalsong", "ridingtrick", "alchemytech", "phasearea",
  "tactics", "infusion", "barbarousskill", "essenceweave", "raceability", "otherfeature", "action"]);
const slugify = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Declaration slugs: from rules (declared:<slug>), else the item's own slug when it is flagged as a declared ability. */
export function declareSlugsFor(item) {
  const fromRules = declaredSlugs(item?.system?.rules);
  if (fromRules.length) return fromRules;
  const s = item?.system ?? {};
  if (s.decla === true || s.decla === "true") return [item?.flags?.["sw25-ce"]?.slug || slugify(item?.name)];
  return [];
}
/** First whole number in a cost field ("3", "3 MP", "2 (per round)"); 0 if none.
 * A dice cost ("1dHP", "2d(9)HP", "1d6") is 0: the player rolls it (roll button on the card), it is never auto-spent. */
export const isDiceCost = (v) => /(^|[^a-z])\d*d(\d|\(|hp|mp|\s|$)/i.test(String(v ?? ""));
export function costNumber(v) {
  if (isDiceCost(v)) return 0;
  const m = String(v ?? "").match(/\d+/);
  return m ? Number(m[0]) : 0;
}
export function useCost(item) {
  const s = item?.system ?? {};
  return { mp: costNumber(s.mpcost), hp: costNumber(s.hpcost) };
}
/** Should this item row show a Use button? Abilities that are not purely passive, or that cost MP/HP. */
export function showUse(item) {
  if (!item || !ABILITY_TYPES.includes(item.type)) return false;
  const s = item.system ?? {};
  const c = useCost(item);
  if (c.mp || c.hp) return true;
  if (s.constant === true && !s.main && !s.aux && !s.decla && !s.prep) return false;
  return true;
}
/** Actor update for paying a cost. MP may not go below 0 (ok:false, nothing spent); HP may (SW2.5 rules). */
export function spendPatch(actorSys, cost) {
  const mp = Number(actorSys?.mp?.value) || 0;
  const hp = Number(actorSys?.hp?.value) || 0;
  const patch = {};
  if (cost.mp) { if (mp < cost.mp) return { ok: false, reason: `needs ${cost.mp} MP, has ${mp}`, patch: {} }; patch["system.mp.value"] = mp - cost.mp; }
  if (cost.hp) patch["system.hp.value"] = hp - cost.hp;
  const parts = [cost.mp ? `${cost.mp} MP` : "", cost.hp ? `${cost.hp} HP` : ""].filter(Boolean);
  return { ok: true, patch, spent: parts.join(" + ") };
}
