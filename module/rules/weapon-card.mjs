import { formatDamage } from "./damage-display.mjs";
/* sw25-ce: item card for weapons (the Inventory icon used to post an empty description). PURE. */
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const sign = (n) => (Number(n) >= 0 ? `+${Number(n) || 0}` : `${n}`);
/** Stats block + inline Accuracy roll ([[/r]] is enriched before posting). */
export function weaponCardHTML(name, sys) {
  const acc = Number(sys.checkbase) || 0; const bonus = Number(sys.powerbase) || 0;
  const rows = [
    ["Class", sys.showskill || sys.checkskill || "—"],
    ["Accuracy", `${acc} &nbsp;[[/r 2d6${sign(acc)} # ${esc(name)} Accuracy]]`],
    ["Damage (Power / Crit / Bonus)", `<span class="sw25-dmgval">${formatDamage(sys.power, sys.totalcvalue ?? sys.cvalue ?? 10, bonus)}</span>`],
    ["Usage", sys.usagename || sys.usage || ""], ["Range", sys.range || ""], ["Min Str", sys.reqstr ?? ""],
  ].filter(([, v]) => v !== "" && v != null);
  return `<div class="sw25-weaponcard"><table>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")}</table>`
    + `<div><small>Damage: use the Combat tab Damage tile (equipped weapon).</small></div>${sys.description ? `<hr>${sys.description}` : ""}</div>`;
}
