#!/usr/bin/env node
/* PreToolUse (mcp__.*__use_figma) — DISC-347 (s105): a helper added color/background/action/pressed-tertiary
   without the handoff toolkit and broke the ordinal alias pattern. A variable add or rename is never a technical
   call: it passes only with a settled resolve report (`handoff-css resolve`, contract in
   skills/dispatch-brief/references/FIGMA-VARIABLES.md). The call's `description` carries `Resolve: <path>`. */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SETTLED = new Set(["REUSE", "RULED"]);
const ADDS = /figma\.variables\.createVariable(?:Collection)?\s*\(\s*(?:(["'`])((?:\\.|(?!\1).)*)\1)?/g;
const RENAMES = /\.name\s*=\s*(?:(["'`])((?:\\.|(?!\1).)*)\1)?/g;

// Literal names the code adds or renames; `dynamic` when a write has no literal name to check.
export function variableWrites(code = "") {
  const names = [];
  let dynamic = false;
  let any = false;
  for (const m of String(code).matchAll(ADDS)) { any = true; m[2] ? names.push(m[2]) : (dynamic = true); }
  if (/figma\.variables\b/.test(code)) {
    for (const m of String(code).matchAll(RENAMES)) { any = true; m[2] ? names.push(m[2]) : (dynamic = true); }
  }
  return { any, names, dynamic };
}

export function checkFigmaVariableWrite(toolInput = {}) {
  const { any, names } = variableWrites(toolInput.code);
  if (!any) return null;
  const refuse = (why) => ({ reason: `figma-variable-gate: ${why} A Figma variable add or rename goes through the handoff toolkit's resolve step first (DISC-347, s105): run \`handoff-css resolve\`, settle every need with the operator, then put \`Resolve: <path to resolve-report.json>\` in this call's description. Reuse an existing alias before adding one; a new alias is the next ordinal, never a state-suffixed compound.` });
  const path = /^\s*Resolve:\s*(\S+)/m.exec(toolInput.description ?? "")?.[1];
  if (!path) return refuse("this call adds or renames a variable and carries no `Resolve:` line.");
  let rep;
  try { rep = JSON.parse(readFileSync(path, "utf8")); } catch { return refuse(`the resolve report ${path} is missing or is not JSON.`); }
  if (!Array.isArray(rep?.needs)) return refuse(`${path} has no needs[]; it is not a resolve report.`);
  const unsettled = rep.needs.filter((n) => !SETTLED.has(n?.verdict));
  if (unsettled.length || rep.open !== 0) return refuse(`the resolve report has ${unsettled.length || rep.open} open need(s) (${[...new Set(unsettled.map((n) => n.verdict))].join(", ") || "open count"}); only REUSE and RULED settle one, and open must be 0.`);
  const text = JSON.stringify(rep);
  const missing = names.filter((n) => !text.includes(JSON.stringify(n).slice(1, -1)));
  if (missing.length) return refuse(`the resolve report never names ${missing.join(", ")}, so it did not resolve this write.`);
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = {};
  try { input = JSON.parse(readFileSync(0, "utf8")); } catch { /* unreadable: nothing to gate */ }
  const v = checkFigmaVariableWrite(input?.tool_input);
  if (v) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: v.reason } }));
}
