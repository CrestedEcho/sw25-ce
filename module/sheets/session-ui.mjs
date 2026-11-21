/* sw25-ce ce.25: Session Notes tab (Foundry glue). Pure logic + data shape: module/rules/session-log.mjs.
 * Everything is stored on the actor (flags.sw25-ce.sessionLog); no journal folders are created. */
import * as SL from "../rules/session-log.mjs";

const FLAG = "sw25-ce";
const ROOT = `flags.${FLAG}.sessionLog`;
const i18n = (k, d) => { try { return game.i18n.has?.(k) === false ? d ?? k : game.i18n.localize(k); } catch { return d ?? k; } };
const fmt = (k, data, d) => { try { return game.i18n.has?.(k) === false ? d : game.i18n.format(k, data); } catch { return d; } };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rid = () => foundry.utils.randomID(16);
/** In-flight lock per actor so double clicks can't create two sessions. */
const CREATING = new Set();

export const getLog = (actor) => SL.normalizeLog(actor?.flags?.[FLAG]?.sessionLog);

function ui(sheet) { return (sheet._swSess ??= { page: 1, query: "", collapsed: new Set() }); }

export function sessionContext(sheet) {
  const log = getLog(sheet.actor); const u = ui(sheet);
  const view = SL.listView(log, { query: u.query, page: u.page, collapsed: u.collapsed });
  u.page = view.page;
  return { view, todo: SL.todoView(log), misc: log.misc, creating: CREATING.has(sheet.actor.id), canJournal: !!game.user?.can?.("JOURNAL_CREATE") };
}

/* ---------- sessions ---------- */
async function sessionForm({ title, session = {}, defaults = {} }) {
  const s = { ...defaults, ...session };
  const content = `<div class="sw-sess-form">
    <label>${esc(i18n("SW25.V2.Session.Date", "Date"))}<input type="date" name="date" value="${esc(s.date)}"/></label>
    <label>${esc(i18n("SW25.V2.Session.TitleField", "Title"))}<input type="text" name="title" value="${esc(s.title)}" autofocus/></label>
    <label>${esc(i18n("SW25.V2.Session.Campaign", "Campaign"))}<input type="text" name="campaign" value="${esc(s.campaign)}"/></label>
    <label>${esc(i18n("SW25.V2.Session.Arc", "Arc (optional)"))}<input type="text" name="arc" value="${esc(s.arc)}"/></label></div>`;
  return foundry.applications.api.DialogV2.wait({
    window: { title, icon: "fas fa-book-open" }, position: { width: 420 }, content, rejectClose: false,
    buttons: [
      { action: "ok", label: i18n("SW25.V2.Session.Create", "Create"), icon: "fas fa-check", default: true,
        callback: (_e, b) => Object.fromEntries(new FormData(b.form).entries()) },
      { action: "cancel", label: i18n("Cancel", "Cancel"), icon: "fas fa-times" },
    ],
  });
}

/** New Session (number = highest + 1). Locked while in flight; verifies the number is unique afterwards. */
export async function createSession(actor, { notes = "", ask = true } = {}) {
  if (CREATING.has(actor.id)) return null;
  CREATING.add(actor.id);
  try {
    const before = getLog(actor); const last = before.sessions[0];
    const defaults = { date: SL.todayISO(), campaign: last?.campaign ?? "", arc: last?.arc ?? "", title: "" };
    let data = defaults;
    if (ask) {
      data = await sessionForm({ title: fmt("SW25.V2.Session.NewTitle", { n: SL.nextSessionNumber(before.sessions) }, "New session"), defaults });
      if (!data || data === "cancel" || typeof data !== "object") return null;
    }
    const fresh = getLog(actor); // re-read: another client may have added one meanwhile
    const id = rid();
    const s = SL.makeSession(fresh.sessions, { id, ...data, notes: SL.stripDataImages(notes) });
    await actor.update({ [`${ROOT}.sessions.${id}`]: s });
    const dups = SL.duplicateNumbers(getLog(actor).sessions);
    if (dups.includes(s.number)) {
      const fixed = SL.nextSessionNumber(getLog(actor).sessions);
      await actor.update({ [`${ROOT}.sessions.${id}.number`]: fixed });
      ui.notifications?.info(fmt("SW25.V2.Session.Renumbered", { n: fixed }, `Session renumbered to ${fixed}`));
    }
    return s;
  } finally { CREATING.delete(actor.id); }
}

