/* ruling-ask — DISC-367 slice 2 (lesson 2026-11-24-s110-asked-a-ruled-question; operator 24 Nov: "I thought we built
   a different approach to the circle"). A queue ask about how something looks or behaves quotes the rulings the feature
   already has, or says what was searched and found none. Code is never evidence of what was approved.
   The trigger is words, so it errs toward asking: a false hit costs one flag (`--rulings none-found --searched "…"`),
   a miss is the s110 failure. Bare words with a non-visual sense (edge worker, approval, font licence, which option) are not triggers. */
/* "approved" gates only beside a design part: bare "approval needed" (token rotation, a release plan) is not a look ask. */
const NOUN = "(?:footer|nav(?:igation)?|header|buttons?|cards?|hero|circle|layout|menu|banner|sidebar|modal|logo|icons?|grid|arrangement)(?!\\s+(?:copy|wording|headline))";
const LOOK = new RegExp("\\b(?:" + [
  "colou?rs?", "yellow", "hover(?:s|ed)?", "animat\\w*", "motion", "easing", "page transitions?", "spacing", "padding", "radius",
  "shadows?", "typeface", "font (?:size|weight|family|stack)", "opacity", "page layout", "glow",
  "looks? (?:like|right|different|wrong)", "how should [^.?]{0,40}?\\b(?:look|feel|behave|move|animate|turn|appear|respond|fade|slide|scroll)",
  "approv\\w*[^.?]{0,40}?\\b" + NOUN, NOUN + "\\b[^.?]{0,40}?\\bapprov\\w*",
  "which (?:treatment|look|style|colou?r)", "(?:circle|ring|rim|arc)", "(?:button|card|image|media|circle|rounded) edges?",
].join("|") + ")\\b", "i");
/* `"<quote>" — <path>`: a quote of at least a few words, then a vault or repo path. */
const RULING = /^["“].{8,}["”]\s*[—–-]+\s*\S*(?:\/|\.md)\S*$/;

export const isLookAsk = (...cells) => LOOK.test(cells.map((c) => String(c ?? "").replace(/\*\*|`|~~/g, "")).join(" "));

export const THIN = "--rulings none-found needs --searched to say what was searched (at least 3 words, 15 characters): name the card path and the grep done";
export const thin = (s) => { const t = String(s ?? "").trim(); return t.length < 15 || t.split(/\s+/).length < 3; };

export const RULINGS_REFUSAL = "this asks the operator how something looks or behaves: read the feature's rulings first (docs/site card in the product repo, else grep the vault's decisions and answered queue rows) and rerun with --rulings '\"<quote>\" — <vault path>' (repeat per ruling), or --rulings none-found --searched \"<card + grep done>\". Code is never evidence of what was approved";

/* null when fine, else the reason. `rulings` is an array of strings. */
export function rulingsProblem(rulings, searched) {
  const list = (rulings || []).map((r) => String(r).trim()).filter(Boolean);
  if (!list.length) return RULINGS_REFUSAL;
  if (list.length === 1 && /^none-found$/i.test(list[0])) return thin(searched) ? THIN : null;
  const bad = list.find((r) => !RULING.test(r));
  return bad ? `ruling ${JSON.stringify(bad)} is not \`"<quote>" — <vault path>\`: quote the operator's words and name the file they are in` : null;
}

/* The line appended to the Needed cell so the operator reads what was checked. */
export const rulingsLine = (rulings, searched) => {
  const list = (rulings || []).map((r) => String(r).trim()).filter(Boolean);
  return list.length === 1 && /^none-found$/i.test(list[0]) ? `Rulings: none found — searched: ${String(searched).trim()}` : `Rulings: ${list.join(" ; ")}`;
};
