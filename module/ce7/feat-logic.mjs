/** Pure combat-feat slot logic (no Foundry globals) — unit-tested. */
export const FEAT_LEVELS = [1, 3, 5, 7, 9, 11, 13, 15];

/** How many level slots are open at this adventurer level (Lv1 -> 1, Lv3 -> 2, ...). */
export const unlockedSlots = (adv) => { const a = Number(adv) || 0; return a >= 1 ? Math.min(FEAT_LEVELS.length, 1 + Math.floor((a - 1) / 2)) : 0; };

/** First open, empty feat level, or null. `feats` = combat feat items. */
export function firstFreeFeatLevel(feats, adv) {
  const taken = new Set((feats ?? []).filter((f) => f.system?.featSource === "slot").map((f) => Number(f.system.featLevel)));
  return FEAT_LEVELS.slice(0, unlockedSlots(adv)).find((l) => !taken.has(l)) ?? null;
}

/** What ticking/unticking "Activate" on a feat should do: { patch } | { warn } | null. */
export function activatePlan(feat, on, feats, adv) {
  const src = feat?.system?.featSource ?? "";
  if (on) {
    if (src) return null; // already in a slot or automatic
    const level = firstFreeFeatLevel(feats, adv);
    return level == null ? { warn: "noSlot" } : { patch: { "system.featSource": "slot", "system.featLevel": level } };
  }
  if (src === "slot") return { patch: { "system.featSource": "", "system.featLevel": 0 } };
  return null;
}

/** Feat picker rows: combat feats not in a level slot (unassigned or automatic excluded), sorted. Row: { id, name, img, note }. */
export function featPickList(items) {
  const strip = (h) => String(h ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return [...(items ?? [])].filter((it) => it.type === "combatability" && !it.system?.featSource)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((it) => {
      const s = it.system ?? {};
      let note = strip(s.overview) || strip(s.description);
      if (note.length > 90) note = note.slice(0, 87).trimEnd() + "…";
      return { id: it.id ?? it._id, name: it.name, img: it.img, note };
    });
}

/** Patch to put a feat into level slot `level` (Activate stays in sync). */
export const slotPatch = (level) => ({ "system.featSource": "slot", "system.featLevel": Number(level), "system.equip": true });

/** Patch that takes a feat out of its slot (back to "Not in a slot yet"). */
export const clearPatch = () => ({ "system.featSource": "", "system.featLevel": 0, "system.equip": false });

/** True if `src` (a dropped/clicked item) is an item owned by `actor` — compared by id, not object identity. */
export const ownedBy = (src, actor) => !!(src && actor && (src.parent === actor || (src.parent?.id && src.parent.id === actor.id && actor.items?.get?.(src.id))));

/**
 * Auto-fill plan for unslotted feats: [{ _id, featSource, featLevel, equip }].
 * Only open (unlocked) levels; nothing when the layout is manual or the player already slotted something.
 */
export function autoFeatPlan(feats, adv, manual = false) {
  const list = [...(feats ?? [])];
  if (manual || list.some((f) => f.system?.featSource === "slot")) return [];
  const free = FEAT_LEVELS.slice(0, unlockedSlots(adv));
  return list.filter((f) => !f.system?.featSource).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .slice(0, free.length).map((f, i) => ({ _id: f.id ?? f._id, "system.featSource": "slot", "system.featLevel": free[i], "system.equip": true }));
}

const escHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/** Chat card HTML for "show feat in chat": name, icon, effect text, and requirements when present. */
export function featCardHtml(item, reqLabel = "Requirements") {
  const s = item?.system ?? {};
  const req = [s.cond, s.requirements, s.requirement, s.prereq].map((x) => String(x ?? "").trim()).find((x) => x && x !== "-") ?? "";
  const effect = String(s.description ?? "").trim() || escHtml(s.overview ?? "");
  return `<div class="sw25 item-card sw25-feat-card"><header class="card-header flexrow" style="align-items:center;gap:6px">`
    + `<img src="${escHtml(item?.img)}" width="36" height="36" style="flex:0 0 36px;border:0"/><h3 class="item-name" style="margin:0">${escHtml(item?.name)}</h3></header>`
    + (req ? `<p class="sw25-feat-req"><b>${escHtml(reqLabel)}:</b> ${escHtml(req)}</p>` : "")
    + (effect ? `<div class="card-content">${effect}</div>` : "") + `</div>`;
}
