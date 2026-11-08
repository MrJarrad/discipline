/* link-ask — DISC-272 (operator 2026-11-08: "we can't be loosing track of these things"). A queue row that
   asks the operator to hand over a link, file, node or media is only raised once the vault has been searched:
   the Yardsale Figma file was in references/ when the parent asked for it. row-add refuses such a row without
   --searched. Only an ask directed at the operator counts: a hand-over verb opening a clause, then its object
   (review #152: "need/get/find" and "link … for/to" refused ~6% of real rows that only mention a link). */
const VERB = "(?:send|share|paste|provide|give me|upload|drop|supply)";
const OBJECT = "(?:links?|urls?|files?|nodes?|figma|exports?|media|ids?|assets?|zips?|notion)";
const PRONOUN = "(?:it|them|this|that|these|those)";
// A clause opens at the text start, after punctuation, after and/then/please/also, or after "can/could/would/will you [please]".
const START = "(?:^|[.:;—–]\\s+|\\b(?:and|then|please|also|(?:can|could|would|will) you(?: please)?)\\s+)";
// Verb-first: the verb's object is not a bare pronoun or preposition ("drop it from Figma"); a determiner, possessive or none is fine.
const VERB_FIRST = `${VERB}\\s+(?:me\\s+)?(?!(?:it|them|you|on|off|out|in|to|from)\\b)[^.?]{0,60}\\b${OBJECT}\\b`;
// Noun-first: "Figma link for the Wild case study — paste it here".
const NOUN_FIRST = `(?:\\S+\\s+){0,3}${OBJECT}\\b[^.?]{0,60}[—–,:;]\\s*(?:please\\s+)?${VERB}\\s+${PRONOUN}\\b`;
const ASK = new RegExp(`${START}(?:${VERB_FIRST}|re-?export\\b|${NOUN_FIRST})`, "i");

export const isLinkAsk = (text) => ASK.test(String(text ?? "").replace(/\*\*|`|~~/g, "").trim());

export const LINK_ASK_REFUSAL = "this asks the operator for a link, file, node or media: search the vault first (references/ and projects/<p>/, by project and asset name) and rerun with --searched \"<what you searched and found>\"; if the vault holds it, use it and raise no row";