/** Pop-up to read / edit one session (notes and loot are rich text; pasted base64 images are removed on save). */
export async function openSession(actor, id) {
  const s = getLog(actor).sessions.find((x) => x.id === id);
  if (!s) return null;
  const PM = foundry.applications?.elements?.HTMLProseMirrorElement;
  const field = (name, label, html) => `<div class="sw-sess-field"><h4>${esc(label)}</h4><div class="sw-sess-slot" data-field="${name}">${PM ? "" : `<textarea name="${name}" rows="8">${esc(html)}</textarea>`}</div></div>`;
  const content = `<div class="sw-sess-pop">
    <div class="sw-sess-meta">
      <label>#<input type="number" name="number" value="${s.number}" min="1" step="1"/></label>
      <label>${esc(i18n("SW25.V2.Session.Date", "Date"))}<input type="date" name="date" value="${esc(s.date)}"/></label>
      <label class="wide">${esc(i18n("SW25.V2.Session.TitleField", "Title"))}<input type="text" name="title" value="${esc(s.title)}"/></label>
      <label>${esc(i18n("SW25.V2.Session.Campaign", "Campaign"))}<input type="text" name="campaign" value="${esc(s.campaign)}"/></label>
      <label>${esc(i18n("SW25.V2.Session.ArcShort", "Arc"))}<input type="text" name="arc" value="${esc(s.arc)}"/></label>
    </div>
    ${field("notes", i18n("SW25.V2.Session.Notes", "Session notes"), s.notes)}
    ${field("loot", i18n("SW25.V2.Session.Loot", "Loot found"), s.loot)}
    <p class="hint"><small>${esc(i18n("SW25.V2.Session.ImageHint", "Images: use links or drag from the file browser. Pasted images are removed so the character stays small."))}</small></p>
  </div>`;
  const out = await foundry.applications.api.DialogV2.wait({
    window: { title: `${i18n("SW25.V2.Session.Session", "Session")} ${s.number}${s.title ? ` · ${s.title}` : ""}`, icon: "fas fa-book-open", resizable: true },
    classes: ["sw25-session-dialog"], position: { width: 640 }, content, rejectClose: false,
    buttons: [
      { action: "save", label: i18n("SW25.V2.Session.Save", "Save"), icon: "fas fa-check", default: true, callback: (_e, b) => {
        const f = b.form; const fd = Object.fromEntries(new FormData(f).entries());
        for (const k of ["notes", "loot"]) { const pm = f.querySelector(`prose-mirror[name="${k}"]`); if (pm) fd[k] = pm.value ?? ""; }
        return fd;
      } },
      { action: "delete", label: i18n("SW25.V2.Session.Delete", "Delete"), icon: "fas fa-trash" },
      { action: "cancel", label: i18n("Cancel", "Cancel"), icon: "fas fa-times" },
    ],
    render: (_e, dialog) => {
      const root = dialog?.element ?? _e?.target?.element;
      if (!PM || !root) return;
      for (const k of ["notes", "loot"]) {
        const slot = root.querySelector(`.sw-sess-slot[data-field="${k}"]`);
        try { slot?.append(PM.create({ name: k, value: s[k] ?? "", toggled: false, documentUUID: actor.uuid })); }
        catch (e) { console.warn("sw25 | session editor", e); if (slot) slot.innerHTML = `<textarea name="${k}" rows="8">${esc(s[k])}</textarea>`; }
      }
    },
  });
  if (out === "delete") return deleteSession(actor, s);
  if (!out || typeof out !== "object") return null;
  const num = Math.max(1, Math.floor(Number(out.number) || s.number));
  if (num !== s.number && getLog(actor).sessions.some((x) => x.id !== s.id && x.number === num)) {
    ui.notifications?.warn(fmt("SW25.V2.Session.NumberTaken", { n: num }, `Session ${num} already exists`));
    out.number = s.number;
  } else out.number = num;
  const patch = { number: out.number, date: String(out.date ?? ""), title: String(out.title ?? ""), campaign: String(out.campaign ?? ""), arc: String(out.arc ?? "").trim(),
    notes: SL.stripDataImages(out.notes ?? s.notes), loot: SL.stripDataImages(out.loot ?? s.loot) };
  return actor.update(Object.fromEntries(Object.entries(patch).map(([k, v]) => [`${ROOT}.sessions.${s.id}.${k}`, v])));
}

