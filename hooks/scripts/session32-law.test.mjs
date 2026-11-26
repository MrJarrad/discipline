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

test("(B1) every create_session brief opens with the parent's id and start-now; the parent checks within 5 minutes and on every wake", () => {
  const r = flat("skills/routing/references/HARD-RULES.md");
  // 1.155.0 (DISC-216): the opener now leads with "This message is your task — run it now."; id and start-now follow it.
  assert.match(r, /Every `create_session` prompt opens with "This message is your task — run it now\."[^.]*\.?[^"]*then the parent's session id and "start now, no go needed"/);
  assert.match(r, /checks each new helper with `get_session` within 5 minutes of dispatch and on every wake, and answers a blocked helper the same turn/);
});

test("(A) interactive or motion look links wait on a live walk; recordings get one too", () => {
  const p = flat("skills/present-for-review/SKILL.md");
  assert.match(p, /Interactive or motion work: a live walk is part of link-ready/);
  assert.match(p, /whenever the operator sends a recording/);
  assert.match(p, /Static look lanes are unchanged/);
});
