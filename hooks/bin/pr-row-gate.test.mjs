// pr-row-gate — DISC-255 (operator s58: "is the backlog list up to date? It seems to continuously not be"):
// a product PR that names no backlog row id is how a row stays open after its PR merges (PF-934, HB-301).
// Run: node --test hooks/bin/pr-row-gate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prRowProblem } from "./pr-row-gate.mjs";

const hook = fileURLToPath(new URL("./pr-row-gate.mjs", import.meta.url));
const run = (tool_input, raw, env = {}) => {
  const r = spawnSync(process.execPath, [hook], { input: raw ?? JSON.stringify({ tool_name: "mcp__github__create_pull_request", tool_input }), encoding: "utf8", env: { ...process.env, DISCIPLINE_VAULT_ROOT: "none", ...env } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
};
const pr = (extra) => ({ owner: "MrJarrad", repo: "jhd-portfolio", title: "Fix the nav wordmark size", body: "What changed.", head: "claude/x", base: "main", ...extra });

test("a product PR whose title and body name no row id is denied, naming the escape", () => {
  const d = run(pr());
  assert.equal(d?.permissionDecision, "deny");
  assert.match(d.permissionDecisionReason, /row id/);
  assert.match(d.permissionDecisionReason, /No backlog row:/);
});

test("a row id in the title, or in the body, passes", () => {
  assert.equal(run(pr({ title: "PF-1109: text entry" })), null);
  assert.equal(run(pr({ body: "Closes PF-934.\n\nWhat changed." })), null);
  assert.equal(run(pr({ repo: "jhd-design-system", title: "DS-12 token", body: "" })), null);
});

test("an explicit 'No backlog row: <reason>' line passes; a bare 'No backlog row:' does not", () => {
  assert.equal(run(pr({ body: "No backlog row: a typo fix the operator asked for in chat" })), null);
  assert.equal(run(pr({ body: "No backlog row:" }))?.permissionDecision, "deny");
});

test("the vault is exempt (its PRs are the lists), and other tools are ignored", () => {
  assert.equal(run(pr({ repo: "jhd-vault", title: "notes: wrap", body: "" })), null);
  assert.equal(run(pr(), JSON.stringify({ tool_name: "mcp__github__update_pull_request", tool_input: pr() })), null);
});

test("it fails open: unparseable input never blocks a PR", () => {
  assert.equal(run(null, "not json"), null);
  assert.equal(run(null, "{}"), null);
});

test("prRowProblem: a lowercase or one-letter prefix is not a row id", () => {
  assert.ok(prRowProblem({ owner: "o", repo: "r", title: "pf-1 thing", body: "A-1 B-2" }));
  assert.equal(prRowProblem({ owner: "o", repo: "r", title: "thing (HB-301b)", body: "" }), null);
});

// DISC-255 review amber (#144): "UTF-8" and "SHA-256" match [A-Z]{2,4}-<n> and let a PR through with no row.
test("look-alikes (UTF-8, SHA-256, ISO-8601) are not row ids, with or without a vault to ask", () => {
  for (const text of ["Switch to UTF-8 output", "Hash with SHA-256", "ISO-8601 dates", "WCAG-2 contrast", "Use GPT-4 for drafts"]) {
    assert.equal(run(pr({ title: text, body: "" }))?.permissionDecision, "deny", text);
  }
  assert.equal(run(pr({ title: "PF-934 and UTF-8", body: "" })), null, "a real id beside a look-alike still passes");
});

test("with the vault's project lists readable, only a known prefix counts", () => {
  const v = mkdtempSync(join(tmpdir(), "prg-vault-"));
  mkdirSync(join(v, "projects/portfolio"), { recursive: true });
  writeFileSync(join(v, "projects/portfolio/portfolio-backlog.md"), "---\nname: b\nkind: backlog\nprefix: PF\n---\n");
  writeFileSync(join(v, "projects/portfolio/portfolio-queue.md"), "---\nname: q\nkind: queue\nprefix: PF\n---\n");
  const env = { DISCIPLINE_VAULT_ROOT: v };
  assert.equal(run(pr({ title: "PF-934 fix", body: "" }), undefined, env), null);
  assert.equal(run(pr({ title: "ZZ-12 fix", body: "" }), undefined, env)?.permissionDecision, "deny", "unknown prefix");
  assert.equal(run(pr({ title: "ZZ-12 fix", body: "" })), null, "no vault: any non-look-alike id passes");
});

// s84 lesson 1 (vault fleet/lessons/2026-11-12-s84-parent-lessons.md): a gate tightened round by round priced its own job out
// (archive guard DISC-280/281/285: 27 helpers could not be archived in a session). A PR that tightens a gate states the per-use cost.
test("s84 1: a gate or guard PR with no 'Per-use cost:' line is denied, naming what to state", () => {
  const d = run(pr({ repo: "discipline", title: "DISC-300: archive guard also requires the branch lookup", body: "Closes DISC-300." }));
  assert.equal(d?.permissionDecision, "deny");
  assert.match(d.permissionDecisionReason, /Per-use cost:/);
  assert.match(d.permissionDecisionReason, /calls/);
  assert.equal(run(pr({ repo: "discipline", title: "DISC-300: tighten a thing", head: "s84-merge-gate-tighten", body: "Closes DISC-300." }))?.permissionDecision, "deny", "the branch name counts");
});

test("s84 1: a 'Per-use cost: <n calls, what it reads>' line passes; a bare one does not", () => {
  const t = { repo: "discipline", title: "DISC-315: archive guard reads an open-PR lookup" };
  assert.equal(run(pr({ ...t, body: "Closes DISC-315.\nPer-use cost: 2 calls per helper (one search per id, one per branch); was a full history page-through." })), null);
  assert.equal(run(pr({ ...t, body: "Closes DISC-315.\nPer-use cost: none, no new check." })), null);
  assert.equal(run(pr({ ...t, body: "Closes DISC-315.\nPer-use cost:" }))?.permissionDecision, "deny");
});

test("s84 1: a PR that is not about a gate or guard is untouched by the cost line", () => {
  assert.equal(run(pr({ repo: "discipline", title: "DISC-301: reword the wrap checklist", body: "Closes DISC-301." })), null);
  assert.equal(run(pr({ repo: "jhd-portfolio", title: "PF-5: gate the hero video", body: "Closes PF-5." })), null, "product repos are not plugin gates");
});

// Review round 1 on #206: the cost line is accepted in the forms a PR body is written in, and its value is on the same line.
test("s84 1: bold, list and quoted forms of the Per-use cost line pass", () => {
  const t = { repo: "discipline", title: "DISC-315: archive guard reads an open-PR lookup" };
  for (const line of ["**Per-use cost:** 2 calls per helper", "- Per-use cost: 2 calls per helper", "* **Per-use cost:** none", "> Per-use cost: 2 calls", "__Per-use cost:__ 2 calls"]) {
    assert.equal(run(pr({ ...t, body: `Closes DISC-315.\n${line}` })), null, line);
  }
});

test("s84 1: a Per-use cost label with its value on the next line, or only bold markers after it, is denied", () => {
  const t = { repo: "discipline", title: "DISC-315: archive guard reads an open-PR lookup" };
  assert.equal(run(pr({ ...t, body: "Closes DISC-315.\nPer-use cost:\n2 calls per helper" }))?.permissionDecision, "deny");
  assert.equal(run(pr({ ...t, body: "Closes DISC-315.\n**Per-use cost:**\n2 calls" }))?.permissionDecision, "deny");
  assert.equal(run(pr({ ...t, body: "Closes DISC-315.\n**Per-use cost:**" }))?.permissionDecision, "deny");
});
