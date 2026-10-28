import { isSelfCheck, stripTargetUI } from "../rules/self-check.mjs";
// Target picker markup for chat cards: one chip per target (small token portrait + name).
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** @param {{name:string,img?:string}[]} targets */
export function targetChipsHtml(targets) {
  return (targets ?? []).map((t) => {
    const img = t.img ? `<img class="target-portrait" src="${esc(t.img)}" alt="">` : `<i class="target-portrait fa-solid fa-user"></i>`;
    return `<span class="target-chip">${img}<span class="target-chip-name">${esc(t.name)}</span></span>`;
  }).join("");
}

/** Token (canvas placeable) -> {name, img} */
export function tokenTargetInfo(token) {
  const d = token?.document ?? token;
  return { name: d?.name ?? "?", img: d?.texture?.src ?? d?.actor?.img ?? token?.actor?.img ?? "" };
}

/** Inner HTML of the target button (label + chips, or the empty state). */
export function targetButtonInner(chips, label = "Target:", empty = "No target. Select tokens on the map") {
  return `<span class="chat-target-label">${esc(label)}</span>`
    + (chips ? `<span class="targetname">${chips}</span>` : `<span class="targetname target-empty"><i class="fa-solid fa-crosshairs"></i> ${esc(empty)}</span>`);
}

export const NO_TOKENS_MSG = "Select tokens on the map first";

/**
 * Tokens an apply-to-target action hits: selected tokens (click / drag-box) first,
 * then the user's targets, else none. No dialog. Returns an array.
 */
export function resolveTargetTokens(g = globalThis.game, c = globalThis.canvas) {
  const controlled = [...(c?.tokens?.controlled ?? [])];
  if (controlled.length) return controlled;
  const targets = [...(g?.user?.targets ?? [])];
  return targets;
}

/** Same as resolveTargetTokens, but warns when nothing is selected or targeted. */
export function resolveTargetTokensOrWarn(g = globalThis.game, c = globalThis.canvas) {
  const tokens = resolveTargetTokens(g, c);
  if (!tokens.length) {
    const s = g?.i18n?.localize?.("SW25.Card.NoTokensWarn");
    globalThis.ui?.notifications?.warn(s && s !== "SW25.Card.NoTokensWarn" ? s : NO_TOKENS_MSG);
  }
  return tokens;
}

export const LIVE_LABEL = "Applies to:";
export const LIVE_EMPTY = "your selected tokens (select or target tokens on the map, then click Apply)";
/** Inner HTML of the live "Applies to" line: chips for what a click would hit right now. */
export function liveTargetsInner(tokens, label = LIVE_LABEL, empty = LIVE_EMPTY) {
  const chips = targetChipsHtml((tokens ?? []).map(tokenTargetInfo));
  return `<span class="chat-target-label">${esc(label)}</span>`
    + (chips ? `<span class="targetname">${chips}</span>` : `<span class="targetname target-empty"><i class="fa-solid fa-crosshairs"></i> ${esc(empty)}</span>`);
}
/** Refresh every live-targets line under `root` (chat log or one message). */
export function refreshLiveTargets(root = globalThis.document) {
  const els = root?.querySelectorAll?.(".sw25-live-targets") ?? [];
  if (!els.length) return 0;
  const html = liveTargetsInner(resolveTargetTokens());
  els.forEach((el) => { el.innerHTML = html; });
  return els.length;
}
/** Hooks: fill on render, update when the user selects or targets tokens. */
export function registerLiveTargets() {
  const H = globalThis.Hooks;
  H.on("renderChatMessageHTML", (msg, el) => {
    const root = el?.[0] ?? el;
    // Willpower / Fortitude / Evasion: the roller's own check, never any target line.
    if (msg?.flags?.sw25?.selfCheck || isSelfCheck(msg?.flavor)) { stripTargetUI(root); return; }
    // Legacy cards: hide the old "choose target" button, show the live line instead.
    root?.querySelectorAll?.('button.chat-target[data-buttontype="target-select"]').forEach((b) => {
      const d = document.createElement("div"); d.className = "sw25-live-targets"; b.replaceWith(d);
    });
    refreshLiveTargets(root);
  });
  let t = null;
  const later = () => { clearTimeout(t); t = setTimeout(() => refreshLiveTargets(), 50); };
  H.on("controlToken", later); H.on("targetToken", later);
}
