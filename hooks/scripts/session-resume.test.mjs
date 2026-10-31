// session-resume (backlog 161). Run: node --test hooks/scripts/session-resume.test.mjs
// Real git repos in a temp dir stand in for GitHub; `gh` is injected as unreachable.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDigest, countOpenLookLanes, countOpenQueueRows, lastProgressLine, parseNextBlock, runCmd } from "./session-resume.mjs";

const git = (cwd, ...a) => { const r = spawnSync("git", a, { cwd, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const ID = ["-c", "user.email=t@t", "-c", "user.name=t"];

function world() {
  const root = mkdtempSync(join(tmpdir(), "sess-resume-"));
  const origin = join(root, "origin.git"); const clone = join(root, "clone"); const vault = join(root, "vault");
  git(root, "init", "-q", "--bare", origin);
  git(root, "init", "-q", clone); git(clone, "checkout", "-q", "-b", "main");
  writeFileSync(join(clone, "a"), "1"); git(clone, "add", "a"); git(clone, ...ID, "commit", "-qm", "base");
  git(clone, "remote", "add", "origin", origin); git(clone, "push", "-q", "origin", "main");
  git(clone, "checkout", "-q", "-b", "lane-x"); writeFileSync(join(clone, "b"), "2"); git(clone, "add", "b");
  git(clone, ...ID, "commit", "-qm", "lane work"); git(clone, "push", "-q", "origin", "lane-x");
  const head = git(clone, "rev-parse", "HEAD");
  // a second, shallow clone of main only: the lane branch is invisible until fetched by refspec
  const shallow = join(root, "shallow");
  git(root, "clone", "-q", "--depth", "1", "--single-branch", "--branch", "main", `file://${origin}`, shallow);
  mkdirSync(join(vault, "projects", "p", "evidence", "lane"), { recursive: true });
  writeFileSync(join(vault, "projects", "p", "p-queue.md"), "---\nname: p-queue\nkind: queue\nprefix: TP\n---\n| # | a |\n|---|---|\n| TP-1 | open |\n| TP-2 | ~~struck~~ |\n| ~~TP-3~~ | x |\n| TP-4 | open |\n");
  const prog = join(vault, "projects", "p", "evidence", "lane", "progress.md");
  writeFileSync(prog, "step 2 of 6 — build — in progress: waiting for go\n");
  const old = Date.now() / 1000 - 7200; utimesSync(prog, old, old);
  writeFileSync(join(vault, "projects", "p", "p-handover.md"), [
    "## Wrapped 2026-10-10", "### Next",
    `- lane: lane-x | repo: shallow | branch: lane-x | pr: #7 | head: abcdef0 |`,
    "  progress: projects/p/evidence/lane/progress.md | contract: projects/p/decisions/d.md | owner: reviewer | go: dispatch the reviewer",
    "- lane: gone | repo: shallow | branch: no-such | owner: parent", "",
    "## Older", "### Next", "- lane: ancient | repo: shallow | branch: x", ""].join("\n"));
  return { root, vault, shallow, head };
}
// a file-path origin has no GitHub slug, so report one for `remote get-url` (ls-remote/fetch still use the real origin)
const noGh = (cmd, args, o) => (args.includes("get-url") ? { ok: true, stdout: "https://github.com/MrJarrad/shallow.git\n", stderr: "" } : cmd === "gh" ? { ok: false, stdout: "", stderr: "could not reach api.github.com" } : runCmd(cmd, args, o));

test("parseNextBlock: newest block only, continuation lines joined, keys parsed", () => {
  const w = world();
  const lanes = parseNextBlock(readFileSyncShim(w.vault));
  assert.deepEqual(lanes.map((l) => l.lane), ["lane-x", "gone"]);
  assert.equal(lanes[0].pr, "#7"); assert.equal(lanes[0].owner, "reviewer"); assert.match(lanes[0].progress, /progress\.md$/);
});
import { readFileSync } from "node:fs";
function readFileSyncShim(vault) { return readFileSync(join(vault, "projects", "p", "p-handover.md"), "utf8"); }

test("lastProgressLine and countOpenQueueRows", () => {
  assert.equal(lastProgressLine("a\n\nb  \n\n"), "b");
  assert.equal(countOpenQueueRows(readFileSync(join(world().vault, "projects", "p", "p-queue.md"), "utf8")), 2);
});

test("a shallow clone still shows the lane branch (explicit refspec), flags stale progress, degrades without gh", () => {
  const w = world();
  const { text, lanes } = buildDigest({ vault: w.vault, repos: { shallow: w.shallow }, exec: noGh, env: {}, pluginRoot: "/nonexistent", installedPath: "/nonexistent", home: w.root });
  assert.equal(lanes.length, 2);
  assert.match(text, /head    [0-9a-f]{7} on lane-x — .*lane work/);
  assert.match(text, /PR      state\/CI not readable \(gh api: could not reach api\.github\.com\)/);
  assert.match(text, /!!      progress file is older than the branch head/);
  assert.match(text, /!!      branch moved since wrap \(handover abcdef0/);
  assert.match(text, /branch no-such is not on origin/);
  assert.match(text, /contract projects\/p\/decisions\/d\.md {3}next owner reviewer/);
  assert.match(text, /queues: TP 2 open \(counts only, one file per project/);
  assert.doesNotMatch(text, /TP-1 \| open/, "the queue rows are never reprinted by the digest");
  assert.doesNotMatch(text, /ancient/, "only the newest Next block counts");
});

test("gh REST answers become PR state and checks", () => {
  const w = world();
  const gh = (cmd, args, o) => {
    if (cmd !== "gh") return noGh(cmd, args, o);
    if (/check-runs/.test(args[1])) return { ok: true, stdout: JSON.stringify({ check_runs: [{ status: "completed", conclusion: "success" }, { status: "completed", conclusion: "failure" }, { status: "queued" }] }), stderr: "" };
    return { ok: true, stdout: JSON.stringify({ number: 7, state: "open", draft: true, mergeable_state: "clean", head: { sha: "abcdef0123" } }), stderr: "" };
  };
  const wrapped = (c, a, o) => (a.includes("get-url") ? noGh(c, a, o) : gh(c, a, o));
  const { text } = buildDigest({ vault: w.vault, repos: { shallow: w.shallow }, exec: wrapped, env: {}, pluginRoot: "/x", installedPath: "/x", home: w.root });
  assert.match(text, /PR      #7 open \(draft\), mergeable_state clean, head abcdef0, checks 1 ok \/ 1 failing \/ 1 pending/);
});

test("a lane with only a PR number falls back to the pull ref when gh is unreachable", () => {
  const w = world();
  const { text } = buildDigest({ vault: w.vault, repos: { shallow: w.shallow }, exec: noGh, env: {}, pluginRoot: "/x", installedPath: "/x", home: w.root });
  assert.match(text, /PR /);
});

test("plugin loaded older than installed is flagged as needing a reload", () => {
  const w = world();
  const mk = (d, v) => { mkdirSync(join(w.root, d, ".claude-plugin"), { recursive: true }); writeFileSync(join(w.root, d, ".claude-plugin", "plugin.json"), JSON.stringify({ version: v })); };
  mk("cache", "1.110.0");
  writeFileSync(join(w.root, "inst.json"), JSON.stringify({ plugins: { "discipline@discipline": [{ version: "1.126.0" }] } }));
  const r = buildDigest({ vault: w.vault, repos: { shallow: w.shallow }, exec: noGh, env: {}, pluginRoot: join(w.root, "cache"), installedPath: join(w.root, "inst.json"), home: w.root });
  assert.equal(r.pluginStale, true);
  assert.match(r.text, /loaded discipline 1\.110\.0; 1\.126\.0 is installed\. The session keeps the OLD cached rules until \/reload-plugins/);
});

test("untracked recent progress is listed; done lines are not; nothing throws on an empty vault", () => {
  const w = world();
  mkdirSync(join(w.vault, "projects", "q", "evidence", "z"), { recursive: true });
  writeFileSync(join(w.vault, "projects", "q", "evidence", "z", "progress.md"), "step 1 of 2 — x — in progress\n");
  writeFileSync(join(w.vault, "projects", "q", "evidence", "z", "other.md"), "x");
  mkdirSync(join(w.vault, "projects", "q", "evidence", "y"), { recursive: true });
  writeFileSync(join(w.vault, "projects", "q", "evidence", "y", "progress.md"), "step 2 of 2 — done\n");
  const { text } = buildDigest({ vault: w.vault, repos: { shallow: w.shallow }, exec: noGh, env: {}, pluginRoot: "/x", installedPath: "/x", home: w.root });
  assert.match(text, /projects\/q\/evidence\/z\/progress\.md/);
  assert.doesNotMatch(text, /evidence\/y\/progress\.md/);
  const empty = mkdtempSync(join(tmpdir(), "sess-empty-"));
  assert.match(buildDigest({ vault: empty, exec: noGh, env: {}, pluginRoot: "/x", installedPath: "/x", home: empty }).text, /No `## Next` blocks/);
});

test("look-lane cap (routing rule 17): counts open `look: yes` lanes, warns at 3, a closed lane is not counted", () => {
  assert.equal(countOpenLookLanes([{ look: "yes" }, { look: "YES" }, { look: "true", closed: true }, {}, { look: "no" }]), 2);
  const w = world();
  const lane = (n, extra = "") => `- lane: l${n} | repo: shallow | branch: lane-x | look: yes${extra}`;
  const write = (lines) => writeFileSync(join(w.vault, "projects", "p", "p-handover.md"), ["## Wrapped", "### Next", ...lines, ""].join("\n"));
  const run = () => buildDigest({ vault: w.vault, repos: { shallow: w.shallow }, exec: noGh, env: {}, pluginRoot: "/nonexistent", installedPath: "/nonexistent", home: w.root }).text;
  write([lane(1), lane(2)]);
  assert.match(run(), /^look-lanes: 2 open of 3$/m);
  write([lane(1), lane(2), lane(3)]);
  assert.match(run(), /^!! look-lanes: 3 open \(cap 3, routing rule 17\).*backlog row unless the operator says "now"/m);
  write([lane(1), lane(2), "- lane: l3 | repo: shallow | branch: no-such | look: yes"]);
  assert.match(run(), /^look-lanes: 2 open of 3$/m, "a branch gone from origin is closed");
  write(["- lane: plain | repo: shallow | branch: lane-x"]);
  assert.doesNotMatch(run(), /look-lanes/, "no look marker, no line");
});

// DISC-221 L3 (s43): PF-938 got the operator's yes and no lane was opened; it surfaced only
// when he asked. The digest lists a yes with no lane id as "approved, not started".
import { approvedNotStarted } from "./session-resume.mjs";
const PF938 = `| PF-938 | Text glow (operator 2026-10-31, verbatim, on the BTTF glow fix): "a different task, but can we add the same glow effect to text?" | 2026-10-31 | open | 2026-10-31 operator "yes" to: the same as media, text the board passes over lights up with the same glow while BTTF is on. |`;
function yesVault(rows) {
  const v = mkdtempSync(join(tmpdir(), "sess-yes-"));
  mkdirSync(join(v, "projects", "pf"), { recursive: true });
  writeFileSync(join(v, "projects", "pf", "pf-queue.md"), "---\nname: pf-queue\nkind: queue\nprefix: PF\n---\n| # | Needed | Where | Why | Recommended |\n|---|---|---|---|---|\n");
  writeFileSync(join(v, "projects", "pf", "pf-backlog.md"), `---\nname: pf-backlog\nkind: backlog\nprefix: PF\n---\n## Open\n\n| # | Item | Raised | Status | Notes |\n| - | --- | --- | --- | --- |\n${rows.join("\n")}\n`);
  return v;
}

test("s44: an awaited or denied yes is not a yes", async () => {
  const { recordsOperatorYes } = await import("./session-resume.mjs");
  assert.equal(recordsOperatorYes('2026-10-31 operator "yes" to: the glow'), true);
  assert.equal(recordsOperatorYes("awaiting the operator's yes on the ring"), false);
  assert.equal(recordsOperatorYes("operator has not said yes"), false);
  assert.equal(recordsOperatorYes("held until operator yes"), false);
});

test("DISC-221 L3: an open row carrying the operator's yes and no lane id is approved, not started", () => {
  const v = yesVault([PF938, "| PF-1 | other | 2026-10-01 | open | no decision yet |"]);
  assert.deepEqual(approvedNotStarted(v).map((r) => r.id), ["PF-938"]);
  const { text } = buildDigest({ vault: v, exec: noGh, env: {}, pluginRoot: "/x", installedPath: "/x", home: v });
  assert.match(text, /approved, not started: PF-938 \(Text glow/);
});

test("DISC-221 L3: a yes row whose Notes name a branch or PR, or whose status is in flight, is not listed", () => {
  const branch = PF938.replace("PF-938", "PF-939").replace("goes back", "goes back").replace(/ \|$/, " lane claude/text-glow. |");
  const pr = PF938.replace("PF-938", "PF-940").replace(/ \|$/, " #412 |");
  const flight = PF938.replace("PF-938", "PF-941").replace("| open |", "| in flight (#413) |");
  const v = yesVault([branch, pr, flight]);
  assert.deepEqual(approvedNotStarted(v), []);
  const { text } = buildDigest({ vault: v, exec: noGh, env: {}, pluginRoot: "/x", installedPath: "/x", home: v });
  assert.doesNotMatch(text, /approved, not started/);
});