async function deleteSession(actor, s) {
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: i18n("SW25.V2.Session.Delete", "Delete") },
    content: `<p>${esc(fmt("SW25.V2.Session.DeleteConfirm", { n: s.number, title: s.title }, `Delete session ${s.number}?`))}</p>`, rejectClose: false });
  if (!ok) return null;
  const log = getLog(actor);
  if (log.pinned === s.id) await actor.unsetFlag(FLAG, "sessionLog.pinned");
  return actor.unsetFlag(FLAG, `sessionLog.sessions.${s.id}`);
}

export async function togglePin(actor, id) {
  const log = getLog(actor);
  return log.pinned === id ? actor.unsetFlag(FLAG, "sessionLog.pinned") : actor.setFlag(FLAG, "sessionLog.pinned", id);
}

/* ---------- to-do ---------- */
export async function addTodo(actor, text) {
  const t = String(text ?? "").trim(); if (!t) return null;
  const id = rid(); const act = SL.activeSession(getLog(actor));
  return actor.update({ [`${ROOT}.todos.${id}`]: SL.normalizeTodo({ id, text: t, done: false, addedIn: act?.number ?? null, created: Date.now() }) });
}
export async function toggleTodo(actor, id, done) {
  const act = SL.activeSession(getLog(actor));
  return actor.update({ [`${ROOT}.todos.${id}.done`]: !!done, [`${ROOT}.todos.${id}.doneIn`]: done ? (act?.number ?? null) : null });
}
export async function deleteTodo(actor, id) { return actor.unsetFlag(FLAG, `sessionLog.todos.${id}`); }
export async function clearDone(actor) {
  const done = getLog(actor).todos.filter((t) => t.done);
  if (!done.length) return null;
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: i18n("SW25.V2.Todo.ClearDone", "Clear completed") },
    content: `<p>${esc(fmt("SW25.V2.Todo.ClearConfirm", { n: done.length }, `Remove ${done.length} completed task(s)?`))}</p>`, rejectClose: false });
  if (!ok) return null;
  for (const t of done) await actor.unsetFlag(FLAG, `sessionLog.todos.${t.id}`);
  return true;
}

/* ---------- misc ---------- */
export async function miscToActive(actor) {
  const log = getLog(actor); const text = log.misc.trim();
  if (!text) return ui.notifications?.info(i18n("SW25.V2.Misc.Empty", "The misc box is empty."));
  const act = SL.activeSession(log);
  if (!act) return createSession(actor, { notes: SL.textToHtml(text) });
  await actor.update({ [`${ROOT}.sessions.${act.id}.notes`]: SL.stripDataImages(SL.appendNotes(act.notes, text)) });
  ui.notifications?.info(fmt("SW25.V2.Misc.Added", { n: act.number }, `Added to session ${act.number}`));
}
export async function miscToNew(actor) {
  const text = getLog(actor).misc.trim();
  if (!text) return ui.notifications?.info(i18n("SW25.V2.Misc.Empty", "The misc box is empty."));
  return createSession(actor, { notes: SL.textToHtml(text) });
}
export async function miscClear(actor) {
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: i18n("SW25.V2.Misc.Clear", "Clear") },
    content: `<p>${esc(i18n("SW25.V2.Misc.ClearConfirm", "Clear the misc notes box?"))}</p>`, rejectClose: false });
  if (ok) return actor.update({ [`${ROOT}.misc`]: "" });
}

/* ---------- export ---------- */
function exportLabels() {
  return { title: i18n("SW25.V2.Session.Tab", "Session Notes"), arc: i18n("SW25.V2.Session.ArcShort", "Arc"), campaign: i18n("SW25.V2.Session.Campaign", "Campaign"),
    notes: i18n("SW25.V2.Session.Notes", "Notes"), loot: i18n("SW25.V2.Session.Loot", "Loot found"), todo: i18n("SW25.V2.Todo.Title", "To-Do"),
    misc: i18n("SW25.V2.Misc.Title", "Misc notes"), done: i18n("SW25.V2.Todo.DoneIn", "done in session") };
}

