/**
 * Minimal functional NPC/Monster stat-block wiring (final layout comes from the Artist's mockup).
 * - Injected "Stat block (sw25-ce)" panel: scalar fields bound to system.sb.*, arrays edited as JSON,
 *   lock/quill per numeric field (system.sb.overrides.<path>.{value,locked}).
 * - Hostile toggle / attitude / disposition -> prototype + placed token disposition.
 */
import { dispositionFor, npcToggleDisposition, monsterToggleDisposition } from "./statblock.mjs";

const SYS = "sw25-ce";
const QUILL = `systems/${SYS}/assets/ui/override-quill.webp`;
const esc = (s) => foundry.utils.escapeHTML?.(String(s ?? "")) ?? String(s ?? "");
const get = foundry.utils.getProperty;

const NUM_FIELDS = ["level", "reputation", "weakness", "initiative", "movement.ground", "movement.other", "fortitude.value", "willpower.value", "swordShards"];
const MON_TEXT = ["monsterType", "intelligence", "perception", "disposition"];
const NPC_TEXT = ["title", "faction", "settlement", "race", "attitude", "intelligence", "perception"];
const JSON_FIELDS = ["parts", "uniqueSkills", "loot", "languages", "habitat", "classLevels", "relationships", "services"];

function numRow(actor, path) {
  const view = actor.system.sbView ?? {};
  const o = get(actor.system.sb?.overrides ?? {}, path) ?? {};
  const locked = (view.locked ?? []).includes(path);
  return `<label class="sb-num" style="display:inline-flex;gap:3px;align-items:center;margin:2px 8px 2px 0">
    ${locked ? `<img src="${QUILL}" title="Manual override" style="width:14px;height:14px;border:0">` : ""}${esc(path)}
    <input type="number" name="system.sb.${path}" value="${esc(get(actor.system.sb ?? {}, path) ?? "")}" data-dtype="Number" style="width:48px">
    <span title="locked value">🔒<input type="checkbox" name="system.sb.overrides.${path}.locked" data-dtype="Boolean" ${o.locked ? "checked" : ""}></span>
    <input type="number" name="system.sb.overrides.${path}.value" value="${esc(o.value ?? "")}" data-dtype="Number" style="width:44px" placeholder="=">
    <span style="opacity:.7">→ ${esc(get(view, path) ?? "–")}</span></label>`;
}

function panel(actor, open) {
  const npc = actor.type === "npc"; const sb = actor.system.sb ?? {}; const v = actor.system.sbView ?? {};
  const text = (npc ? NPC_TEXT : MON_TEXT).map((k) => `<label style="margin-right:8px">${k} <input type="text" name="system.sb.${k}" value="${esc(sb[k])}" style="width:110px"></label>`).join("");
  const parts = (v.parts ?? []).map((p) => `<tr><td>${p.isCore ? "★" : ""}${esc(p.name)}${p.count > 1 ? ` x${p.count}` : ""}</td><td>${p.accuracy ? `${p.accuracy.value}(${p.accuracy.fixed})` : "–"}</td><td>${esc(p.damage ?? "–")}</td><td>${p.evasion ? `${p.evasion.value}(${p.evasion.fixed})` : "–"}</td><td>${esc(p.defense)}</td><td>${esc(p.hpValue)}/${esc(p.hp)}</td><td>${esc(p.mpValue ?? "–")}/${esc(p.mp ?? "–")}</td></tr>`).join("");
  const json = JSON_FIELDS.filter((k) => npc || !["classLevels", "relationships", "services"].includes(k))
    .map((k) => `<label style="display:block">${k}<textarea class="sb-json" data-field="${k}" rows="2" style="width:100%;font-family:monospace;font-size:0.8em">${esc(JSON.stringify(sb[k] ?? []))}</textarea></label>`).join("");
  return `<details class="sw-statblock" ${open ? "open" : ""} style="margin:4px 0;padding:4px;border:1px solid ${npc && !sb.hostile ? "#2a8a8a" : "#a5512a"}">
    <summary><b>Stat block (sw25-ce)</b> ${npc ? `<label style="margin-left:12px"><input type="checkbox" name="system.sb.hostile" data-dtype="Boolean" ${sb.hostile ? "checked" : ""}> Hostile</label>` : ""}
      <span style="opacity:.7"> Fort ${v.fortitude?.value ?? 0}(${v.fortitude?.fixed ?? 7}) · Will ${v.willpower?.value ?? 0}(${v.willpower?.fixed ?? 7}) · Move ${v.movement?.ground ?? "–"}${v.movement?.groundMode ? `(${esc(v.movement.groundMode)})` : ""}${v.movement?.other != null ? `/${v.movement.other}` : ""} · Sections ${v.partCount ?? 1}</span></summary>
    <div>${text}</div>
    <div><label>weakPoint <input type="text" name="system.sb.weakPoint" value="${esc(sb.weakPoint)}" style="width:200px"></label>
      <label><input type="checkbox" name="system.sb.useFixed" data-dtype="Boolean" ${sb.useFixed ? "checked" : ""}> useFixed</label>
      <label><input type="checkbox" name="system.sb.useDeathCheck" data-dtype="Boolean" ${sb.useDeathCheck ? "checked" : ""}> useDeathCheck</label></div>
    <div>${NUM_FIELDS.map((p) => numRow(actor, p)).join("")}</div>
    ${parts ? `<table style="font-size:0.85em"><thead><tr><th>Part</th><th>Acc</th><th>Dmg</th><th>Eva</th><th>Def</th><th>HP</th><th>MP</th></tr></thead><tbody>${parts}</tbody></table>` : ""}
    ${json}
  </details>`;
}

