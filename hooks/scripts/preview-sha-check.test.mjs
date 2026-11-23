import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPreviewSha, EXIT } from "./preview-sha-check.mjs";

// git and gh are the system boundary; each test hands in what they would answer.
const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);
const lsRemoteSays = (out) => () => ({ ok: true, stdout: out });

test("origin's branch head differs from the lane's claimed sha: exit 1, names both", () => {
  const r = checkPreviewSha({ branch: "preview/x", sha: SHA, lsRemote: lsRemoteSays(`${OTHER}\trefs/heads/preview/x\n`) });
  assert.equal(r.code, EXIT.HEAD_MISMATCH);
  assert.equal(r.code, 1);
  assert.match(r.message, /bbbbbbb/);
  assert.match(r.message, /aaaaaaa/);
});

test("branch not on origin: exit 1, says it is absent", () => {
  const r = checkPreviewSha({ branch: "preview/x", sha: SHA, lsRemote: lsRemoteSays("") });
  assert.equal(r.code, 1);
  assert.match(r.message, /not on origin/);
});

test("ls-remote fails: exit 3, never a pass", () => {
  const r = checkPreviewSha({ branch: "preview/x", sha: SHA, lsRemote: () => ({ ok: false, stdout: "", stderr: "403" }) });
  assert.equal(r.code, 3);
  assert.match(r.message, /403/);
});

const atSha = lsRemoteSays(`${SHA}\trefs/heads/preview/x\n`);
const runs = (...list) => () => ({ ok: true, runs: list });

test("head matches, no --checks asked: exit 0", () => {
  assert.equal(checkPreviewSha({ branch: "preview/x", sha: SHA, lsRemote: atSha }).code, 0);
});

test("head matches and every check run for that sha succeeded: exit 0", () => {
  const r = checkPreviewSha({ branch: "preview/x", sha: SHA, lsRemote: atSha, checkRuns: runs({ name: "build", status: "completed", conclusion: "success" }) });
  assert.equal(r.code, 0);
});

test("a check run still in progress or failed: exit 2, names it", () => {
  const pending = checkPreviewSha({ branch: "preview/x", sha: SHA, lsRemote: atSha, checkRuns: runs({ name: "build", status: "in_progress", conclusion: null }) });
  assert.equal(pending.code, 2);
  assert.match(pending.message, /build/);
  const failed = checkPreviewSha({ branch: "preview/x", sha: SHA, lsRemote: atSha, checkRuns: runs({ name: "ok", status: "completed", conclusion: "success" }, { name: "deploy", status: "completed", conclusion: "failure" }) });
  assert.equal(failed.code, 2);
  assert.match(failed.message, /deploy/);
});

test("no check run exists for that sha yet: exit 2", () => {
  assert.equal(checkPreviewSha({ branch: "preview/x", sha: SHA, lsRemote: atSha, checkRuns: runs() }).code, 2);
});

test("check runs unreadable: exit 3", () => {
  assert.equal(checkPreviewSha({ branch: "preview/x", sha: SHA, lsRemote: atSha, checkRuns: () => ({ ok: false, stderr: "404" }) }).code, 3);
});

test("CLI: exit code is the verdict, against a real git origin", async () => {
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = mkdtempSync(join(tmpdir(), "psc-"));
  const sh = (cmd, cwd = root) => spawnSync("sh", ["-c", cmd], { cwd, encoding: "utf8" });
  sh("git init -q --bare origin.git && git init -q work");
  const work = join(root, "work");
  sh("git -c user.email=t@t -c user.name=t commit -q --allow-empty -m one && git remote add origin ../origin.git && git push -q origin HEAD:refs/heads/preview/x", work);
  const pushed = sh("git rev-parse HEAD", work).stdout.trim();
  const cli = new URL("./preview-sha-check.mjs", import.meta.url).pathname;
  const run = (sha) => spawnSync("node", [cli, "--repo", work, "--branch", "preview/x", "--sha", sha], { encoding: "utf8" });
  assert.equal(run(pushed).status, 0);
  const bad = run("0".repeat(40));
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /do not send the link/);
});
