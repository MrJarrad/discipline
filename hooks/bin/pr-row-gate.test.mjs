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
  for (const text of ["Switch to UTF-8 output", "Hash with SHA-256", "ISO-8601 dates", "WCAG-2 contrast"]) {
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