export async function exportDialog(actor) {
  const log = getLog(actor);
  if (!log.sessions.length && !log.todos.length && !log.misc) return ui.notifications?.info(i18n("SW25.V2.Session.NothingToExport", "Nothing to export yet."));
  const act = SL.activeSession(log);
  const opts = log.sessions.map((s) => `<option value="${esc(s.id)}"${act?.id === s.id ? " selected" : ""}>${esc(SL.sessionHeader(s))}</option>`).join("");
  const arcs = [...new Set(log.sessions.map((s) => s.arc).filter(Boolean))].map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join("");
  const canJ = !!game.user?.can?.("JOURNAL_CREATE");
  const content = `<div class="sw-sess-export">
    <label><input type="radio" name="scope" value="session" checked/> ${esc(i18n("SW25.V2.Export.Session", "One session"))} <select name="session">${opts}</select></label>
    ${arcs ? `<label><input type="radio" name="scope" value="arc"/> ${esc(i18n("SW25.V2.Export.Arc", "An arc"))} <select name="arc">${arcs}</select></label>` : ""}
    <label><input type="radio" name="scope" value="all"/> ${esc(i18n("SW25.V2.Export.All", "Everything (all sessions, to-do and misc)"))}</label>
    ${canJ ? "" : `<p class="hint"><i class="fas fa-circle-info"></i> ${esc(i18n("SW25.V2.Export.NoJournalPerm", "Your Foundry role can't create journal entries; ask the GM, or use the .txt download."))}</p>`}
  </div>`;
  const out = await foundry.applications.api.DialogV2.wait({
    window: { title: i18n("SW25.V2.Export.Title", "Export session notes"), icon: "fas fa-file-export" }, content, rejectClose: false,
    buttons: [
      { action: "txt", label: i18n("SW25.V2.Export.Txt", "Download .txt"), icon: "fas fa-file-lines", default: true, callback: (_e, b) => ({ fmt: "txt", ...Object.fromEntries(new FormData(b.form).entries()) }) },
      { action: "journal", label: i18n("SW25.V2.Export.Journal", "Export to Journal"), icon: "fas fa-book", callback: (_e, b) => ({ fmt: "journal", ...Object.fromEntries(new FormData(b.form).entries()) }) },
      { action: "cancel", label: i18n("Cancel", "Cancel"), icon: "fas fa-times" },
    ],
  });
  if (!out || typeof out !== "object") return null;
  const scope = out.scope === "arc" ? { kind: "arc", arc: out.arc } : out.scope === "all" ? { kind: "all" } : { kind: "session", id: out.session };
  return out.fmt === "journal" ? exportJournal(actor, scope) : exportTxt(actor, scope);
}

export function exportTxt(actor, scope = { kind: "all" }) {
  const log = getLog(actor); const all = scope.kind === "all";
  const sessions = SL.sessionsFor(log, scope);
  const text = SL.exportText({ actorName: actor.name, sessions, todos: all ? log.todos : [], misc: all ? log.misc : "", labels: exportLabels() });
  const suffix = scope.kind === "session" ? `session-${sessions[0]?.number ?? ""}` : scope.kind === "arc" ? `arc-${scope.arc}` : "sessions";
  const save = foundry.utils?.saveDataToFile ?? globalThis.saveDataToFile;
  save(text, "text/plain", SL.exportFileName(actor.name, suffix));
  return text;
}

export async function exportJournal(actor, scope = { kind: "all" }) {
  if (!game.user?.can?.("JOURNAL_CREATE")) {
    ui.notifications?.warn(i18n("SW25.V2.Export.NoJournalPerm", "Your Foundry role can't create journal entries; ask the GM, or use the .txt download."));
    return null;
  }
  const log = getLog(actor); const L = exportLabels(); const all = scope.kind === "all";
  const sessions = SL.sessionsFor(log, scope);
  const pages = sessions.map((s, i) => ({ name: SL.sessionHeader(s), type: "text", sort: (i + 1) * 100, text: { content: SL.sessionPageHtml(s, L), format: 1 } }));
  if (all && log.todos.length) pages.push({ name: L.todo, type: "text", sort: (pages.length + 1) * 100,
    text: { format: 1, content: `<ul>${log.todos.map((t) => `<li>[${t.done ? "x" : " "}] ${esc(t.text)}${t.done && t.doneIn != null ? ` (${esc(L.done)} ${t.doneIn})` : ""}</li>`).join("")}</ul>` } });
  if (all && log.misc.trim()) pages.push({ name: L.misc, type: "text", sort: (pages.length + 1) * 100, text: { format: 1, content: SL.textToHtml(log.misc) } });
  const what = scope.kind === "session" ? SL.sessionHeader(sessions[0] ?? {}) : scope.kind === "arc" ? `${L.arc}: ${scope.arc}` : L.title;
  try {
    const je = await JournalEntry.create({ name: `${actor.name} · ${what}`, pages });
    ui.notifications?.info(fmt("SW25.V2.Export.JournalDone", { name: je?.name ?? "" }, "Journal entry created"));
    je?.sheet?.render(true);
    return je;
  } catch (e) {
    console.warn("sw25 | journal export", e);
    ui.notifications?.warn(i18n("SW25.V2.Export.NoJournalPerm", "Your Foundry role can't create journal entries; ask the GM, or use the .txt download."));
    return null;
  }
}

