/* sw25-ce: apply a damage card to the tokens targeted at click time (spell and weapon cards share this). Foundry-side. */
import { applySbCost } from "./sb-cast.mjs";
import { resolveTargetTokens, NO_TOKENS_MSG } from "../helpers/target-chips.mjs";
import { damageTaken, healedHP } from "./spell-power.mjs";
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const card = (kind, lines) => ChatMessage.create({ content: `<div class="sw25-spelldmg"><b>${kind === "heal" ? "Healing" : kind === "physical" ? "Physical damage" : kind === "fixed" ? "Fixed damage" : "Magic damage"} applied</b><br>${lines.join("<br>")}</div>` });
/** Click handler: owned targets are applied here; the rest go to the GM over the "system.sw25" socket. */
export async function applyDamageToTargets(amount, kind = "magic") {
  const tokens = resolveTargetTokens().filter((t) => t.actor);
  if (!tokens.length) return ui.notifications.warn(NO_TOKENS_MSG);
  const mine = tokens.filter((t) => t.actor.isOwner); const remote = tokens.filter((t) => !t.actor.isOwner);
  if (remote.length) {
    if (!game.users.some((u) => u.isGM && u.active)) ui.notifications.warn("No GM is connected to apply damage to targets you don't own.");
    else game.socket.emit("system.sw25", { method: "applyDamage", amount: Number(amount) || 0, kind, targetTokens: remote.map((t) => t.id) });
  }
  if (mine.length) return applyDamageToActors(mine.map((t) => t.actor), amount, kind);
}
/** GM side of the socket (and local owners). */
export async function applyDamageToTokenIds(ids, amount, kind) {
  const actors = (ids ?? []).map((id) => canvas.tokens.get(id)?.actor).filter(Boolean);
  if (actors.length) return applyDamageToActors(actors, amount, kind);
}
export async function applyDamageToActors(targets, amount, kind) {
  const lines = [];
  for (const a of targets) {
    if (kind === "heal") { lines.push(await healActor(a, amount)); continue; }
    const weakPoint = a.system?.sb?.weakPoint ?? ""; const revealed = a.system?.sb?.weaknessRevealed === true;
    if (a.type === "character") {
      const defense = Number(a.system.attributes?.protectionpoint) || 0;
      const dmg = kind === "fixed" ? Math.max(0, Number(amount) || 0) : damageTaken(amount, { kind, defense, weakPoint: "", revealed });
      const before = Number(a.system.hp?.value) || 0; await a.update({ "system.hp.value": before - dmg });
      lines.push(`${esc(a.name)}: ${dmg}${kind === "physical" ? ` (Defense ${defense})` : ""} → HP ${before - dmg}`);
    } else if (a.system?.sb) {
      const raw = a._source.system?.sb ?? {}; const rawParts = Array.isArray(raw.parts) ? raw.parts : Object.values(raw.parts ?? {});
      const viewParts = a.system.sbView?.parts ?? []; const core = Math.max(0, viewParts.findIndex((p) => p.isCore));
      const defense = Number(viewParts[core]?.defense) || 0;
      const dmg = kind === "fixed" ? Math.max(0, Number(amount) || 0) : damageTaken(amount, { kind, defense, weakPoint, revealed });
      const base = Math.max(0, (Number(amount) || 0) - (kind === "physical" ? defense : 0));
      const out = applySbCost(rawParts, viewParts, { mp: 0, hp: dmg, partIndex: core });
      if (out.index < 0) { lines.push(`${esc(a.name)}: no parts`); continue; }
      await a.update({ "system.sb.parts": out.parts });
      lines.push(`${esc(a.name)}: ${dmg}${kind === "physical" ? ` (Defense ${defense})` : ""}${dmg > base ? ` (incl. weak point +${dmg - base})` : ""} → HP ${out.hpAfter}`);
    } else lines.push(`${esc(a.name)}: unsupported actor type ${esc(a.type)} (use the card's own apply buttons)`);
  }
  return card(kind, lines);
}
async function healActor(a, amount) {
  if (a.type === "character") {
    const before = Number(a.system.hp?.value) || 0; const after = healedHP(before, amount, a.system.hp?.max);
    await a.update({ "system.hp.value": after }); return `${esc(a.name)}: +${after - before} → HP ${after}`;
  }
  if (!a.system?.sb) return `${esc(a.name)}: unsupported actor type ${esc(a.type)}`;
  const raw = a._source.system?.sb ?? {}; const parts = structuredClone(Array.isArray(raw.parts) ? raw.parts : Object.values(raw.parts ?? {}));
  const view = a.system.sbView?.parts ?? []; const ci = Math.max(0, view.findIndex((p) => p.isCore)); if (!parts[ci]) return `${esc(a.name)}: no parts`;
  const v = view[ci] ?? {}; const before = Number(parts[ci].hpValue ?? v.hpValue ?? v.hp ?? 0); const after = healedHP(before, amount, v.hp);
  parts[ci].hpValue = after; await a.update({ "system.sb.parts": parts }); return `${esc(a.name)}: +${after - before} → HP ${after}`;
}

/** Legacy damage-card buttons (Physical / Magic / Fixed / Heal HP) on a stat-block actor: same HP path as Apply. */
export const LEGACY_KIND = { buttonpd: "physical", buttonmd: "magic", buttoncd: "fixed", buttonhr: "heal" };
export async function applyLegacyToStatBlock(token, amount, buttonType) {
  const kind = LEGACY_KIND[buttonType]; const a = token?.actor;
  if (!kind) return ui.notifications.warn(`${a?.name ?? "Target"}: stat blocks have no MP pool to restore here; use the stat-block sheet.`);
  if (a.isOwner) return applyDamageToActors([a], amount, kind);
  if (!game.users.some((u) => u.isGM && u.active)) return ui.notifications.warn("No GM is connected to apply damage to targets you don't own.");
  game.socket.emit("system.sw25", { method: "applyDamage", amount: Number(amount) || 0, kind, targetTokens: [token.id] });
}
