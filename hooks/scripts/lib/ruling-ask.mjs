/* ruling-ask — DISC-367 slice 2 (lesson 2026-11-24-s110-asked-a-ruled-question; operator 24 Nov: "I thought we built
   a different approach to the circle"). A queue ask about how something looks or behaves quotes the rulings the feature
   already has, or says what was searched and found none. Code is never evidence of what was approved.
   The trigger is words, so it errs toward asking: a false hit costs one flag (`--rulings none-found --searched "…"`),
   a miss is the s110 failure. Process asks (merge, release, link, scope) carry none of these words. */
const LOOK = /\b(?:approved|approval|colou?rs?|yellow|hover(?:s|ed)?|animat\w*|motion|easing|transitions?|spacing|padding|radius|shadows?|typeface|fonts?|opacity|layout|glow|looks? (?:like|right|different|wrong)|how (?:should|does|do|would) (?:it|the|this|they)\b|which (?:variant|option|version|treatment|look|style|colou?r)|circle|arc|rim|edge)\b/i;
/* `"<quote>" — <path>`: a quote of at least a few words, then a vault or repo path. */
const RULING = /^["“].{8,}["”]\s*[—–-]+\s*\S*(?:\/|\.md)\S*$/;

export const isLookAsk = (...cells) => LOOK.test(cells.map((c) => String(c ?? "").replace(/\*\*|`|~~/g, "")).join(" "));

export const RULINGS_REFUSAL = "this asks the operator how something looks or behaves: read the feature's rulings first (docs/site card in the product repo, else grep the vault's decisions and answered queue rows) and rerun with --rulings '\"<quote>\" — <vault path>' (repeat per ruling), or --rulings none-found --searched \"<card + grep done>\". Code is never evidence of what was approved";

/* null when fine, else the reason. `rulings` is an array of strings. */
export function rulingsProblem(rulings, searched) {
  const list = (rulings || []).map((r) => String(r).trim()).filter(Boolean);
  if (!list.length) return RULINGS_REFUSAL;
  if (list.length === 1 && /^none-found$/i.test(list[0])) return String(searched ?? "").trim() ? null : "--rulings none-found needs --searched \"<card + grep done>\"";
  const bad = list.find((r) => !RULING.test(r));
  return bad ? `ruling ${JSON.stringify(bad)} is not \`"<quote>" — <vault path>\`: quote the operator's words and name the file they are in` : null;
}

/* The line appended to the Needed cell so the operator reads what was checked. */
export const rulingsLine = (rulings, searched) => {
  const list = (rulings || []).map((r) => String(r).trim()).filter(Boolean);
  return list.length === 1 && /^none-found$/i.test(list[0]) ? `Rulings: none found — searched: ${String(searched).trim()}` : `Rulings: ${list.join(" ; ")}`;
};
