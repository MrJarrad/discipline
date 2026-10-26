// 1.148.0: ruling 2026-10-18-live-walk-before-look-links (DISC-190) and lesson
// 2026-10-18-helper-waits-for-go (both parts, incl. the #361 addendum: a product-repo merge
// without a reviewer verdict is refused by a hook). Run: node --test hooks/scripts/session32-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// Loaded dynamically so a pre-1.148.0 tree reports each check red, not one load error (#108 N4).
const mar = await import("./merge-after-review.mjs");
const missing = (n) => () => { throw new Error(`${n} is not exported`); };
const reviewVerdict = mar.reviewVerdict ?? missing("reviewVerdict");
const notesOnly = mar.notesOnly ?? missing("notesOnly");

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const HEAD = "c137007fc1159f87d0fc58e885fc8b71b0362275";
const OLD = "99835ca0000000000000000000000000000000aa";
const c = (body, login = "MrJarrad", at) => ({ body, author: { login }, at });
// Real verdict openings posted 2026-10-18 (heading + verdict line, verbatim).
const REAL = {
  d107r2: (s) => `## Reviewer verdict: round 2 of 2 (LIGHT), head ${s}\n\n**merge: no.** All four round-1 findings are closed.`,
  d107r3: (s) => `## Review round 3 (routine, LIGHT): round-2 red only, head \`${s}\`\n\n**Verdict: the round-2 red is closed. No regressions found. merge: yes.**`,
  pf339: (s) => `## Review — G35 prune + round-2 RED-1 residue — head ${s} (tier FULL)\n\n**merge: yes.** No red finding is open.`,
  pf362: (s) => `## Release review — round 1 — head ${s} (tier LIGHT)\n\n**merge: yes.** This release carries two PRs, and only those two.`,
  d108r1: (s) => `## Review — round 1 of 2, tier FULL — head ${s}\n\n**merge: no.** Two red findings.`,
};
const S7 = HEAD.slice(0, 7);

test("(B2) every real verdict shape posted today is read, comment or review, release reviews included", () => {
  for (const [k, want] of [["d107r3", "yes"], ["pf339", "yes"], ["pf362", "yes"], ["d107r2", "no"], ["d108r1", "no"]]) {
    assert.equal(reviewVerdict([c(REAL[k](S7))], HEAD, ["MrJarrad"])?.verdict, want, k);
  }
  assert.equal(reviewVerdict([c(REAL.pf362(S7.toUpperCase()))], HEAD, ["MrJarrad"])?.verdict, "yes");
});

test("(B2) a verdict on an older head, an untrusted author, or a progress comment does not count", () => {
  assert.equal(reviewVerdict([c(REAL.pf339(OLD.slice(0, 7)))], HEAD, ["MrJarrad"]), null);
  assert.equal(reviewVerdict([c(REAL.pf339(S7), "rando")], HEAD, ["MrJarrad"]), null);
  assert.equal(reviewVerdict([c(`Round 1 is fixed in ${S7}. merge: yes`)], HEAD, ["MrJarrad"]), null);
});

test("(B2) the verdict line decides, not a quoted merge: no elsewhere in a yes verdict", () => {
  const body = `## Review r2 — head ${S7}\nRound 1 said merge: no; fixed.\n\n**merge: yes.**`;
  assert.equal(reviewVerdict([c(body)], HEAD, ["MrJarrad"])?.verdict, "yes");
});

test("(B2) the latest verdict on the head wins, by posting time when given; merge: no refuses", () => {
  assert.equal(reviewVerdict([c(REAL.pf339(S7)), c(REAL.d107r2(S7))], HEAD, ["MrJarrad"])?.verdict, "no");
  assert.equal(reviewVerdict([c(REAL.d107r2(S7)), c(REAL.pf339(S7))], HEAD, ["mrjarrad"])?.verdict, "yes");
  const review = c(REAL.pf339(S7), "MrJarrad", "2026-10-18T15:00:00Z");
  const comment = c(REAL.d107r2(S7), "MrJarrad", "2026-10-18T14:00:00Z");
  assert.equal(reviewVerdict([review, comment], HEAD, ["MrJarrad"])?.verdict, "yes");
});

