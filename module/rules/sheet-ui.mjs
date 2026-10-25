/**
 * sw25-ce rule-engine UI (injected by hooks; no template context changes needed):
 *  - Character sheet: "Overrides" panel (misc mod + locked manual value per target, quill marker), rule notes.
 *  - Skill (class) item sheet: rules list + grants editor for homebrew classes.
 */
import { ACTOR_TARGETS, normalizeRules, grantList } from "./engine.mjs";

const SYS = "sw25-ce";
const QUILL = `systems/${SYS}/assets/ui/override-quill.webp`;
const esc = (s) => foundry.utils.escapeHTML?.(String(s ?? "")) ?? String(s ?? "");
const OV_TARGETS = ["hp.max", "mp.max", "ability.dex", "ability.agi", "ability.str", "ability.vit", "ability.int", "ability.mnd",
  "evasion", "defense", "accuracy", "magic.power.sc", "magic.power.cn", "magic.power.wz", "magic.power.pr", "magic.power.mt",
  "magic.power.fr", "magic.power.dr", "magic.power.dm", "magic.power.ab", "magic.power.bm"];
const okey = (t) => t.replace(/\./g, "_");
const quill = (title) => `<img src="${QUILL}" class="sw-quill" title="${esc(title)}" style="width:16px;height:16px;border:0;vertical-align:middle">`;

function overridesPanel(actor, open) {
  const sd = actor.system;
  const rep = sd.rulesReport ?? {};
  const rows = OV_TARGETS.filter((t) => !t.startsWith("magic.power.") || sd.attributes?.[`${t.split(".")[2]}skill`] || rep[t]).map((t) => {
    const k = okey(t); const o = sd.overrides?.[k] ?? {};
    const path = ACTOR_TARGETS[t];
    const cur = foundry.utils.getProperty(sd, path);
    const r = rep[t];
    const mark = o.locked ? quill(`Manual override: ${o.value}`) : "";
    const rules = r?.applied?.length ? ` data-tooltip="${esc(r.applied.map((a) => `${a.label ?? a.key} (${a.source})`).join("; "))}"` : "";
    return `<tr><td>${mark} <span${rules}>${esc(t)}</span></td><td>${esc(cur ?? "–")}</td>
      <td><input type="number" name="system.overrides.${k}.mod" value="${Number(o.mod) || 0}" data-dtype="Number" style="width:48px"></td>
      <td><input type="checkbox" name="system.overrides.${k}.locked" data-dtype="Boolean" ${o.locked ? "checked" : ""}></td>
      <td><input type="number" name="system.overrides.${k}.value" value="${o.value ?? ""}" data-dtype="Number" style="width:56px"></td></tr>`;
  }).join("");
  const notes = (sd.rulesNotes ?? []).map((n) => `<li>${esc(n.source)}: <b>${esc(n.label)}</b> ${n.value != null && typeof n.value !== "object" ? esc(n.value) : ""} <i>(${esc(n.reason ?? "note")})</i></li>`).join("");
  const checks = (sd.classRules?.checkMods ?? []).map((c) => `<li>${esc(c.source)}: ${esc(c.checks?.join(", ") ?? c.key)} ${c.value > 0 ? "+" : ""}${esc(c.value)} ${c.active ? "" : "<i>(inactive)</i>"}</li>`).join("");
  return `<details class="advanced sw-overrides" data-sw25-adv="overrides" ${open ? "open" : ""}>
    <summary>${quill("Overrides")} Overrides &amp; class rules</summary>
    <table style="font-size:0.85em"><thead><tr><th>Target</th><th>Value</th><th>Misc</th><th>Lock</th><th>Manual</th></tr></thead><tbody>${rows}</tbody></table>
    ${checks ? `<h4>Check modifiers</h4><ul>${checks}</ul>` : ""}
    ${notes ? `<h4>Rule notes (not automated)</h4><ul>${notes}</ul>` : ""}
  </details>`;
}

const RULE_FIELDS = ["key", "mode", "value", "level_min", "level_max", "predicate", "priority", "label"];
const MODES = ["add", "multiply", "override", "upgrade", "downgrade"];