/** Set prototype + every placed token (all scenes' active tokens of this actor) to the derived disposition. */
export async function syncDisposition(actor, { toggled = false } = {}) {
  let key = dispositionFor(actor.system.sbView ?? actor.system.sb ?? {}, actor.type);
  if (toggled && actor.type === "npc") key = npcToggleDisposition({ hostile: !!actor.system.sb?.hostile, fellow: !!actor.system.fellow?.enabled });
  if (actor.type !== "npc") key = monsterToggleDisposition({ neutral: !!actor.system.sb?.neutral }); // toggle always wins
  const d = CONST.TOKEN_DISPOSITIONS[key];
  if (d === undefined) return;
  if (actor.prototypeToken?.disposition !== d) await actor.update({ "prototypeToken.disposition": d }, { sw25Slot: true });
  const docs = new Set(actor.getActiveTokens(false, true));
  for (const sc of game.scenes ?? []) for (const t of sc.tokens) if (t.actorId === actor.id) docs.add(t);
  for (const t of docs) if (t.disposition !== d && t.isOwner) await t.update({ disposition: d });
}

export function registerStatBlockUI() {
  const mine = (userId) => userId === game.user.id;
  Hooks.on("preCreateActor", (actor, data) => {
    if (!["npc", "monster"].includes(actor.type) || foundry.utils.hasProperty(data, "prototypeToken.disposition")) return;
    const d = CONST.TOKEN_DISPOSITIONS[dispositionFor(data.system?.sb ?? {}, actor.type)];
    if (d !== undefined) actor.updateSource({ "prototypeToken.disposition": d });
  });
  Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (!mine(userId) || !["npc", "monster"].includes(actor.type) || options?.sw25Slot) return;
    const sb = changes.system?.sb ?? {};
    const fellowToggled = foundry.utils.hasProperty(changes, "system.fellow.enabled");
    if (fellowToggled || ["hostile", "neutral", "attitude", "disposition"].some((k) => k in sb)) syncDisposition(actor, { toggled: fellowToggled || "hostile" in sb || "neutral" in sb });
  });
  Hooks.on("renderActorSheet", (app, html) => {
    const actor = app.actor;
    if (!["npc", "monster"].includes(actor?.type)) return;
    if (app.options?.classes?.includes("sw25-sb")) return; // styled stat-block sheet renders this natively
    const root = html[0] ?? html;
    const body = [...(root.querySelectorAll?.(".sheet-body") ?? [])].find((e) => e.offsetParent !== null) ?? root.querySelector?.(".sheet-body");
    if (!body || root.querySelector(".sw-statblock")) return;
    body.insertAdjacentHTML("beforebegin", panel(actor, app._sw25SbOpen ?? false));
    const det = root.querySelector(".sw-statblock");
    det.addEventListener("toggle", () => { app._sw25SbOpen = det.open; });
    // Hostile NPC: Combat tab first (best effort on the legacy tab bar)
    if (actor.type === "npc" && actor.system.sb?.hostile) root.querySelector('.sheet-tabs [data-tab="combat"], .sheet-tabs [data-tab="battle"]')?.parentElement?.prepend(root.querySelector('.sheet-tabs [data-tab="combat"], .sheet-tabs [data-tab="battle"]'));
    if (!app.isEditable) { det.querySelectorAll("input,textarea").forEach((i) => { i.disabled = true; }); return; }
    det.querySelectorAll(".sb-json").forEach((ta) => ta.addEventListener("change", (ev) => {
      ev.stopPropagation();
      let v; try { v = JSON.parse(ta.value); } catch (e) { ta.style.outline = "2px solid red"; return ui.notifications.warn(`${ta.dataset.field}: invalid JSON`); }
      actor.update({ [`system.sb.${ta.dataset.field}`]: v });
    }));
  });
}
