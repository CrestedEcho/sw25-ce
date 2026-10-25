/**
 * sw25-ce grants: Foundry glue around the pure planner in engine.mjs.
 * autoFeats entries: {kind:feat|spell|feature|technique, ref, level, level_max?, when:{god:id}} and
 * {choose:"god", options:[...], level}. Picks are stored in flags.sw25-ce.choices.<id> on the class item.
 * Granted items carry flags.sw25-ce.autoFrom {class, ref, uuid}. Legacy {uuid} entries keep working.
 */
import { planGrants, grantList, KIND_TYPES } from "./engine.mjs";

const SYS = "sw25-ce";
const isUuid = (ref) => /^(Compendium|Item|Actor)\./.test(ref) || (ref.includes(".") && !ref.includes(" "));

/** Resolve a grant ref to a source Item document: UUID, else slug (flags.sw25-ce.slug or slugified name) in sw25-ce item packs. */
export async function resolveRef(kind, ref) {
  if (isUuid(ref)) return fromUuid(ref);
  const types = KIND_TYPES[kind] ?? null;
  const slugify = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  for (const pack of game.packs.filter((p) => p.documentName === "Item" && p.metadata.packageName === SYS)) {
    const idx = await pack.getIndex({ fields: ["type", `flags.${SYS}.slug`] });
    const hit = idx.find((e) => (!types || types.includes(e.type)) && (foundry.utils.getProperty(e, `flags.${SYS}.slug`) === ref || slugify(e.name) === ref));
    if (hit) return pack.getDocument(hit._id);
  }
  const world = game.items.find((i) => (!types || types.includes(i.type)) && (i.getFlag(SYS, "slug") === ref || slugify(i.name) === ref));
  return world ?? null;
}

/** Prompt for a pending choice (DialogV2). Returns the picked id or null. Only "god" and choices with options prompt. */
export async function promptChoice(cls, g) {
  const DV2 = foundry.applications?.api?.DialogV2;
  if (!DV2) return null;
  const esc = (s) => foundry.utils.escapeHTML?.(String(s)) ?? String(s);
  const opts = g.options.map((o) => (typeof o === "object" ? { id: String(o.id ?? o.ref), label: o.name ?? o.label ?? o.id ?? o.ref } : { id: String(o), label: String(o) }));
  const field = opts.length
    ? `<select name="pick">${opts.map((o) => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join("")}</select>`
    : `<input type="text" name="pick" placeholder="${esc(g.choose)}">`;
  try {
    const v = await DV2.prompt({
      window: { title: `${cls.name}: ${g.choose}` },
      content: `<div class="form-group"><label>${esc(g.choose)}</label>${field}</div>`,
      ok: { label: "OK", callback: (ev, button) => button.form.elements.pick.value },
      rejectClose: false,
    });
    return v ? String(v).trim() || null : null;
  } catch (e) { return null; }
}

const shouldPrompt = (g) => g.choose === "god" || g.options.length > 0;

/** Grant / remove class grants. Inert when the class lists none and none were granted. */
export async function syncGrants(actor, cls, { removed = false, prompt = true } = {}) {
  if (!actor || cls?.type !== "skill") return;
  const raw = removed ? [] : cls.system.autoFeats;
  const list = grantList(raw);
  const grantedDocs = actor.items.filter((i) => i.getFlag(SYS, "autoFrom")?.class === cls.id);
  if (!list.length && !grantedDocs.length) return;
  const granted = grantedDocs.map((i) => { const a = i.getFlag(SYS, "autoFrom"); return { id: i.id, ref: a.ref ?? a.uuid }; });
  const choices = cls.getFlag(SYS, "choices") ?? {};
  const overrides = cls.getFlag(SYS, "grantOverrides") ?? {};
  const plan = planGrants(raw, removed ? 0 : cls.system.skilllevel, choices, granted, overrides);
  const add = [];
  for (const w of plan.add) {
    const src = await resolveRef(w.kind, w.ref);
    if (!src) { console.warn(`sw25-ce | grant not found: ${w.kind} ${w.ref}`); continue; }
    const obj = src.toObject(); delete obj._id;
    foundry.utils.setProperty(obj, "system.featSource", "auto");
    foundry.utils.setProperty(obj, `flags.${SYS}.autoFrom`, { class: cls.id, ref: w.ref, uuid: src.uuid });
    add.push(obj);
  }
  if (plan.remove.length) await actor.deleteEmbeddedDocuments("Item", plan.remove, { sw25Slot: true });
  if (add.length) await actor.createEmbeddedDocuments("Item", add, { sw25Slot: true });
  // Choices: store the first pick; the updateItem hook re-syncs on the flag change.
  if (prompt && !removed) {
    const g = plan.pending.find(shouldPrompt);
    if (g) {
      const pick = await promptChoice(cls, g);
      if (pick) await cls.setFlag(SYS, `choices.${g.choose}`, pick);
    }
  }
  return plan;
}

/** Re-sync every class on an actor (macro: game.sw25.rules.resyncGrants(actor)). */
export async function resyncGrants(actor = canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character) {
  if (!actor) return ui.notifications.warn("sw25-ce | select a token or assign a character");
  for (const cls of actor.items.filter((i) => i.type === "skill")) await syncGrants(actor, cls, { prompt: true });
  ui.notifications.info(`sw25-ce | grants re-synced for ${actor.name}`);
}

/** Change (or clear) a stored choice; resync follows via the updateItem hook. */
export async function setChoice(cls, id, value) {
  return value == null || value === "" ? cls.unsetFlag(SYS, `choices.${id}`) : cls.setFlag(SYS, `choices.${id}`, value);
}
