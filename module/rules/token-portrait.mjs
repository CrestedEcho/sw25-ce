/**
 * Stat-block / fellow sheet round portrait = the token art, falling back to the actor portrait.
 * Pure part (portraitSrc, isUsableTokenArt) has no Foundry globals; the click handler uses them at runtime only.
 */
export const DEFAULT_TOKEN = "icons/svg/mystery-man.svg";

/** Token art that can be shown: non-empty, not the default mystery-man, not a wildcard pattern. */
export function isUsableTokenArt(src) {
  const s = String(src ?? "").trim();
  if (!s) return false;
  if (/(^|\/)mystery-man\.svg(\?.*)?$/i.test(s)) return false;
  if (s.includes("*")) return false; // wildcard token images ("monsters/*.webp") cannot be displayed
  return true;
}

/**
 * Which image the round portrait shows. tokenSrc = the synthetic (unlinked) token's texture when the sheet
 * belongs to a placed unlinked token, else null; protoSrc = actor.prototypeToken.texture.src.
 * Returns { src, from: "token" | "prototype" | "actor" }.
 */
export function portraitSrc({ actorImg = "", protoSrc = "", tokenSrc = null } = {}) {
  if (tokenSrc != null && isUsableTokenArt(tokenSrc)) return { src: String(tokenSrc), from: "token" };
  if (isUsableTokenArt(protoSrc)) return { src: String(protoSrc), from: "prototype" };
  return { src: actorImg || DEFAULT_TOKEN, from: "actor" };
}

/** portraitSrc for a Foundry actor (unlinked token sheet: that token's texture; else the prototype token). */
export function actorPortrait(actor) {
  const tok = actor?.isToken ? actor.token : null;
  return portraitSrc({ actorImg: actor?.img ?? "", protoSrc: actor?.prototypeToken?.texture?.src ?? "", tokenSrc: tok ? tok.texture?.src ?? "" : null });
}

/**
 * Click on the round portrait: FilePicker for the token art (never actor.img).
 * Unlinked token sheet -> that token's texture.src; otherwise -> prototypeToken.texture.src.
 */
export async function editTokenArt(sheet) {
  const actor = sheet.actor; const tok = actor.isToken ? actor.token : null;
  const cur = actorPortrait(actor).src;
  const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  const fp = new FP({ type: "image", current: cur, callback: async (path) => {
    if (tok) await tok.update({ "texture.src": path });
    else await actor.update({ "prototypeToken.texture.src": path });
    sheet.render(false);
  } });
  return fp.browse ? fp.browse(cur) : fp.render(true);
}

/** Wire the portrait <img> (no data-edit, so the core actor.img picker does not fire). */
export function bindPortrait(sheet, root, selector, canEdit) {
  root.querySelectorAll(selector).forEach((el) => {
    if (!canEdit) return;
    el.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); editTokenArt(sheet); });
  });
}
