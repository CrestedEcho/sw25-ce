/* sw25-ce: Session Notes tab (PURE, unit-tested). Everything lives on the actor:
 *   flags.sw25-ce.sessionLog = { sessions: {<id>: Session}, todos: {<id>: Todo}, misc: "", pinned: "", hideDone: false }
 * Session = { id, number, date, campaign, title, arc, notes (html), loot (html), created }
 * Todo    = { id, text, done, doneIn (session number|null), addedIn (session number|null), created }
 * Keyed objects (not arrays) so one edit only sends that entry. Missing data defaults sanely (no migration). */

export const PER_PAGE = 20;
const str = (v) => (v === undefined || v === null ? "" : String(v));
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const values = (o) => (Array.isArray(o) ? o : Object.values(o && typeof o === "object" ? o : {})).filter((x) => x && typeof x === "object");

export function normalizeSession(s = {}, id = null) {
  return { id: str(s.id || id), number: Math.max(0, Math.floor(num(s.number))), date: str(s.date), campaign: str(s.campaign),
    title: str(s.title), arc: str(s.arc).trim(), notes: str(s.notes), loot: str(s.loot), created: num(s.created) };
}
export function normalizeTodo(t = {}, id = null) {
  return { id: str(t.id || id), text: str(t.text), done: !!t.done, doneIn: t.doneIn == null || t.doneIn === "" ? null : num(t.doneIn),
    addedIn: t.addedIn == null || t.addedIn === "" ? null : num(t.addedIn), created: num(t.created) };
}

/** Raw flag -> full log with defaults. Sessions newest first (number desc), todos oldest first. */
export function normalizeLog(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const sessions = Object.entries(r.sessions && typeof r.sessions === "object" ? r.sessions : {})
    .filter(([, s]) => s && typeof s === "object").map(([k, s]) => normalizeSession(s, k))
    .sort((a, b) => b.number - a.number || b.created - a.created);
  const todos = Object.entries(r.todos && typeof r.todos === "object" ? r.todos : {})
    .filter(([, t]) => t && typeof t === "object").map(([k, t]) => normalizeTodo(t, k))
    .sort((a, b) => a.created - b.created);
  return { sessions, todos, misc: str(r.misc), pinned: str(r.pinned), hideDone: !!r.hideDone };
}

export function nextSessionNumber(sessions) {
  return values(sessions).reduce((m, s) => Math.max(m, num(s.number)), 0) + 1;
}
/** Numbers used more than once (should be empty). */
export function duplicateNumbers(sessions) {
  const seen = new Map();
  for (const s of values(sessions)) seen.set(num(s.number), (seen.get(num(s.number)) ?? 0) + 1);
  return [...seen.entries()].filter(([, c]) => c > 1).map(([n]) => n).sort((a, b) => a - b);
}

/** Active session: the pinned one if it still exists, otherwise the highest number. */
export function activeSession(log) {
  const list = values(log?.sessions);
  return list.find((s) => log?.pinned && s.id === log.pinned) ?? list.reduce((best, s) => (!best || num(s.number) > num(best.number) ? s : best), null);
}

/** "2026-11-20" in local time. */
export function todayISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** New session data (number = max existing + 1). */
export function makeSession(sessions, { id, date, campaign = "", title = "", arc = "", notes = "", loot = "", now = Date.now() } = {}) {
  return normalizeSession({ id, number: nextSessionNumber(sessions), date: date || todayISO(new Date(now)), campaign, title, arc, notes, loot, created: now });
}

