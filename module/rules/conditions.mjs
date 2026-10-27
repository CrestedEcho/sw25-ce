/* sw25-ce: Sword World 2.5 conditions for the token HUD "Assign Status Effect" palette.
 * Tracking markers ONLY: no `changes`, so they never alter any calculation. Spell effects that define
 * their own modifiers (system.status.changes) carry those on the spell's ActiveEffect, not here.
 * Icons: Foundry core icons/svg/*.svg only. "dead" stays the core defeated id.
 */
const I = (n) => `icons/svg/${n}.svg`;

/** [id, English name, icon, plain-words description]. Ids are stable: do not rename (saved effects use them). */
export const CONDITIONS = [
  ["prone", "Prone", "falling", "On the ground: -2 to action checks. Stand up with a Minor Action."],
  ["unconscious", "Unconscious", "unconscious", "HP 0 or less: can't act; make Death Checks."],
  ["asleep", "Asleep", "sleep", "Can't move or act; -4 to checks. Damage or a shake wakes them."],
  ["petrified", "Petrified", "stoned", "Turning to stone (ability score lowered) or fully a statue."],
  ["entangled", "Entangled", "net", "Held or tangled: movement limited; break free with a Major Action."],
  ["blinded", "Blinded", "blind", "Can't see: everyone counts as invisible to them."],
  ["invisible", "Invisible", "invisible", "Can't be targeted directly: attackers -4 Accuracy."],
  ["flying", "Flying", "wing", "In the air: Full Move only; falls if knocked out or the flight ends."],
  ["stun", "Stunned", "daze", "Automatically fails the next Evasion check, which ends it."],
  ["fear", "Frightened", "terror", "Afraid: slowed (-1 checks), fleeing, or cowering, per the Fear table."],
  ["frenzy", "Frenzied", "lightning", "Berserk: no reason-based actions or spells; +2 Accuracy, -2 Evasion."],
  ["confused", "Confused", "aura", "Can't choose its own targets: they are picked at random or forced."],
  ["charmed", "Charmed / Dominated", "angel", "Treats the caster as a friend, or obeys them more easily."],
  ["hungry", "Hungry / Sleep-deprived", "downgrade", "Missed a meal or sleep: Max HP and MP -1, -1 to skill checks."],
  ["intoxicated", "Intoxicated", "tankard", "Still drunk: -1 to skill checks."],
  ["poison", "Poisoned", "poison", "Marker: under a poison-type effect (Cure Poison removes it)."],
  ["curse", "Cursed", "sun", "Marker: under a curse-type effect (only Remove Curse removes it)."],
  ["disease", "Diseased", "biohazard", "Marker: under a disease-type effect (Cure Disease removes it)."],
  ["dead", "Dead", "skull", "Dead or defeated."],
].map(([id, name, icon, description]) => ({ id, name, icon: I(icon), description }));

const KEY = (id) => `SW25.Condition.${id}`;

/** Old / core ids that existing data may use -> our id. */
export const CONDITION_ALIASES = { sleep: "asleep", blind: "blinded", fly: "flying", hover: "flying", restrain: "entangled", stunned: "stun", frightened: "fear", frenzied: "frenzy", berserk: "frenzy",
  poisoned: "poison", cursed: "curse", diseased: "disease", petrifaction: "petrified", stone: "petrified", charm: "charmed", dominated: "charmed", drunk: "intoxicated", defeated: "dead" };

export function conditionId(id) {
  const k = String(id ?? "").trim().toLowerCase(); if (!k) return "";
  if (CONDITIONS.some((c) => c.id === k)) return k;
  return CONDITION_ALIASES[k] ?? "";
}
export function conditionFor(id) { const c = conditionId(id); return c ? CONDITIONS.find((x) => x.id === c) : null; }

