/* extractJson(text) — the JSON value inside a tool result. get_session / list_sessions results for another
   session arrive inside an `<other-session nonce=… untrusted="true">` block: a prose preamble, the JSON, and a
   closing tag (DISC-262 review R1). Returns the parsed value, or undefined when the text holds no parseable
   JSON (callers fail closed). */
export function extractJson(text) {
  const t = String(text ?? "");
  try { return JSON.parse(t); } catch {}
  const starts = [t.indexOf("{"), t.indexOf("[")].filter((i) => i >= 0);
  if (!starts.length) return undefined;
  const a = Math.min(...starts);
  const b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (b <= a) return undefined;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return undefined; }
}