function classEditor(item) {
  const rules = normalizeRules(item.system.rules);
  const grants = grantList(item.system.autoFeats);
  const choices = item.getFlag(SYS, "choices") ?? {};
  const rRows = rules.map((r, i) => `<tr data-index="${i}">
    <td><input class="rr" data-f="key" value="${esc(r.key)}" style="width:150px"></td>
    <td><select class="rr" data-f="mode">${MODES.map((m) => `<option ${m === (r.mode ?? "add") ? "selected" : ""}>${m}</option>`).join("")}</select></td>
    <td><input class="rr" data-f="value" value="${esc(typeof r.value === "object" ? JSON.stringify(r.value) : r.value)}" style="width:80px"></td>
    <td><input class="rr" data-f="level_min" type="number" value="${r.level_min ?? ""}" style="width:36px"></td>
    <td><input class="rr" data-f="level_max" type="number" value="${r.level_max ?? ""}" style="width:36px"></td>
    <td><input class="rr" data-f="predicate" value="${esc([].concat(r.predicate ?? []).join(", "))}" style="width:120px"></td>
    <td><a class="rr-del"><i class="fas fa-trash"></i></a></td></tr>`).join("");
  const gRows = grants.map((g, i) => g.choose
    ? `<li data-index="${i}">Lv ${g.level}: choose <b>${esc(g.choose)}</b> ${g.options.length ? `(${g.options.length} options)` : "(manual pick)"} → <i>${esc(choices[g.choose] ?? "unset")}</i> <a class="gc-reset" data-id="${esc(g.choose)}" title="Clear choice"><i class="fas fa-rotate-left"></i></a> <a class="gr-del"><i class="fas fa-trash"></i></a></li>`
    : `<li data-index="${i}">Lv <input class="gr-level" type="number" min="1" max="20" value="${g.level}" style="width:40px"> ${esc(g.kind)}: ${esc(g.name ?? g.ref)}${g.when ? ` <i>when ${esc(JSON.stringify(g.when))}</i>` : ""} <a class="gr-del"><i class="fas fa-trash"></i></a></li>`).join("");
  return `<p class="notes">Rules: key / mode / value (number or formula with @level, @abilities.str.value) / level min–max / predicates (comma separated). Unknown keys are kept as notes.</p>
    <table style="font-size:0.85em"><thead><tr><th>Key</th><th>Mode</th><th>Value</th><th>Lv≥</th><th>Lv≤</th><th>Predicate</th><th></th></tr></thead><tbody>${rRows}</tbody></table>
    <a class="rr-add"><i class="fas fa-plus"></i> Add rule</a>
    <h4>Grants</h4><ul class="gr-list" style="list-style:none;padding:0;margin:0">${gRows}</ul>
    <div class="gr-drop" style="border:1px dashed #999;padding:6px;text-align:center;margin-top:4px">Drop a feat, spell or feature here to grant it at a level</div>
    <a class="gc-add"><i class="fas fa-plus"></i> Add choice (e.g. god)</a>`;
}

