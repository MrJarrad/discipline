// DISC-367 slice 2: the portfolio merge needs its feature cards in the same PR, or denies naming the CLI.
// Run: node --test hooks/bin/card-gate-merge.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const hook = join(dirname(fileURLToPath(import.meta.url)), "card-gate-merge.mjs");
const HEAD = "a".repeat(40);
const run = (repo, cwd, env = {}, head = HEAD) => {
  const out = execFileSync(process.execPath, [hook], {
    input: JSON.stringify({ tool_name: "mcp__github__merge_pull_request", cwd, tool_input: { owner: "MrJarrad", repo, pullNumber: 711, expectedHeadSha: head } }),
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

test("a deny prints the resolved clone path in the command it asks you to run", () => {
  const clone = mkdtempSync(join(tmpdir(), "clone-"));
  execFileSync("git", ["init", "-q", clone]);
  const r = run("jhd-portfolio", tmpdir(), { JHD_PORTFOLIO_ROOT: clone });
  assert.ok(r.permissionDecisionReason.includes(`--repo ${clone} --pr 711`), r.permissionDecisionReason);
});

// A real PR ref: origin carries refs/pull/711/{head,merge}; the clone fetches them as the hook does.
const git = (d, ...a) => execFileSync("git", ["-C", d, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { encoding: "utf8" }).trim();
const prClone = ({ inventory, card }) => {
  const o = mkdtempSync(join(tmpdir(), "origin-"));
  git(o, "init", "-q", "-b", "main");
  mkdirSync(join(o, "src/components"), { recursive: true });
  writeFileSync(join(o, "src/components/hoverboard.tsx"), "a\n");
  if (inventory) { mkdirSync(join(o, "docs/site/cards"), { recursive: true }); writeFileSync(join(o, "docs/site/inventory.md"), "### `hoverboard` (1)\n\n| Module | n |\n| - | - |\n| `components/hoverboard.tsx` | 1 |\n"); }
  git(o, "add", "-A"); git(o, "commit", "-qm", "base");
  git(o, "checkout", "-qb", "pr");
  writeFileSync(join(o, "src/components/hoverboard.tsx"), "b\n");
  if (card) writeFileSync(join(o, "docs/site/cards/hoverboard.md"), "card\n");
  git(o, "add", "-A"); git(o, "commit", "-qm", "change");
  const head = git(o, "rev-parse", "HEAD");
  git(o, "checkout", "-q", "main"); git(o, "merge", "-q", "--no-ff", "-m", "merge", "pr");
  git(o, "update-ref", "refs/pull/711/head", head); git(o, "update-ref", "refs/pull/711/merge", "HEAD");
  const c = mkdtempSync(join(tmpdir(), "clone-"));
  execFileSync("git", ["clone", "-q", o, c]);
  return { c, head };
};

test("a PR changing a mapped module with its card passes", () => {
  const { c, head } = prClone({ inventory: true, card: true });
  assert.equal(run("jhd-portfolio", tmpdir(), { JHD_PORTFOLIO_ROOT: c }, head).permissionDecision, "allow");
});

test("the same PR without the card is denied, naming the card and the clone path", () => {
  const { c, head } = prClone({ inventory: true, card: false });
  const r = run("jhd-portfolio", tmpdir(), { JHD_PORTFOLIO_ROOT: c }, head);
  assert.equal(r.permissionDecision, "deny");
  assert.match(r.permissionDecisionReason, /docs\/site\/cards\/hoverboard\.md/);
});

test("a head with no inventory.md passes with a printed notice, never a lock-out", () => {
  const { c, head } = prClone({ inventory: false, card: false });
  const out = execFileSync(process.execPath, [hook], {
    input: JSON.stringify({ tool_name: "mcp__github__merge_pull_request", cwd: tmpdir(), tool_input: { owner: "MrJarrad", repo: "jhd-portfolio", pullNumber: 711, expectedHeadSha: head } }),
    encoding: "utf8", env: { PATH: process.env.PATH, HOME: tmpdir(), JHD_PORTFOLIO_ROOT: c },
  });
  assert.match(JSON.parse(out).systemMessage, /card gate inactive: no docs\/site\/inventory\.md/);
});
