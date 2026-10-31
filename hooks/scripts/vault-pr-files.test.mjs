// 1.162.0: DISC-224 — a notes-only vault PR is proven from local git, not from get_files pages.
// vault-pr-files.mjs prints the PR's changed paths: GitHub's merge commit for the PR
// (refs/pull/<n>/merge) against its first parent, the tip of whatever base the PR targets.
// merge-review-gate accepts that result for MrJarrad/jhd-vault in place of get_files reads,
// on the pinned head only, and only from its own sibling copy of the script.
// Run: node --test hooks/scripts/vault-pr-files.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = join(root, "hooks/scripts/vault-pr-files.mjs");
const gate = join(root, "hooks/bin/merge-review-gate.mjs");
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trim();
const put = (work, files, text) => { for (const f of files) { mkdirSync(dirname(join(work, f)), { recursive: true }); writeFileSync(join(work, f), text); } };

/* origin with main (and `other`, carrying other.md), a PR branch off `base` carrying `files`,
   refs/pull/7/head, and refs/pull/7/merge as GitHub builds it (base tip merged with the head).
   `stale` leaves the merge ref on an older head. Returns { clone, head }. */
function fixture(files, { base = "main", stale = false } = {}) {
  const d = mkdtempSync(join(tmpdir(), "vpf-"));
  const origin = join(d, "origin.git"), work = join(d, "work"), clone = join(d, "clone");
  git(d, "init", "-q", "--bare", "-b", "main", origin);
  git(d, "init", "-q", "-b", "main", work);
  put(work, ["README.md"], "x\n");
  git(work, "add", "."); git(work, "commit", "-qm", "base");
  git(work, "remote", "add", "origin", origin);
  git(work, "checkout", "-qb", "other"); put(work, ["other.md"], "o\n"); git(work, "add", "."); git(work, "commit", "-qm", "other");
  git(work, "checkout", "-q", "main"); git(work, "push", "-q", "origin", "main", "other");
  git(d, "clone", "-q", origin, clone);
  git(work, "checkout", "-qb", "pr", base);
  put(work, files, "y\n"); git(work, "add", "."); git(work, "commit", "-qm", "pr");
  const merged = git(work, "rev-parse", "HEAD");
  if (stale) { put(work, ["late.md"], "z\n"); git(work, "add", "."); git(work, "commit", "-qm", "late"); }
  const head = git(work, "rev-parse", "HEAD");
  git(work, "push", "-q", "origin", "HEAD:refs/pull/7/head");
  git(work, "checkout", "-q", base);
  put(work, ["README.md"], "base moved\n"); git(work, "commit", "-qam", "base moves");
  git(work, "push", "-q", "origin", base);
  git(work, "merge", "-q", "--no-ff", "-m", "merge", merged);
  git(work, "push", "-q", "origin", "HEAD:refs/pull/7/merge");
  return { clone, head };
}
const runScript = (clone, ...a) => JSON.parse(execFileSync(process.execPath, [script, "--vault", clone, "--pr", "7", ...a], { encoding: "utf8" }).trim());

test("prints the PR's changed paths at its head, one JSON line, with the clone's origin", () => {
  const { clone, head } = fixture(["projects/p/a.md", "fleet/b.md"]);
  const r = runScript(clone).vaultPrFiles;
  assert.equal(r.pr, 7);
  assert.equal(r.head, head);
  assert.deepEqual([...r.files].sort(), ["fleet/b.md", "projects/p/a.md"]);
  assert.equal(r.complete, true);
  assert.match(r.origin, /origin\.git$/);
});

test("a PR onto another base lists only its own files, not the base's difference from main", () => {
  const { clone } = fixture(["projects/p/a.md"], { base: "other" });
  assert.deepEqual(runScript(clone).vaultPrFiles.files, ["projects/p/a.md"]);
});

test("a merge ref built on an older head is not proof: complete false", () => {
  const { clone } = fixture(["projects/p/a.md"], { stale: true });
  const r = runScript(clone).vaultPrFiles;
  assert.equal(r.complete, false);
  assert.match(r.reason, /merge ref/);
});

test("a --head that differs from the fetched head is refused: complete false", () => {
  const { clone } = fixture(["projects/p/a.md"]);
  const r = runScript(clone, "--head", "0".repeat(40)).vaultPrFiles;
  assert.equal(r.complete, false);
  assert.match(r.reason, /head/);
});