function parseRuleField(f, v) {
  if (["level_min", "level_max", "priority"].includes(f)) return v === "" ? null : Number(v);
  if (f === "predicate") return v.split(",").map((s) => s.trim()).filter(Boolean);
  if (f === "value") { const t = v.trim(); if (t === "") return 0; if (!isNaN(Number(t))) return Number(t); if (/^[{[]/.test(t)) { try { return JSON.parse(t); } catch (e) { /* keep text */ } } return t; }
  return v;
}

export function registerRulesUI() {
  Hooks.on("renderActorSheet", (app, html) => {
    const actor = app.actor;
    if (actor?.type !== "character") return;
    const root = html[0] ?? html;
    const anchor = root.querySelector?.('details.advanced[data-sw25-adv="combat"]');
    if (!anchor || root.querySelector(".sw-overrides")) return;
    const open = app._sw25OvOpen ?? false;
    anchor.insertAdjacentHTML("afterend", overridesPanel(actor, open));
    const det = root.querySelector(".sw-overrides");
    det.addEventListener("toggle", () => { app._sw25OvOpen = det.open; });
    if (!app.isEditable) det.querySelectorAll("input").forEach((i) => { i.disabled = true; });
    // locking with an empty manual value seeds it from the current value
    det.querySelectorAll('input[name$=".locked"]').forEach((cb) => cb.addEventListener("change", (ev) => {
      const k = cb.name.split(".")[2]; const t = OV_TARGETS.find((x) => okey(x) === k);
      const val = det.querySelector(`input[name="system.overrides.${k}.value"]`);
      if (cb.checked && val && val.value === "") val.value = foundry.utils.getProperty(actor.system, ACTOR_TARGETS[t]) ?? "";
    }, { capture: true }));
  });

  Hooks.on("renderItemSheet", (app, html) => {
    const item = app.item ?? app.document;
    if (item?.type !== "skill") return;
    const root = html[0] ?? html;
    const box = root.querySelector?.(".sw-classrules .sw-rules-editor");
    if (!box) return;
    box.innerHTML = classEditor(item);
    if (!app.isEditable) { box.querySelectorAll("input,select,a").forEach((e) => { e.disabled = true; e.style.pointerEvents = "none"; }); return; }
    const rules = () => foundry.utils.deepClone(normalizeRules(item.system.rules));
    const grants = () => foundry.utils.deepClone(Array.isArray(item.system.autoFeats) ? item.system.autoFeats : Object.values(item.system.autoFeats ?? {}));
    const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    box.querySelectorAll(".rr").forEach((inp) => inp.addEventListener("change", (ev) => {
      stop(ev); const l = rules(); const i = Number(inp.closest("tr").dataset.index);
      l[i][inp.dataset.f] = parseRuleField(inp.dataset.f, inp.value);
      item.update({ "system.rules": l });
    }));
    box.querySelectorAll(".rr-del").forEach((a) => a.addEventListener("click", (ev) => { stop(ev); const l = rules(); l.splice(Number(a.closest("tr").dataset.index), 1); item.update({ "system.rules": l }); }));
    box.querySelector(".rr-add")?.addEventListener("click", (ev) => { stop(ev); item.update({ "system.rules": [...rules(), { key: "hp.bonus", mode: "add", value: 0, level_min: 1, label: "" }] }); });
    box.querySelectorAll(".gr-level").forEach((inp) => inp.addEventListener("change", (ev) => { stop(ev); const l = grants(); l[Number(inp.closest("li").dataset.index)].level = Number(inp.value) || 1; item.update({ "system.autoFeats": l }); }));
    box.querySelectorAll(".gr-del").forEach((a) => a.addEventListener("click", (ev) => { stop(ev); const l = grants(); l.splice(Number(a.closest("li").dataset.index), 1); item.update({ "system.autoFeats": l }); }));
    box.querySelectorAll(".gc-reset").forEach((a) => a.addEventListener("click", (ev) => { stop(ev); item.unsetFlag(SYS, `choices.${a.dataset.id}`); }));
    box.querySelector(".gc-add")?.addEventListener("click", async (ev) => {
      stop(ev);
      const id = await foundry.applications.api.DialogV2.prompt({ window: { title: "Choice id" }, content: `<input name="id" value="god">`, ok: { callback: (e, b) => b.form.elements.id.value }, rejectClose: false });
      if (id) item.update({ "system.autoFeats": [...grants(), { choose: String(id).trim(), options: [], level: 1 }] });
    });
    const drop = box.querySelector(".gr-drop");
    drop?.addEventListener("dragover", (ev) => ev.preventDefault());
    drop?.addEventListener("drop", async (ev) => {
      stop(ev);
      let data; try { data = JSON.parse(ev.dataTransfer.getData("text/plain")); } catch (e) { return; }
      if (data?.type !== "Item") return;
      const src = await fromUuid(data.uuid);
      if (!src) return;
      const kind = src.type === "combatability" ? "feat" : src.type === "spell" ? "spell" : ["otherfeature", "raceability"].includes(src.type) ? "feature" : "technique";
      const l = grants();
      if (!l.some((f) => (f.ref ?? f.uuid) === src.uuid)) l.push({ kind, ref: src.uuid, level: 1, name: src.name });
      item.update({ "system.autoFeats": l });
    });
  });
}
