/* lane-key — DISC-335: a helper's lane key from list_sessions/get_session tags and title, and whether a PR's text names it.
   PR bodies carry the opening session's id inside a markdown link that GitHub search cannot match, so the ledger and the archive
   guard match locally on the id and on the key (backlog row ids such as PF-1655, DISC-335). */
const KEY = /(?<![A-Za-z])([A-Za-z]{2,5})-?(\d+)/g;
const norm = (m) => `${m[1].toUpperCase()}${m[2]}`;

/** Normalised keys (PF1655) from the `s<n>-…` lane tags and the title; first sighting order, no duplicates. */
export function laneKeys(x) {
  const texts = [...(x.tags || []).map((t) => /^s\d+-(.+)$/.exec(t)?.[1]).filter(Boolean), x.title || ""];
  return [...new Set(texts.flatMap((t) => [...t.matchAll(KEY)].map(norm)))];
}

/** True when `text` names any key as a whole token, hyphen optional. */
export function mentions(text, keys) {
  return keys.some((k) => { const m = /^([A-Z]+)(\d+)$/.exec(k); return m && new RegExp(`(?<![A-Za-z])${m[1]}-?${m[2]}(?!\\d)`, "i").test(String(text ?? "")); });
}
