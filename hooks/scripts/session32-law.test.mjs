// 1.148.0: ruling 2026-10-18-live-walk-before-look-links (DISC-190) and lesson
// 2026-10-18-helper-waits-for-go (both parts, incl. the #361 addendum: a product-repo merge
// without a reviewer verdict is refused by a hook). Run: node --test hooks/scripts/session32-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { reviewVerdict } from "./merge-after-review.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const HEAD = "c137007fc1159f87d0fc58e885fc8b71b0362275";
const OLD = "99835ca0000000000000000000000000000000aa";
// The two verdict shapes reviewers actually posted on discipline #107.
const r2 = (sha, word) => `## Reviewer verdict: round 2 of 2 (LIGHT), head ${sha.slice(0, 7)}\n\n**merge: ${word}.** findings`;
const r3 = (sha, word) => `## Review round 3 (routine, LIGHT): round-2 red only, head \`${sha.slice(0, 7)}\`\n\n**Verdict: closed. merge: ${word}.**`;
const c = (body, login = "MrJarrad") => ({ body, author: { login } });

test("(B2) a reviewer verdict naming the head sha with merge: yes is found, in either posted shape", () => {
  assert.equal(reviewVerdict([c(r3(HEAD, "yes"))], HEAD, ["MrJarrad"])?.verdict, "yes");
  assert.equal(reviewVerdict([c(r2(HEAD, "yes"))], HEAD, ["MrJarrad"])?.verdict, "yes");
});

test("(B2) a verdict on an older head, an untrusted author, or a progress comment does not count", () => {
  assert.equal(reviewVerdict([c(r2(OLD, "yes"))], HEAD, ["MrJarrad"]), null);
  assert.equal(reviewVerdict([c(r3(HEAD, "yes"), "rando")], HEAD, ["MrJarrad"]), null);
  assert.equal(reviewVerdict([c(`Round 1 is fixed in ${HEAD.slice(0, 7)}. merge: yes`)], HEAD, ["MrJarrad"]), null);
});

test("(B2) the latest verdict on the head wins; merge: no refuses", () => {
  assert.equal(reviewVerdict([c(r3(HEAD, "yes")), c(r2(HEAD, "no"))], HEAD, ["MrJarrad"])?.verdict, "no");
  assert.equal(reviewVerdict([c(r2(HEAD, "no")), c(r3(HEAD, "yes"))], HEAD, ["mrjarrad"])?.verdict, "yes");
});

/* Hook seam: PreToolUse on mcp__github__merge_pull_request, reading the session transcript for the
   PR's fetched comments (cloud parents merge through the GitHub MCP, not merge-after-review.mjs). */
const gate = join(root, "hooks/bin/merge-review-gate.mjs");
const transcript = (pull, bodies, method = "get_comments") => {
  const p = join(mkdtempSync(join(tmpdir(), "s32-")), "t.jsonl");
  const use = { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "mcp__github__pull_request_read", input: { method, owner: "MrJarrad", repo: "jhd-portfolio", pullNumber: pull } }] } };
  const text = JSON.stringify(bodies.map((body) => ({ body, user: { login: "MrJarrad" } })));
  const res = { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "text", text }] }] } };
  writeFileSync(p, `${JSON.stringify(use)}\n${JSON.stringify(res)}\n`);
  return p;
};
const runGate = (tool_input, transcript_path) => {
  const out = execFileSync(process.execPath, [gate], { input: JSON.stringify({ tool_name: "mcp__github__merge_pull_request", tool_input, transcript_path }), encoding: "utf8" });
  return out.trim() ? JSON.parse(out).hookSpecificOutput : { permissionDecision: "allow" };
};
const pr = (extra = {}) => ({ owner: "MrJarrad", repo: "jhd-portfolio", pullNumber: 361, expectedHeadSha: HEAD, ...extra });

test("(B2) the #361 case: a product-repo merge with no reviewer verdict in the session is refused", () => {
  const d = runGate(pr(), transcript(361, ["lint fixture, +1 line"]));
  assert.equal(d.permissionDecision, "deny");
  assert.match(d.permissionDecisionReason, /no reviewer verdict.*merge: yes.*head c137007/);
});

test("(B2) a merge with merge: yes on the head it pins is allowed; an unpinned merge is refused", () => {
  assert.equal(runGate(pr(), transcript(361, [r3(HEAD, "yes")])).permissionDecision, "allow");
  assert.match(runGate(pr({ expectedHeadSha: undefined }), transcript(361, [r3(HEAD, "yes")])).permissionDecisionReason, /expectedHeadSha/);
});

test("(B2) comments fetched for another PR do not count; notes-only vault merges stay the orchestrator's", () => {
  assert.equal(runGate(pr(), transcript(360, [r3(HEAD, "yes")])).permissionDecision, "deny");
  assert.equal(runGate(pr({ repo: "jhd-vault", expectedHeadSha: undefined }), transcript(1, [])).permissionDecision, "allow");
});

test("(B2) the hook is registered and the rule names it where merges are remitted", () => {
  const hooks = JSON.parse(readFileSync(join(root, "hooks/hooks.json"), "utf8")).hooks.PreToolUse;
  assert.ok(hooks.some((h) => h.matcher === "mcp__github__merge_pull_request" && h.hooks[0].command.includes("merge-review-gate.mjs")));
  assert.match(flat("skills/routing/references/HARD-RULES.md"), /Checked: `hooks\/bin\/merge-review-gate\.mjs` refuses `mcp__github__merge_pull_request`/);
  assert.match(flat("hooks/scripts/merge-after-review.mjs"), /reviewVerdict\(status\.comments, status\.headRefOid, status\.trusted\)/);
});

test("(B1) every create_session brief opens with the parent's id and start-now; the parent checks within 5 minutes and on every wake", () => {
  const r = flat("skills/routing/references/HARD-RULES.md");
  assert.match(r, /Every `create_session` brief opens with the parent's session id and "this brief is from your parent \(session <id>\); start now, no go needed"/);
  assert.match(r, /checks each new helper with `get_session` within 5 minutes of dispatch and on every wake, and answers a blocked helper the same turn/);
});

test("(A) interactive or motion look links wait on a live walk with real gestures; recordings get one too", () => {
  const p = flat("skills/present-for-review/SKILL.md");
  assert.match(p, /Interactive or motion work: a live walk is part of link-ready/);
  assert.match(p, /whenever the operator sends a recording/);
  assert.match(p, /Static look lanes are unchanged/);
  const m = flat("skills/present-for-review/references/PREVIEW-PROBE.md");
  assert.match(m, /## Live walk/);
  assert.match(m, /trackpad stream with momentum.*reading pace.*mouse notches.*pointer over each region.*start → end → back.*close and reopen/);
  assert.match(m, /2026-10-18-notes-r16-live-walk/);
});