/* ---------- listeners ---------- */
export function bindSessionListeners(sheet, html) {
  const actor = sheet.actor; const u = ui(sheet);
  const on = (sel, fn, evt = "click") => html.on(evt, sel, (ev) => { if (evt === "click") ev.preventDefault(); ev.stopPropagation(); fn(ev.currentTarget, ev); });
  on(".sw-sess-new", async (el) => { if (el.disabled) return; el.disabled = true; try { await createSession(actor); } finally { if (el.isConnected) el.disabled = false; sheet.render(false); } });
  on(".sw-sess-open", (el) => openSession(actor, el.closest("[data-session-id]")?.dataset.sessionId));
  on(".sw-sess-pin", (el) => togglePin(actor, el.closest("[data-session-id]")?.dataset.sessionId));
  on(".sw-sess-page", (el) => { u.page = Number(el.dataset.page) || 1; sheet.render(false); });
  on(".sw-sess-arc", (el) => { const k = el.dataset.arc; u.collapsed.has(k) ? u.collapsed.delete(k) : u.collapsed.add(k); sheet.render(false); });
  on(".sw-sess-export", () => exportDialog(actor));
  let timer = null;
  html.on("input", ".sw-sess-search", (ev) => {
    ev.stopPropagation(); const v = ev.currentTarget.value; clearTimeout(timer);
    timer = setTimeout(() => { u.query = v; u.page = 1; u.refocus = true; sheet.render(false); }, 350);
  });
  html.on("keydown", ".sw-sess-search, .sw-todo-new", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); if (ev.currentTarget.classList.contains("sw-todo-new")) addTodo(actor, ev.currentTarget.value); } });
  html.on("change", ".sw-sess-search, .sw-todo-new", (ev) => ev.stopPropagation());
  if (u.refocus) { u.refocus = false; const el = html.find(".sw-sess-search")[0]; if (el) { el.focus(); el.setSelectionRange?.(el.value.length, el.value.length); } }
  on(".sw-todo-add", (el) => addTodo(actor, el.closest(".sw-todo")?.querySelector(".sw-todo-new")?.value));
  html.on("change", ".sw-todo-check", (ev) => { ev.stopPropagation(); toggleTodo(actor, ev.currentTarget.closest("[data-todo-id]")?.dataset.todoId, ev.currentTarget.checked); });
  on(".sw-todo-del", (el) => deleteTodo(actor, el.closest("[data-todo-id]")?.dataset.todoId));
  on(".sw-todo-hide", () => actor.update({ [`${ROOT}.hideDone`]: !getLog(actor).hideDone }));
  on(".sw-todo-clear", () => clearDone(actor));
  // Misc box saves without re-rendering, so a click on its buttons right after typing still lands.
  html.on("change", ".sw-misc-text", (ev) => { const v = ev.currentTarget.value; if (v !== getLog(actor).misc) actor.update({ [`${ROOT}.misc`]: v }, { render: false }); });
  const saveMiscFirst = async (el) => { const t = el.closest(".sw-misc")?.querySelector(".sw-misc-text"); if (t && t.value !== getLog(actor).misc) await actor.update({ [`${ROOT}.misc`]: t.value }, { render: false }); };
  on(".sw-misc-add", async (el) => { await saveMiscFirst(el); miscToActive(actor); });
  on(".sw-misc-new", async (el) => { await saveMiscFirst(el); miscToNew(actor); });
  on(".sw-misc-clear", () => miscClear(actor));
}
