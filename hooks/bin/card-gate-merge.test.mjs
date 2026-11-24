// DISC-367 slice 2: the portfolio merge needs its feature cards in the same PR, or denies naming the CLI.
// Run: node --test hooks/bin/card-gate-merge.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const hook = join(dirname(fileURLToPath(import.meta.url)), "card-gate-merge.mjs");
const HEAD = "a".repeat(40);
const run = (repo, cwd, env = {}) => {
  const out = execFileSync(process.execPath, [hook], {
    input: JSON.stringify({ tool_name: "mcp__github__merge_pull_request", cwd, tool_input: { owner: "MrJarrad", repo, pullNumber: 711, expectedHeadSha: HEAD } }),
    encoding: "utf8", env: { PATH: process.env.PATH, HOME: mkdtempSync(join(tmpdir(), "h-")), ...env },
  });
  return out.trim() ? JSON.parse(out).hookSpecificOutput : { permissionDecision: "allow" };
};

test("a merge in another repo is none of this gate's business", () => {
  assert.equal(run("jhd-vault", tmpdir()).permissionDecision, "allow");
  assert.equal(run("discipline", tmpdir()).permissionDecision, "allow");
});

test("a portfolio merge with no clone to read denies and names the CLI to run", () => {
  const r = run("jhd-portfolio", tmpdir(), { JHD_PORTFOLIO_ROOT: join(tmpdir(), "nowhere") });
  assert.equal(r.permissionDecision, "deny");
  assert.match(r.permissionDecisionReason, /card-gate\.mjs --repo <portfolio clone> --pr 711/);
});

test("a portfolio merge whose PR files cannot be fetched fails closed, with the reason", () => {
  const clone = mkdtempSync(join(tmpdir(), "clone-"));
  execFileSync("git", ["init", "-q", clone]);
  const r = run("jhd-portfolio", tmpdir(), { JHD_PORTFOLIO_ROOT: clone });
  assert.equal(r.permissionDecision, "deny");
  assert.match(r.permissionDecisionReason, /unreadable|fetch/);
});
