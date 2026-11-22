// figma-variable-gate — DISC-347 (s105): a Figma variable added or renamed without the handoff toolkit's resolve step.
// Run: node --test hooks/bin/figma-variable-gate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkResolveResult } from "./agent-dispatch-gate.mjs";

const hook = fileURLToPath(new URL("./figma-variable-gate.mjs", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "figvar-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));

// Report shape: the resolve contract (vault references/2026-11-22-handoff-css-resolve-contract.md):
// top level needs[] (id + verdict), open, counts.
const report = (needs, name = "report.json") => {
  const open = needs.filter((n) => !["REUSE", "RULED"].includes(n.verdict)).length;
  const counts = {};
  for (const n of needs) counts[n.verdict] = (counts[n.verdict] ?? 0) + 1;
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify({ needs, open, counts }));
  return path;
};
const NAME = "color/background/action/quaternary";
const ADD = `const c = figma.variables.getLocalVariableCollections()[0]; figma.variables.createVariable("${NAME}", c, "COLOR");`;
const RENAME = `const v = figma.variables.getVariableById("VariableID:1:2"); v.name = "${NAME}";`;
const run = (tool_input) => {
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify({ tool_name: "mcp__figma__use_figma", tool_input }), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
};
const call = (code, description = "write a variable") => ({ fileKey: "a".repeat(22), code, description });

test("a variable add with no resolve result is refused, naming the resolve step", () => {
  const out = run(call(ADD));
  assert.equal(out.permissionDecision, "deny");
  assert.match(out.permissionDecisionReason, /Resolve:/);
});
test("a variable rename with no resolve result is refused", () => {
  assert.equal(run(call(RENAME))?.permissionDecision, "deny");
});
test("an add passes with a settled report that names the variable", () => {
  const p = report([{ id: "n1", name: NAME, verdict: "RULED" }, { id: "n2", name: "x", verdict: "REUSE" }]);
  assert.equal(run(call(ADD, `add the ordinal alias\nResolve: ${p}`)), null);
});
test("a rename passes with a settled report that names the variable", () => {
  const p = report([{ id: "n1", name: NAME, verdict: "RULED" }]);
  assert.equal(run(call(RENAME, `rename\nResolve: ${p}`)), null);
});
test("a report with an open need (NEW_NAME) is refused", () => {
  const p = report([{ id: "n1", name: NAME, verdict: "NEW_NAME" }]);
  const out = run(call(ADD, `Resolve: ${p}`));
  assert.equal(out.permissionDecision, "deny");
  assert.match(out.permissionDecisionReason, /open/);
});
test("each unsettled verdict is refused", () => {
  for (const verdict of ["SIBLING", "MISMATCH", "NEW_NAME", "NEW_RAMP", "RULING_STALE"]) {
    const p = report([{ id: "n1", name: NAME, verdict }], `${verdict}.json`);
    assert.equal(run(call(ADD, `Resolve: ${p}`))?.permissionDecision, "deny", verdict);
  }
});
test("a report that never mentions the variable being written is refused", () => {
  const p = report([{ id: "n1", name: "color/other", verdict: "REUSE" }]);
  const out = run(call(ADD, `Resolve: ${p}`));
  assert.equal(out.permissionDecision, "deny");
  assert.match(out.permissionDecisionReason, new RegExp(NAME.replace(/\//g, "\\/")));
});
test("a missing or unparseable report is refused", () => {
  assert.equal(run(call(ADD, `Resolve: ${join(dir, "nope.json")}`))?.permissionDecision, "deny");
  const bad = join(dir, "bad.json");
  writeFileSync(bad, "not json");
  assert.equal(run(call(ADD, `Resolve: ${bad}`))?.permissionDecision, "deny");
});
test("a report whose open count disagrees with its verdicts is refused", () => {
  const path = join(dir, "lying.json");
  writeFileSync(path, JSON.stringify({ needs: [{ id: "n1", name: NAME, verdict: "NEW_NAME" }], open: 0, counts: { NEW_NAME: 1 } }));
  assert.equal(run(call(ADD, `Resolve: ${path}`))?.permissionDecision, "deny");
});
test("calls that add or rename nothing pass untouched", () => {
  assert.equal(run(call(`const v = figma.variables.getVariableById("VariableID:1:2"); v.setValueForMode("1:0", {r:0,g:0,b:0});`)), null);
  assert.equal(run(call(`const f = figma.createFrame(); f.name = "Card";`)), null);
});

test("dispatch gate: a brief telling a doer to add a Figma variable needs `## Resolve result` with open: 0", () => {
  const brief = "Add the Figma variable color/background/action/quaternary via use_figma.\nSkills: capture-figma";
  assert.equal(checkResolveResult(brief).item, "resolve-result");
  assert.equal(checkResolveResult(`${brief}\n## Resolve result\nreport: /x/resolve-report.json\nopen: 3`).item, "resolve-result");
  assert.equal(checkResolveResult(`${brief}\n## Resolve result\nreport: /x/resolve-report.json\nopen: 0`), null);
});
test("dispatch gate: a brief that does not write Figma variables is untouched", () => {
  assert.equal(checkResolveResult("Fix the nav wordmark size.\nSkills: engineer"), null);
  assert.equal(checkResolveResult("Read the Figma variables and list them."), null);
});
