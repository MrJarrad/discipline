#!/usr/bin/env node
/* merge-after-review — replaces the parent's manual merge chain and the
   lesson-14 helper (`scripts-not-agents`, 2026-09-22). Refuses to touch
   anything unless the named PR records a passing gate-run tail on its head
   sha (or, with no tail, every `statusCheckRollup` check is SUCCESS) and
   `mergeable` is true; otherwise squash-merges, deletes the branch,
   fast-forwards the repo's own main, and prunes worktrees. `--then-build`
   chains `release-build.mjs --repo <repo>` after a successful merge.

   Pure logic exported: `canMerge()` — the refusal gate, given a PR status
   object shaped like `gh pr view --json statusCheckRollup,mergeable`'s
   output; never merges on a caller's say-so alone.

   Usage:
     node merge-after-review.mjs --pr <owner/repo#n> --repo <path>
       [--dry-run] [--then-build]
   Exit 0 merged (and, with --then-build, built) · 1 refused or any step
   failed, naming which.                                                   */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mainWorktreeOf, normalizeRepoRoot } from "./repo-layout.mjs";

export function parseArgs(argv) {
  const out = { dryRun: false, thenBuild: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--then-build") out.thenBuild = true;
    else if (a === "--pr") out.pr = argv[++i];
    else if (a === "--repo") out.repo = argv[++i];
  }
  if (out.repo) out.repo = normalizeRepoRoot(out.repo);
  return out;
}

/* Gate-run tail (ruling `no-paid-github`, 2026-10-08): the full suite runs in
   a cloud gate-run lane and its tail is posted on the PR as a comment whose
   first line is `<!-- gate-run-tail -->`, then
   `gate-run: PASS|FAIL sha=<40-hex head sha> exit=<n> cmd=<suite command>`,
   then the tail in a code fence. A tail counts only when its author is in
   `trusted` (the PR's repo owner and the authenticated `gh` user; empty list,
   no tail), its sha equals the PR head, and `exit=` is digits then whitespace
   or end of line. The latest matching comment wins; PASS with exit!=0 or a
   `# fail [1-9]` line in the fence reads as FAIL. Returns `{ verdict, sha }`
   or null. */
export const GATE_RUN_MARKER = "<!-- gate-run-tail -->";
/* The one tail shape every merge script parses (`doer-rules.md` § Gate-run tail); named in each no-tail refusal. */
export const GATE_RUN_FORMAT = `post one PR comment: first line ${GATE_RUN_MARKER}, then \`gate-run: PASS|FAIL sha=<40-hex head sha> exit=<n> cmd=<suite command>\`, then the output tail in a code fence`;
export function gateRunTail(comments, headSha, trusted = []) {
  let found = null;
  for (const c of comments || []) {
    const body = String(c.body || "");
    if (!body.startsWith(GATE_RUN_MARKER) || !trusted.includes(c.author?.login)) continue;
    const m = body.match(/^gate-run: (PASS|FAIL) sha=([0-9a-f]{40}) exit=(\d+)(?=\s|$)/m);
    if (!m || m[2] !== headSha) continue;
    const green = m[1] === "PASS" && m[3] === "0" && !/# fail [1-9]/.test(body);
    found = { verdict: green ? "PASS" : "FAIL", sha: m[2] };
  }
  return found;
}

/* Reviewer verdict (`2026-10-09-every-merge-reviewed`; #361 merged without one,
   lesson `2026-10-18-helper-waits-for-go`). The shape is defined once, in
   `agents/reviewer.md` § Verdict: a PR comment or review whose line 1 is a `##`
   heading containing `Review` and `head <sha>`, and whose verdict line is the
   first line beginning `merge: yes|no` (bold allowed). A bold line that carries
   `merge: yes|no` mid-sentence (#107 round 3, before the shape was defined) is
   read when no line begins with it. `items` are `{ body, author: { login }, at? }`
   from `trusted` logins only; the latest on the head wins, by `at` when given
   (comments and reviews interleave). Returns `{ verdict, sha }` or null. */
