/** Normalize sw25 ActiveEffect change rows (keyname/keyClassification -> key). Pure; returns new objects. */
export function normalizeChanges(changes) {
  if (!Array.isArray(changes)) return changes;
  return changes.map((c) => {
    const change = { ...c };
    if (!change.keyClassification) change.keyClassification = "";
    if (!change.keyname) change.keyname = "";
    if (!change.key) change.key = change.keyname !== "" ? "system." + change.keyname : "";
    if (change.keyClassification == "checkname") change.key = "system.effect.checkinputmod." + change.checkname;
    if (change.key.startsWith("input,")) change.key = change.key.replace(/^input,/, "");
    else if (change.key.startsWith("checkinput,")) change.key = change.key.replace(/^checkinput,/, "system.effect.checkinputmod.");
    return change;
  });
}

/**
 * Prepare create/update data without breaking core callers. Foundry's toggleStatusEffect /
 * Mark Defeated pass an ActiveEffect *instance* (fromStatusEffect) to create(); assigning
 * `.changes` on a document instance is not allowed, so instances (and anything with
 * toObject) are passed through untouched, arrays are mapped, plain objects copied.
 */
export function prepareEffectData(data) {
  if (Array.isArray(data)) return data.map(prepareEffectData);
  if (!data || typeof data !== "object" || typeof data.toObject === "function") return data;
  if (!Array.isArray(data.changes) || !data.changes.length) return data;
  return { ...data, changes: normalizeChanges(data.changes) };
}