/** CONFIG.statusEffects entries: name = i18n key, img, description; no `changes` (tracking only). */
export function statusEffectsConfig() {
  return CONDITIONS.map((c) => ({ id: c.id, name: `${KEY(c.id)}.Name`, img: c.icon, description: `${KEY(c.id)}.Desc` }));
}
/** lang/en.json fragment for SW25.Condition. */
export function conditionLang() {
  return Object.fromEntries(CONDITIONS.map((c) => [c.id, { Name: c.name, Desc: c.description }]));
}

/** Call in the system init hook. */
export function registerConditions() {
  CONFIG.statusEffects = statusEffectsConfig();
  // Markers only: keep "dead" as the defeated status; stop core vision/flight side effects from these markers.
  if (CONFIG.specialStatusEffects) Object.assign(CONFIG.specialStatusEffects, { DEFEATED: "dead", BLIND: "sw25-none-blind", INVISIBLE: "sw25-none-invisible", FLY: "sw25-none-fly", HOVER: "sw25-none-hover", BURROW: "sw25-none-burrow" });
  Hooks.on("updateCombat", (combat, changes) => { if (changes.turn !== undefined || changes.round !== undefined) expireSpellEffects(combat); });
  // Tooltip on the HUD palette: name + plain-words description.
  Hooks.on("renderTokenHUD", (_hud, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    root?.querySelectorAll?.("[data-status-id]").forEach((el) => {
      const c = CONDITIONS.find((x) => x.id === el.dataset.statusId); if (!c) return;
      el.dataset.tooltip = `${game.i18n.localize(`${KEY(c.id)}.Name`)}: ${game.i18n.localize(`${KEY(c.id)}.Desc`)}`;
    });
  });
  // Statuses applied through the HUD get the localized description on the effect too.
  Hooks.on("preCreateActiveEffect", (eff, data) => {
    const ids = [...(data.statuses ?? [])]; if (ids.length !== 1) return;
    const c = CONDITIONS.find((x) => x.id === ids[0]); if (!c) return;
    const upd = {};
    if (!data.description || String(data.description).startsWith("SW25.Condition.")) upd.description = `<p>${game.i18n.localize(`${KEY(c.id)}.Desc`)}</p>`;
    if (!data.name || String(data.name).startsWith("SW25.Condition.")) upd.name = game.i18n.localize(`${KEY(c.id)}.Name`);
    if (Object.keys(upd).length) eff.updateSource(upd);
  });
}

/** Pure: has a rounds-based duration run out? Ends at the start of the caster's turn `rounds` rounds later. */
export function isEffectExpired(d = {}, now = {}) {
  const rounds = Number(d.rounds) || 0; if (!rounds || d.startRound == null || now.round == null) return false;
  const endRound = Number(d.startRound) + rounds;
  if (now.round > endRound) return true;
  return now.round === endRound && (Number(now.turn) || 0) >= (Number(d.startTurn) || 0);
}

/** Active GM: delete spell-applied effects (flag sw25-ce.spellEffect) whose rounds are up. */
export async function expireSpellEffects(combat) {
  if (!game.user.isGM || game.user.id !== game.users.activeGM?.id) return;
  const now = { round: combat.round, turn: combat.turn };
  for (const c of combat.combatants) {
    const a = c.actor; if (!a) continue;
    const ids = a.effects.filter((e) => e.flags?.["sw25-ce"]?.spellEffect && (!e.duration?.combat || e.duration.combat === combat.id) && isEffectExpired(e.duration ?? {}, now)).map((e) => e.id);
    if (ids.length) {
      const names = ids.map((id) => a.effects.get(id)?.name).filter(Boolean);
      await a.deleteEmbeddedDocuments("ActiveEffect", ids);
      ChatMessage.create({ content: `<div class="sw25-spelldmg">${foundry.utils.escapeHTML(a.name)}: ${names.map((n) => foundry.utils.escapeHTML(n)).join(", ")} ended</div>`, whisper: ChatMessage.getWhisperRecipients("GM") });
    }
  }
}
