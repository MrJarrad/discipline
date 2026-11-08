/* link-ask — DISC-272 (operator 2026-11-08: "we can't be loosing track of these things"). A queue row that
   asks the operator to hand over a link, file, node or media is only raised once the vault has been searched:
   the Yardsale Figma file was in references/ when the parent asked for it. row-add refuses such a row without
   --searched. Only an ask directed at the operator counts: a hand-over verb opening a clause, then its object
   (review #152: "need/get/find" and "link … for/to" refused ~6% of real rows that only mention a link). */
const VERB = "(?:send|share|paste|provide|give me|upload|drop|supply)";
const DET = "(?:the|an?|your|my|these|those|this|that|new|fresh|all|each|every|one)";
const OBJECT = "(?:links?|urls?|files?|nodes?|figma|exports?|media|ids?|assets?|zips?|notion)";
const START = "(?:^|[.:;—–]\\s+|\\b(?:and|then|please|also)\\s+)";
const ASK = new RegExp(`${START}(?:${VERB}\\s+(?:me\\s+)?${DET}\\b[^.?]{0,60}\\b${OBJECT}\\b|re-?export\\b)`, "i");

export const isLinkAsk = (text) => ASK.test(String(text ?? "").replace(/\*\*|`|~~/g, "").trim());

export const LINK_ASK_REFUSAL = "this asks the operator for a link, file, node or media: search the vault first (references/ and projects/<p>/, by project and asset name) and rerun with --searched \"<what you searched and found>\"; if the vault holds it, use it and raise no row";
