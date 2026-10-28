/* sw25-ce: resistance values -> lang keys.
 * Items made in the sheet store a key ("decide", "any", "none", "disappear", "halving", "shortening"),
 * but imported spells store the printed English word ("Can't", "Optional", "N/A", "Negates", "Half", "Temporary",
 * sometimes with a check prefix: "Fortitude/Half"). Building `SW25.Item.${value.capitalize()}` from those words
 * produced keys that don't exist ("SW25.Item.Can't", "SW25.Item.N/A"), so the raw key was shown.
 */
const RESULT_KEYS = {
  decide: "SW25.Item.Decide", any: "SW25.Item.Any", none: "SW25.Item.None",
  disappear: "SW25.Item.Disappear", halving: "SW25.Item.Halving", shortening: "SW25.Item.Shortening",
};
const RESULT_WORDS = {
  "can't": "decide", cant: "decide", cannot: "decide", "can not": "decide",
  optional: "any", "n/a": "none", na: "none", negates: "disappear", negate: "disappear", negated: "disappear",
  half: "halving", temporary: "shortening", shortened: "shortening",
};
const CHECK_KEYS = {
  fortitude: "SW25.Resist.Check.Vitres", vitres: "SW25.Resist.Check.Vitres",
  willpower: "SW25.Resist.Check.Mndres", mndres: "SW25.Resist.Check.Mndres",
  evasion: "SW25.Resist.Check.Dodge", dodge: "SW25.Resist.Check.Dodge",
};
const norm = (v) => String(v ?? "").trim().replace(/[\u2018\u2019\u02bc]/g, "'").toLowerCase();

/** Lang key for one resistance result word or key, or null when it isn't one we know. */
export function resistKey(value) {
  const n = norm(value);
  if (!n) return null;
  if (RESULT_KEYS[n]) return RESULT_KEYS[n];
  const w = RESULT_WORDS[n];
  return w ? RESULT_KEYS[w] : null;
}

/**
 * Display text for a stored resistance value. `localize` turns a lang key into text.
 * Empty -> "" ; known key/word -> localized ; "Fortitude/Half" -> "<Fortitude>/<Half>" ; anything else -> the text as stored.
 */
export function resistLabel(value, localize = (k) => k) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-" || raw === "—") return "";
  const k = resistKey(raw);
  if (k) return localize(k);
  const parts = raw.split("/").map((p) => p.trim());
  if (parts.length === 2) {
    const ck = CHECK_KEYS[norm(parts[0])]; const rk = resistKey(parts[1]);
    if (ck && rk) return `${localize(ck)}/${localize(rk)}`;
  }
  return raw;
}
