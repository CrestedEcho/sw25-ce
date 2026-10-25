/**
 * sw25-ce spell cast options dialog (MP cost): influence surcharge checkbox per cast and
 * Metamagic/Targets target count (MP x targets), with a live cost preview.
 * Returns { cost, label } or null when cancelled. Without applicable rules: no dialog.
 */
import * as SC from "./spell-cast.mjs";

const esc = (s) => foundry.utils.escapeHTML?.(String(s ?? "")) ?? String(s ?? "");
const RANK_CACHE = new Map();

/** Deity rank for a god slug from the sw25-gods compendium (flags.sw25-ce.rank). */
export async function godRank(slug) {
  if (!slug) return null;
  if (RANK_CACHE.has(slug)) return RANK_CACHE.get(slug);
  let rank = null;
  const pack = game.packs.get("sw25-ce.sw25-gods");
  if (pack) {
    const idx = await pack.getIndex({ fields: ["flags.sw25-ce.slug", "flags.sw25-ce.rank"] });
    const e = idx.find((x) => x.flags?.["sw25-ce"]?.slug === slug || x.name?.toLowerCase() === String(slug).toLowerCase());
    rank = e?.flags?.["sw25-ce"]?.rank ?? null;
  }
  RANK_CACHE.set(slug, rank);
  return rank;
}

/** Context the dialog needs (pure data, separated for clarity). */
export async function castOptionsFor(actor, item) {
  const eng = actor?.system?._rules;
  if (!eng || item?.type !== "spell") return { surcharges: [], targets: null };
  const skill = item.system?.checkskill;
  const surcharges = [];
  for (const r of SC.surchargeRules(eng.active)) {
    if (skill && r.source && skill !== r.source) continue;
    const rank = String(r.choices.godRank ?? (await godRank(r.choices.god)) ?? "").toLowerCase() || null;
    surcharges.push({ ...r, rank, mp: SC.influenceSurcharge(r, rank) });
  }
  return { surcharges: surcharges.filter((s) => s.mp > 0 || !s.rank), targets: SC.targetsRule(eng.active, { target: item.system?.target }) };
}

export async function spellCostOptions(actor, item, baseCost) {
  const base = Number(baseCost) || 0;
  const name = item?.name ?? "";
  const opt = await castOptionsFor(actor, item);
  if (!opt.surcharges.length && !opt.targets) return { cost: base, label: name };
  const sur = opt.surcharges[0];
  const tgt = opt.targets;
  const nTargets = game.user.targets?.size || 1;
  const ranks = !sur ? "" : SC.GOD_RANKS.map((r) => `<option value="${r}" ${r === sur.rank ? "selected" : ""}>${r} (+${SC.influenceSurcharge(sur, r)})</option>`).join("");
  const content = `<p><b>${esc(name)}</b> — MP ${base}</p>
    ${tgt ? `<label>Targets (${esc(tgt.source)}) <input type="number" name="targets" min="1" value="${nTargets}" style="width:48px"></label><br>` : ""}
    ${!sur ? "" : `<label><input type="checkbox" name="out"> Outside ${esc(sur.choices.god ?? "the god")}'s area of influence (${esc(sur.source)})</label>
    ${sur.rank ? `<input type="hidden" name="rank" value="${esc(sur.rank)}">` : `<br><label>Deity rank <select name="rank">${ranks}</select></label>`}`}
    <p class="sw-cost-preview" style="font-weight:bold"></p>`;
  const read = (f) => {
    const surcharge = sur && f.elements.out?.checked ? SC.influenceSurcharge(sur, f.elements.rank?.value) : 0;
    const targets = tgt?.multiplier ? Math.max(1, Math.floor(Number(f.elements.targets?.value) || 1)) : 1;
    return { base, targets, surcharge };
  };
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${name}: MP cost` }, content,
    render: (_e, dlg) => {
      const f = dlg.element.querySelector("form");
      const upd = () => { f.querySelector(".sw-cost-preview").textContent = `MP ${SC.costLabel(read(f))}`; };
      f.addEventListener("change", upd); upd();
    },
    ok: { label: "Pay MP", callback: (_e, b) => read(b.form) },
    rejectClose: false,
  }).catch(() => null);
  if (!res) return null;
  const total = SC.spellCostTotal(res);
  return { cost: total, label: total !== base ? `${name} [${SC.costLabel(res)}]` : name };
}
