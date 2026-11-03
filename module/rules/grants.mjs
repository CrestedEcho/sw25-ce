/**
 * sw25-ce grants: Foundry glue around the pure planner in engine.mjs.
 * autoFeats entries: {kind:feat|spell|feature|technique, ref, level, level_max?, when:{god:id}} and
 * {choose:"god", options:[...], level}. Picks are stored in flags.sw25-ce.choices.<key> on the class item, where key is the
 * choice id, or <choose>@<level> when the same choice repeats ("one technique per level"). Plain-slug options resolve to items.
 * Granted items carry flags.sw25-ce.autoFrom {class, ref, uuid}. Legacy {uuid} entries keep working.
 */
import { planGrants, grantList, choicePick, choiceProgress, KIND_TYPES } from "./engine.mjs";

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

const titleCase = (s) => String(s).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Prompt for a pending choice (DialogV2). Returns the picked id or null. Only "god" and choices with options prompt. */
export async function promptChoice(cls, g, { exclude = [], progress = null } = {}) {
  const DV2 = foundry.applications?.api?.DialogV2;
  if (!DV2) return null;
  const esc = (s) => foundry.utils.escapeHTML?.(String(s)) ?? String(s);
  let opts = g.options.map((o) => (typeof o === "object" ? { id: String(o.id ?? o.ref), label: o.name ?? o.label ?? o.id ?? o.ref } : { id: String(o), label: titleCase(o) }));
  // optionsMinLevel (Enhancer, Geomancer, ...): hide options above the current class level
  const minLv = g.optionsMinLevel ?? cls.system.optionMinLevels ?? cls.getFlag(SYS, "data")?.optionMinLevels ?? {};
  const lv = Number(cls.system.skilllevel) || 0;
  opts = opts.filter((o) => !(Number(minLv[o.id]) > lv));
  // already picked at another level of the same choice: hidden (convenience, never a hard rule)
  const ex = new Set(exclude.map(String));
  if (opts.some((o) => !ex.has(o.id))) opts = opts.filter((o) => !ex.has(o.id));
  // gods: show names from the sw25-gods journal pack (flags.sw25-ce.slug)
  if (g.choose === "god") {
    const pack = game.packs.get(`${SYS}.sw25-gods`);
    const idx = pack ? await pack.getIndex({ fields: [`flags.${SYS}.slug`, `flags.${SYS}.rank`] }) : [];
    const byId = new Map(idx.map((e) => [foundry.utils.getProperty(e, `flags.${SYS}.slug`), e]));
    opts = opts.map((o) => { const e = byId.get(o.id); return e ? { ...o, label: `${e.name} (${foundry.utils.getProperty(e, `flags.${SYS}.rank`) ?? "?"})` } : o; });
  }
  const field = opts.length
    ? `<select name="pick">${opts.map((o) => `<option value="${esc(o.id)}">${esc(o.label)}${minLv[o.id] ? ` (Lv ${esc(minLv[o.id])}+)` : ""}</option>`).join("")}</select>`
    : `<input type="text" name="pick" placeholder="${esc(g.choose)}">`;
  const count = g.total > 1 ? ` (one per level: ${progress ? `${progress.picked} of ${g.total} picked` : `pick ${g.index} of ${g.total}`})` : "";
  const note = g.note ? `<p class="notes">${esc(g.note)}</p>` : "";
  try {
    const v = await DV2.prompt({
      window: { title: `${cls.name} Lv ${g.level}: ${titleCase(g.choose)}` },
      content: `<div class="form-group"><label>${esc(titleCase(g.choose))}${esc(count)}</label>${field}</div>${note}`,
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
  // Choices: prompt for every pending pick (lowest level first), then store them in one update and re-sync.
  if (prompt && !removed) {
    const pending = plan.pending.filter(shouldPrompt);
    const picks = {};
    const all = grantList(raw);
    for (const g of pending) {
      const sameGroup = all.filter((x) => x.choose === g.choose);
      const exclude = sameGroup.map((x) => picks[x.key] ?? choicePick(x, choices)).filter((v) => v != null);
      const progress = choiceProgress(raw, cls.system.skilllevel, { ...choices, ...picks })[g.choose];
      const pick = await promptChoice(cls, g, { exclude, progress });
      if (!pick) break; // closed: stop asking; the class sheet lists open picks
      picks[g.key] = pick;
    }
    if (Object.keys(picks).length) {
      const upd = Object.fromEntries(Object.entries(picks).map(([k, v]) => [`flags.${SYS}.choices.${k}`, v]));
      await cls.update(upd, { sw25Slot: true });
      return syncGrants(actor, cls, { prompt: false });
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