export function reviewVerdict(items, headSha, trusted = []) {
  const ok = trusted.map((t) => String(t).toLowerCase());
  const head = String(headSha).toLowerCase();
  const timed = (items || []).map((c, i) => ({ c, i, t: Date.parse(c.at) }));
  /* A post with no readable timestamp ranks oldest (then list order), so the sort stays transitive
     and an untimed yes never outranks a timed no (#108 N7). */
  const rank = (x) => (Number.isNaN(x.t) ? -Infinity : x.t);
  timed.sort((x, y) => (rank(x) === rank(y) ? x.i - y.i : rank(x) < rank(y) ? -1 : 1));
  let found = null;
  for (const { c } of timed) {
    if (!ok.includes(String(c.author?.login || "").toLowerCase())) continue;
    const [first, ...rest] = String(c.body || "").split("\n");
    const h = /^##\s.*review/i.test(first) && first.match(/\bhead:?\s*`?([0-9a-f]{7,40})`?/i);
    if (!h || !head.startsWith(h[1].toLowerCase())) continue;
    const lines = rest.map((l) => l.trim());
    const line = lines.find((l) => /^\**merge: (yes|no)\b/i.test(l)) ?? lines.find((l) => /^\*\*.*\bmerge: (yes|no)\b.*\*\*$/i.test(l));
    if (!line) continue;
    /* DISC-221 L5: a verdict the parent posts for a reviewer helper names it on a `reviewer: session_<id>`
       line; a reviewer: line that is not a session id does not count. Same login either way, so this
       records provenance, not proof of authorship (see merge-review-gate.mjs limits). */
    const who = lines.find((l) => /^\**reviewer:/i.test(l));
    const reviewer = who ? (who.replace(/\*/g, "").match(/^reviewer:\s*`?(session_[A-Za-z0-9]+)`?\s*$/i) || [])[1] : null;
    if (reviewer === undefined) continue;
    found = { verdict: line.match(/\bmerge: (yes|no)\b/i)[1].toLowerCase(), sha: h[1].toLowerCase(), reviewer };
  }
  return found;
}

/* Notes-only vault PR (`2026-10-18-orchestrator-merges-own-vault-notes`): every
   changed path is markdown, outside `.github/` and `.claude/` (CI, settings). */