/** Remove embedded base64 images / data: URIs (keeps links and file-browser paths). */
export function stripDataImages(html) {
  let s = str(html);
  s = s.replace(/<img\b[^>]*\bsrc\s*=\s*(["'])\s*data:[^"']*\1[^>]*>/gi, "");
  s = s.replace(/<img\b[^>]*\bsrc\s*=\s*data:[^\s>]*[^>]*>/gi, "");
  s = s.replace(/(\b(?:src|href|srcset)\s*=\s*)(["'])\s*data:[^"']*\2/gi, '$1$2$2');
  s = s.replace(/url\(\s*(["']?)\s*data:[^)]*\)/gi, "none");
  return s;
}

/** HTML -> readable plain text (paragraphs / list items on their own lines). */
export function htmlToText(html) {
  let s = str(html);
  s = s.replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\s*li[^>]*>/gi, "\n- ").replace(/<\/\s*(p|div|h[1-6]|ul|ol|tr|blockquote|pre)\s*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  return s.split("\n").map((l) => l.replace(/\s+$/g, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Plain text -> simple HTML paragraphs (used when misc notes are copied into a session). */
export function textToHtml(text) {
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return str(text).split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join("");
}
/** Append misc text to a session's notes html. */
export function appendNotes(notesHtml, text) {
  const add = textToHtml(text);
  return add ? `${str(notesHtml)}${add}` : str(notesHtml);
}

/** Search across every session's text (case-insensitive; all words must match). */
export function sessionMatches(s, query) {
  const words = str(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [`#${s.number}`, String(s.number), s.date, s.campaign, s.title, s.arc, htmlToText(s.notes), htmlToText(s.loot)].join(" \n ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

/**
 * List view: filter, newest first, paginate (PER_PAGE), then group the page's rows by arc (consecutive).
 * collapsed: Set|array of arc keys whose rows are hidden.
 */
export function listView(log, { query = "", page = 1, perPage = PER_PAGE, collapsed = [] } = {}) {
  const coll = new Set(collapsed instanceof Set ? [...collapsed] : collapsed);
  const active = activeSession(log);
  const all = values(log?.sessions).slice().sort((a, b) => num(b.number) - num(a.number) || num(b.created) - num(a.created));
  const hits = all.filter((s) => sessionMatches(s, query));
  const pages = Math.max(1, Math.ceil(hits.length / perPage));
  const p = Math.min(Math.max(1, Math.floor(num(page)) || 1), pages);
  const rows = hits.slice((p - 1) * perPage, p * perPage);
  const arcCount = new Map(); for (const s of all) arcCount.set(s.arc, (arcCount.get(s.arc) ?? 0) + 1);
  const groups = [];
  for (const s of rows) {
    let g = groups[groups.length - 1];
    if (!g || g.arc !== s.arc) { g = { arc: s.arc, key: s.arc || "_none", total: arcCount.get(s.arc) ?? 0, collapsed: coll.has(s.arc || "_none"), rows: [] }; groups.push(g); }
    g.rows.push({ ...s, active: !!active && active.id === s.id, pinned: !!log?.pinned && log.pinned === s.id });
  }
  const pageList = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - p) <= 2) pageList.push({ n: i, current: i === p }); else if (pageList[pageList.length - 1]?.gap !== true) pageList.push({ gap: true });
  return { groups, page: p, pages, pageList, total: all.length, matches: hits.length, query: str(query), hasPrev: p > 1, hasNext: p < pages,
    prevPage: Math.max(1, p - 1), nextPage: Math.min(pages, p + 1), multiPage: pages > 1,
    active: active ? { id: active.id, number: active.number, title: active.title } : null, arcs: [...new Set(all.map((s) => s.arc).filter(Boolean))].sort() };
}

/** To-do view rows. */
export function todoView(log) {
  const list = values(log?.todos);
  const rows = list.filter((t) => !(log?.hideDone && t.done));
  return { rows, hidden: list.length - rows.length, doneCount: list.filter((t) => t.done).length, hideDone: !!log?.hideDone };
}

/** Sessions for an export scope: {kind:"session", id} | {kind:"arc", arc} | {kind:"all"}. Oldest first. */
export function sessionsFor(log, scope = { kind: "all" }) {
  let list = values(log?.sessions);
  if (scope.kind === "session") list = list.filter((s) => s.id === scope.id);
  else if (scope.kind === "arc") list = list.filter((s) => s.arc === str(scope.arc));
  return list.slice().sort((a, b) => num(a.number) - num(b.number));
}

export function sessionHeader(s) {
  return [`Session ${s.number}`, s.date, s.title].filter((x) => str(x).trim()).join(" · ");
}

/** Plain-text export with headers; to-dos as [x] / [ ]. */
export function exportText({ actorName = "", sessions = [], todos = [], misc = "", labels = {} } = {}) {
  const L = { title: "Session Notes", arc: "Arc", campaign: "Campaign", notes: "Notes", loot: "Loot found", todo: "To-Do", misc: "Misc notes", done: "done in session", ...labels };
  const rule = "=".repeat(60), sub = "-".repeat(60);
  const out = [`${L.title}: ${actorName}`.trim(), rule];
  for (const s of sessions) {
    out.push("", sessionHeader(s), sub);
    if (s.campaign) out.push(`${L.campaign}: ${s.campaign}`);
    if (s.arc) out.push(`${L.arc}: ${s.arc}`);
    const n = htmlToText(s.notes); if (n) out.push("", `${L.notes}:`, n);
    const l = htmlToText(s.loot); if (l) out.push("", `${L.loot}:`, l);
  }
  const td = values(todos);
  if (td.length) {
    out.push("", rule, L.todo, sub);
    for (const t of td) out.push(`[${t.done ? "x" : " "}] ${t.text}${t.done && t.doneIn != null ? ` (${L.done} ${t.doneIn})` : ""}`);
  }
  const m = str(misc).trim();
  if (m) out.push("", rule, L.misc, sub, m);
  return out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

/** Session -> journal page html. */
export function sessionPageHtml(s, labels = {}) {
  const L = { arc: "Arc", campaign: "Campaign", notes: "Notes", loot: "Loot found", ...labels };
  const esc = (t) => str(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const meta = [s.date && esc(s.date), s.campaign && `${esc(L.campaign)}: ${esc(s.campaign)}`, s.arc && `${esc(L.arc)}: ${esc(s.arc)}`].filter(Boolean).join(" · ");
  return `${meta ? `<p><em>${meta}</em></p>` : ""}<h2>${esc(L.notes)}</h2>${stripDataImages(s.notes) || "<p>—</p>"}<h2>${esc(L.loot)}</h2>${stripDataImages(s.loot) || "<p>—</p>"}`;
}

/** Safe file name: "Murderin Rob" -> "Murderin-Rob-sessions.txt". */
export function exportFileName(actorName, suffix = "sessions") {
  const base = str(actorName).normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || "character";
  return `${base}-${suffix}.txt`;
}
