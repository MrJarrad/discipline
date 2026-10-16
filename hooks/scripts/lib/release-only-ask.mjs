/* release-only-ask — DISC-178, ruling `2026-10-15-release-follows-merge`
   (operator 2026-10-15: "can we fix this type of thing so i don't need to be
   involved"). A release of already-merged, reviewed main changes is the
   parent's to start; asking the operator "release?" is not an operator row.
   A row is REFUSED when its only ask is a release. A row that also carries a
   call the ruling leaves to the operator passes: SITE_MODE holding -> live, a
   new public route, removing the holding page, a second auto-rollback. */

export const OPERATOR_OWNED = /\bSITE_MODE\b|\bholding\b|\bnew public (route|page)\b|\bpublic route\b|\bauto-?roll(ed)?[ -]?backs?\b.*\b(twice|second|2)\b|\b(twice|second|2)\b.*\bauto-?roll(ed)?[ -]?backs?\b|\brolled back twice\b|\bsecond (auto-?)?rollback\b/i;
const RELEASE_VERB = /^(release(?! (notes?|wording|names?|versions?|tags?|dates?|titles?)\b)|re-?release|promote|deploy)\b/i;

/* ask = the row's what-cell; rest = every other cell's text (checked for operator-owned calls only). */
export function isReleaseOnlyAsk(ask, rest = "") {
  const t = String(ask ?? "").replace(/\*\*|`/g, "").replace(/\s+/g, " ").trim();
  if (!t || OPERATOR_OWNED.test(`${t} ${rest}`)) return false;
  const sentences = t.split(/(?<=[.?!])\s+/).filter(Boolean);
  if (sentences.length !== 1 || !/\?$/.test(t)) return false;
  return RELEASE_VERB.test(t) || /^go live\??$/i.test(t) || /^(should|shall|can|may) (i|we) (release|promote|deploy)\b/i.test(t);
}

export const RELEASE_REFUSAL = "a release of already-merged, reviewed main changes is started by the parent, not asked of the operator (ruling 2026-10-15-release-follows-merge); report the outcome in one line after. A row that also asks an operator-owned call (SITE_MODE holding -> live, a new public route, removing the holding page, a second auto-rollback) is allowed — name that call in the row";
