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
export function targetButtonInner(chips, label = "Target:", empty = "No target, click to pick") {
  return `<span class="chat-target-label">${esc(label)}</span>`
    + (chips ? `<span class="targetname">${chips}</span>` : `<span class="targetname target-empty"><i class="fa-solid fa-crosshairs"></i> ${esc(empty)}</span>`);
}
