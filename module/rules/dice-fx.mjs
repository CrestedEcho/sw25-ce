/**
 * sw25-ce: data for a NEW roll chat message (attack-card Accuracy / Evasion results, damage cards, spell cast cards).
 * A message created with `rolls` + `sound` + the roll mode applied gets the core dice sound and the native
 * Dice So Nice animation for exactly the users who may see it (public / GM / blind / self).
 */
const uniq = (a) => [...new Set(a.filter(Boolean))];

/** Pure fallback when ChatMessage.applyRollMode is missing: whisper/blind for a legacy roll-mode string. */
export function rollModeFields(mode, { selfId, gmIds = [] } = {}) {
  const gms = uniq(gmIds);
  if (mode === "selfroll") return { whisper: uniq([selfId]), blind: false };
  if (mode === "blindroll") return { whisper: gms, blind: true };
  if (mode === "gmroll") return { whisper: uniq([selfId, ...gms]), blind: false };
  return { whisper: [], blind: false };
}

export function currentRollMode() {
  try { return globalThis.sw25RollMode?.() ?? globalThis.game.settings.get("core", "rollMode"); } catch (_) { return "publicroll"; }
}

/** Adds the dice sound and the roll mode to ChatMessage create data (mutates and returns it). */
export function rollMessageData(data, { mode = currentRollMode() } = {}) {
  data.sound = globalThis.CONFIG?.sounds?.dice ?? "sounds/dice.wav";
  const CM = globalThis.ChatMessage;
  try {
    if (CM?.applyRollMode) CM.applyRollMode(data, mode);
    else {
      const f = rollModeFields(mode, { selfId: globalThis.game?.user?.id, gmIds: (globalThis.game?.users ?? []).filter((u) => u.isGM).map((u) => u.id) });
      if (f.whisper.length) data.whisper = f.whisper;
      if (f.blind) data.blind = true;
    }
  } catch (e) { console.warn("sw25 | roll mode", e); }
  return data;
}