test("(B2) notes-only means markdown records outside .github and .claude; anything else needs a reviewer", () => {
  assert.equal(notesOnly(["projects/portfolio/portfolio-queue.md", "fleet/rulings/x.md"]), true);
  assert.equal(notesOnly(["projects/x.md", "scripts/cloud-start.sh"]), false);
  assert.equal(notesOnly([".github/workflows/notes.md"]), false);
  assert.equal(notesOnly([]), false);
});

/* Hook seam: PreToolUse on mcp__github__merge_pull_request, reading the session transcript for the
   PR's fetched comments and reviews (cloud parents merge through the GitHub MCP, not merge-after-review.mjs). */
const gate = join(root, "hooks/bin/merge-review-gate.mjs");
const dir = () => mkdtempSync(join(tmpdir(), "s32-"));
/* calls: [{ name, input, items | text }] → a transcript in the real Claude Code JSONL shape. */
const transcript = (calls, d = dir()) => {
  const p = join(d, "t.jsonl");
  const lines = calls.flatMap((k, i) => {
    const id = `toolu_${i}`;
    const text = k.text ?? JSON.stringify(k.items);
    return [
      { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id, name: k.name ?? "mcp__github__pull_request_read", input: k.input }] } },
      { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text }] }] } },
    ];
  });
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return p;
};
const comments = (pull, bodies, repo = "jhd-portfolio") => ({ input: { method: "get_comments", owner: "MrJarrad", repo, pullNumber: pull }, items: bodies.map((body) => ({ body, user: { login: "MrJarrad" } })) });
const runGate = (tool_input, transcript_path, raw) => {
  const out = execFileSync(process.execPath, [gate], { input: raw ?? JSON.stringify({ tool_name: "mcp__github__merge_pull_request", tool_input, transcript_path }), encoding: "utf8" });
  return out.trim() ? JSON.parse(out).hookSpecificOutput : { permissionDecision: "allow" };
};
const pr = (extra = {}) => ({ owner: "MrJarrad", repo: "jhd-portfolio", pullNumber: 361, expectedHeadSha: HEAD, ...extra });

test("(B2) the #361 case: a product-repo merge with no reviewer verdict in the session is refused", () => {
  const d = runGate(pr(), transcript([comments(361, ["lint fixture, +1 line"])]));
  assert.equal(d.permissionDecision, "deny");
  assert.match(d.permissionDecisionReason, /no reviewer verdict.*merge: yes.*head c137007/);
});

test("(B2) a merge with merge: yes on the head it pins is allowed; an unpinned merge is refused", () => {
  assert.equal(runGate(pr(), transcript([comments(361, [REAL.d107r3(S7)])])).permissionDecision, "allow");
  assert.match(runGate(pr({ expectedHeadSha: undefined }), transcript([comments(361, [REAL.d107r3(S7)])])).permissionDecisionReason, /expectedHeadSha/);
});

test("(B2) #339's shape: a verdict posted as a PR review (get_reviews) is read", () => {
  const sha = "b146a140d400efa59ac945fcdaffc65b50cb86a0";
  const reviews = { input: { method: "get_reviews", owner: "MrJarrad", repo: "jhd-portfolio", pullNumber: 339 }, items: [
    { id: 5563062369, state: "COMMENTED", body: REAL.d107r2("a4799a4"), user: { login: "MrJarrad" }, commit_id: "a4799a4ad2fc74302b14cc7b2f10fcbf3703b542", submitted_at: "2026-10-18T12:52:19Z" },
    { id: 5563635913, state: "COMMENTED", body: REAL.pf339("b146a14"), user: { login: "MrJarrad" }, commit_id: sha, submitted_at: "2026-10-18T15:15:13Z" },
  ] };
  assert.equal(runGate(pr({ pullNumber: 339, expectedHeadSha: sha }), transcript([comments(339, []), reviews])).permissionDecision, "allow");
});