/* --- the gate ---------------------------------------------------------------------------- */
const H = "bcf6540fc1159f87d0fc58e885fc8b71b0362275";
const dir = mkdtempSync(join(tmpdir(), "vpfg-"));
let n = 0;
const transcript = (command, stamp) => {
  const p = join(dir, `t${n++}.jsonl`);
  const lines = [
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "b1", name: "Bash", input: { command } }] } },
    { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "b1", content: JSON.stringify({ vaultPrFiles: stamp }) }] } },
  ];
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return p;
};
const RUN = `node ${script} --vault /v --pr 9`;
const stamp = (extra = {}) => ({ pr: 9, head: H, files: ["projects/p/a.md"], complete: true, origin: "https://github.com/MrJarrad/jhd-vault", ...extra });
const decide = (t, extra = {}) => {
  const out = execFileSync(process.execPath, [gate], { input: JSON.stringify({ tool_name: "mcp__github__merge_pull_request", tool_input: { owner: "MrJarrad", repo: "jhd-vault", pullNumber: 9, expectedHeadSha: H, ...extra }, transcript_path: t }), encoding: "utf8" });
  return out.trim() ? JSON.parse(out).hookSpecificOutput : { permissionDecision: "allow" };
};

test("gate: a notes-only vault-pr-files result on the pinned head allows the merge with no get_files read", () => {
  assert.equal(decide(transcript(RUN, stamp())).permissionDecision, "allow");
  for (const origin of ["git@github.com:MrJarrad/jhd-vault.git", "https://github.com/mrjarrad/jhd-vault.git"])
    assert.equal(decide(transcript(RUN, stamp({ origin }))).permissionDecision, "allow", origin);
});

test("gate: only the gate's own sibling script counts — a copy elsewhere, a relative path or a look-alike name is denied", () => {
  const copy = join(mkdtempSync(join(tmpdir(), "vpf-copy-")), "vault-pr-files.mjs");
  copyFileSync(script, copy);
  for (const cmd of [`node ${copy} --vault /v --pr 9`, "node hooks/scripts/vault-pr-files.mjs --vault /v --pr 9", `node ${script.replace("vault-pr-files", "x-vault-pr-files")} --vault /v --pr 9`])
    assert.equal(decide(transcript(cmd, stamp())).permissionDecision, "deny", cmd);
});

test("gate: a result from a clone whose origin is not MrJarrad/jhd-vault, or that names no origin, is not proof", () => {
  for (const origin of ["https://github.com/someone/jhd-vault", "/tmp/fake/origin.git", "https://github.com/MrJarrad/jhd-vault-fork", undefined])
    assert.equal(decide(transcript(RUN, stamp({ origin }))).permissionDecision, "deny", String(origin));
});

test("gate: a result for another head is not proof", () => {
  assert.equal(decide(transcript(RUN, stamp({ head: "a".repeat(40) }))).permissionDecision, "deny");
});

test("gate: a result naming a non-notes path still needs a verdict", () => {
  assert.equal(decide(transcript(RUN, stamp({ files: ["projects/p/a.md", "scripts/x.mjs"] }))).permissionDecision, "deny");
});

test("gate: an incomplete result, another PR's result, or one not printed by the script is not proof", () => {
  assert.equal(decide(transcript(RUN, stamp({ complete: false }))).permissionDecision, "deny");
  assert.equal(decide(transcript(RUN.replace("--pr 9", "--pr 8"), stamp({ pr: 8 }))).permissionDecision, "deny");
  assert.equal(decide(transcript(`echo '${JSON.stringify({ vaultPrFiles: stamp() })}'`, stamp())).permissionDecision, "deny");
  for (const tail of ["; echo x", " && echo x", " | tail -1", " $(echo x)", " `echo x`", " > /tmp/x", "\necho x"])
    assert.equal(decide(transcript(RUN + tail, stamp())).permissionDecision, "deny", `chained: ${JSON.stringify(tail)}`);
});

test("gate: an unpinned merge is refused even with a notes-only result", () => {
  assert.equal(decide(transcript(RUN, stamp()), { expectedHeadSha: undefined }).permissionDecision, "deny");
});
