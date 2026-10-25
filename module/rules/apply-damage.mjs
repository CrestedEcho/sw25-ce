/* sw25-ce: apply a damage card to the tokens targeted at click time (spell and weapon cards share this). Foundry-side. */
import { applySbCost } from "./sb-cast.mjs";
import { damageTaken } from "./spell-power.mjs";
export async function applyDamageToTargets(amount, kind = "magic") {
  const targets = [...(game.user.targets ?? [])].map((t) => t.actor).filter(Boolean);
  if (!targets.length) return ui.notifications.warn("Target one or more tokens first.");
  const esc = (s) => foundry.utils.escapeHTML(String(s ?? "")); const lines = [];
  for (const a of targets) {
    const weakPoint = a.system?.sb?.weakPoint ?? ""; const revealed = a.system?.sb?.weaknessRevealed === true;
    if (a.type === "character") {
      const defense = Number(a.system.attributes?.protectionpoint) || 0;
      const dmg = damageTaken(amount, { kind, defense, weakPoint: "", revealed });
      const before = Number(a.system.hp?.value) || 0; await a.update({ "system.hp.value": before - dmg });
      lines.push(`${esc(a.name)}: ${dmg}${kind === "physical" ? ` (Defense ${defense})` : ""} → HP ${before - dmg}`);
    } else if (a.system?.sb) {
      const raw = a._source.system?.sb ?? {}; const rawParts = Array.isArray(raw.parts) ? raw.parts : Object.values(raw.parts ?? {});
      const viewParts = a.system.sbView?.parts ?? []; const core = Math.max(0, viewParts.findIndex((p) => p.isCore));
      const defense = Number(viewParts[core]?.defense) || 0;
      const dmg = damageTaken(amount, { kind, defense, weakPoint, revealed });
      const base = Math.max(0, (Number(amount) || 0) - (kind === "physical" ? defense : 0));
      const out = applySbCost(rawParts, viewParts, { mp: 0, hp: dmg, partIndex: core });
      if (out.index < 0) { lines.push(`${esc(a.name)}: no parts`); continue; }
      await a.update({ "system.sb.parts": out.parts });
      lines.push(`${esc(a.name)}: ${dmg}${kind === "physical" ? ` (Defense ${defense})` : ""}${dmg > base ? ` (incl. weak point +${dmg - base})` : ""} → HP ${out.hpAfter}`);
    } else lines.push(`${esc(a.name)}: unsupported actor type ${esc(a.type)} (use the card's own apply buttons)`);
  }
  return ChatMessage.create({ content: `<div class="sw25-spelldmg"><b>${kind === "physical" ? "Physical" : "Magic"} damage applied</b><br>${lines.join("<br>")}</div>` });
}