test("(B2) #362's shape: a release review read with issue_read get_comments is accepted", () => {
  const sha = "6259bca432d2f6bbd722e16d3a989bcce8d4c53e";
  const k = { name: "mcp__github__issue_read", input: { method: "get_comments", owner: "MrJarrad", repo: "jhd-portfolio", issue_number: 362 }, items: [{ body: REAL.pf362("6259bca"), user: { login: "MrJarrad" }, created_at: "2026-10-18T15:37:09Z" }] };
  assert.equal(runGate(pr({ pullNumber: 362, expectedHeadSha: sha }), transcript([k])).permissionDecision, "allow");
});

test("(B2) comments fetched for another PR do not count", () => {
  assert.equal(runGate(pr(), transcript([comments(360, [REAL.d107r3(S7)])])).permissionDecision, "deny");
});

test("(B2) the vault carve-out is notes-only MrJarrad/jhd-vault, proven by get_files in the session", () => {
  const files = (names) => ({ input: { method: "get_files", owner: "MrJarrad", repo: "jhd-vault", pullNumber: 9 }, items: names.map((filename) => ({ filename })) });
  const vault = pr({ repo: "jhd-vault", pullNumber: 9 });
  assert.equal(runGate(vault, transcript([files(["projects/portfolio/portfolio-queue.md"])])).permissionDecision, "allow");
  assert.match(runGate({ ...vault, expectedHeadSha: undefined }, transcript([files(["projects/x.md", "scripts/cloud-start.sh"])])).permissionDecisionReason, /not notes-only.*scripts\/cloud-start\.sh/);
  assert.match(runGate(vault, transcript([files(["projects/x.md", "scripts/cloud-start.sh"])])).permissionDecisionReason, /no reviewer verdict/);
  assert.match(runGate(vault, transcript([])).permissionDecisionReason, /get_files/);
  assert.equal(runGate(pr({ owner: "someone", repo: "jhd-vault", pullNumber: 1 }), transcript([])).permissionDecision, "deny");
});

test("(B2) a persisted-output stub is read from its saved file, or the denial says the read was truncated", () => {
  const d = dir();
  const results = join(d, "t", "tool-results");
  mkdirSync(results, { recursive: true });
  const saved = join(results, "beyzt5l19.txt");
  writeFileSync(saved, JSON.stringify([{ body: REAL.d107r3(S7), user: { login: "MrJarrad" } }]));
  const stub = (path) => ({ input: { method: "get_comments", owner: "MrJarrad", repo: "jhd-portfolio", pullNumber: 361 }, text: `<persisted-output>\nOutput too large (33KB). Full output saved to: ${path}\n</persisted-output>` });
  assert.equal(runGate(pr(), transcript([stub(saved)], d)).permissionDecision, "allow");
  assert.match(runGate(pr(), transcript([stub(join(results, "gone.txt"))], d)).permissionDecisionReason, /verdict read was truncated; re-read the comments/);
});

test("(B2) the gate fails closed: unreadable input or a crash refuses the merge with a clear message", () => {
  const d = runGate(null, null, "not json");
  assert.equal(d.permissionDecision, "deny");
  assert.match(d.permissionDecisionReason, /fail(s|ed)? closed/);
});

test("(B2) the hook is registered, the verdict shape is defined once in the reviewer charter, and the rule names the check", () => {
  const hooks = JSON.parse(readFileSync(join(root, "hooks/hooks.json"), "utf8")).hooks.PreToolUse;
  assert.ok(hooks.some((h) => h.matcher === "mcp__github__merge_pull_request" && h.hooks[0].command.includes("merge-review-gate.mjs")));
  assert.match(flat("agents/reviewer.md"), /Verdict shape — the one definition the merge gates parse.*comment or a PR review.*`##` heading containing `Review` and `head <sha>`.*first line that begins `merge: yes` or `merge: no`/);
  assert.match(flat("skills/routing/references/HARD-RULES.md"), /Checked: `hooks\/bin\/merge-review-gate\.mjs` refuses `mcp__github__merge_pull_request`/);
  assert.match(flat("hooks/scripts/merge-after-review.mjs"), /reviewVerdict\(\[\.\.\.\(status\.comments \|\| \[\]\)\.map\(at\("createdAt"\)\), \.\.\.\(status\.reviews \|\| \[\]\)\.map\(at\("submittedAt"\)\)\]/);
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