export function notesOnly(paths) {
  return paths.length > 0 && paths.every((p) => /\.md$/i.test(p) && !/^\.(github|claude)\//.test(p));
}

/* Logins whose gate-run tail counts: the repo owner and the authenticated
   `gh` user (a failed `gh api user` leaves the owner alone). */
export function trustedLogins(ownerRepo, runGh) {
  const out = [String(ownerRepo).split("/")[0]];
  try {
    out.push(runGh(["api", "user", "--jq", ".login"]).trim());
  } catch {}
  return out;
}

/* `status` is `{ statusCheckRollup, mergeable, headRefOid, comments, trusted }`
   (the first four are `gh pr view --json statusCheckRollup,mergeable,headRefOid,comments`;
   `trusted` comes from `trustedLogins`).
   Returns `{ ok: true }` or `{ ok: false, reason }`. A gate-run tail on the head
   sha decides the suite: PASS makes a missing or failed GitHub check non-blocking,
   FAIL refuses. With no tail for the head sha, the rollup rule stands (every
   check SUCCESS; an empty rollup is refused). `mergeable` must always be
   MERGEABLE. */
export function canMerge(status) {
  const tail = gateRunTail(status.comments, status.headRefOid, status.trusted);
  if (tail?.verdict === "FAIL") {
    return { ok: false, reason: "gate-run tail on the head sha is FAIL" };
  }
  if (!tail) {
    const rollup = status.statusCheckRollup || [];
    if (rollup.length === 0) {
      return { ok: false, reason: `no gate-run tail on the head sha and no status checks — nothing to prove green against; run the gate-run lane and ${GATE_RUN_FORMAT}` };
    }
    const notSuccess = rollup.filter((c) => c.conclusion !== "SUCCESS");
    if (notSuccess.length > 0) {
      return {
        ok: false,
        reason: `no gate-run tail on the head sha and ${notSuccess.length} check(s) not SUCCESS: ${notSuccess.map((c) => c.conclusion).join(", ")}; to prove the suite instead, ${GATE_RUN_FORMAT}`,
      };
    }
  }
  if (status.mergeable !== "MERGEABLE") {
    return { ok: false, reason: `mergeable=${status.mergeable}, not MERGEABLE` };
  }
  return { ok: true };
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...opts });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.pr || !args.repo) {
    console.error("Usage: node merge-after-review.mjs --pr <owner/repo#n> --repo <path> [--dry-run] [--then-build]");
    process.exit(1);
  }
  const [ownerRepo, prNumber] = String(args.pr).split("#");

  let status;
  try {
    const out = run("gh", ["pr", "view", prNumber, "--repo", ownerRepo, "--json", "statusCheckRollup,mergeable,headRefOid,comments,reviews,files"]);
    status = JSON.parse(out);
    status.trusted = trustedLogins(ownerRepo, (a) => run("gh", a));
  } catch (err) {
    console.error(`merge-after-review: did not read PR status — ${err.message}`);
    process.exit(1);
  }

  const verdict = canMerge(status);
  if (!verdict.ok) {
    console.error(`merge-after-review: refused — ${verdict.reason}`);
    process.exit(1);
  }
  // Notes-only vault PRs are the orchestrator's own merge (`2026-10-18-orchestrator-merges-own-vault-notes`).
  const at = (k) => (c) => ({ ...c, at: c[k] });
  const review = reviewVerdict([...(status.comments || []).map(at("createdAt")), ...(status.reviews || []).map(at("submittedAt"))], status.headRefOid, status.trusted);
  const notes = /^mrjarrad\/jhd-vault$/i.test(ownerRepo) && notesOnly((status.files || []).map((f) => f.path));
  if (!notes && review?.verdict !== "yes") {
    console.error(`merge-after-review: refused — no reviewer verdict with merge: yes on head ${String(status.headRefOid).slice(0, 7)}${review ? " (latest says merge: no)" : ""}; dispatch the reviewer first (verdict shape: agents/reviewer.md § Verdict)`);
    process.exit(1);
  }
  if (args.dryRun) {
    console.log(`merge-after-review --dry-run: would squash-merge ${args.pr}, delete branch, ff main, prune worktrees`);
    if (args.thenBuild) console.log(`  would then run release-build.mjs --repo ${args.repo}`);
    process.exit(0);
  }

  // Always the `main` worktree for a bare-layout repo, the repo root for a
  // plain checkout — never a `checkout` inside `main`, whose own branch
  // never moves off `main` (`2026-09-22-scripts-not-agents` § Layout); only
  // a fast-forward pull.
  const gitDir = mainWorktreeOf(args.repo);
  try {
    run("gh", ["pr", "merge", prNumber, "--repo", ownerRepo, "--squash", "--delete-branch"]);
    run("git", ["-C", gitDir, "pull", "--ff-only"]);
    run("git", ["-C", gitDir, "worktree", "prune"]);
  } catch (err) {
    console.error(`merge-after-review: did not complete the merge — ${err.message}`);
    process.exit(1);
  }
  console.log(`merged ${args.pr}, main fast-forwarded, worktrees pruned`);

  if (args.thenBuild) {
    const releaseBuildPath = join(new URL(".", import.meta.url).pathname, "release-build.mjs");
    try {
      const out = run("node", [releaseBuildPath, "--repo", args.repo]);
      console.log(out);
    } catch (err) {
      console.error(`merge-after-review: merge succeeded but --then-build failed — ${err.message}`);
      process.exit(1);
    }
  }
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith("merge-after-review.mjs")) main();
