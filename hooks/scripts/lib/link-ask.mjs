/* link-ask — DISC-272 (operator 2026-11-08: "we can't be loosing track of these things"). A queue row that
   asks the operator for a link, file or node is only raised once the vault has been searched: the Yardsale
   Figma file was in references/ when the parent asked for it. row-add refuses such a row without --searched. */
const ASK = /\b(send|share|paste|provide|give|supply|upload|drop|need|needs|get|find)\b[^.?]{0,60}\b(links?|urls?|files?|nodes?|figma|exports?|assets?)\b|\b(links?|urls?|figma files?|node ids?)\b[^.?]{0,20}\b(for|to)\b/i;

export const isLinkAsk = (text) => ASK.test(String(text ?? "").replace(/\*\*|`/g, ""));

export const LINK_ASK_REFUSAL = "this asks the operator for a link, file or node: search the vault first (references/ and projects/<p>/, by project and asset name) and rerun with --searched \"<what you searched and found>\"; if the vault holds it, use it and raise no row";
