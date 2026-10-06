// Tests for typecheck-marker.mjs — the marker lands in the edited file's repo.
// Run: node --test hooks/bin/typecheck-marker.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const hook = join(dirname(fileURLToPath(import.meta.url)), "typecheck-marker.mjs");

function repo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "tc-marker-")));
  execFileSync("git", ["init", "-q", dir]);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { typecheck: 'node -e "process.exit(0)"' } }));
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "a.ts"), "");
  return dir;
}
async function waitFor(path, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (existsSync(path)) return true; await new Promise((r) => setTimeout(r, 50)); }
  return false;
}

test("marker is written in the edited file's repo, not the session cwd", async () => {
  const edited = repo();
  const session = repo();
  try {
    execFileSync(process.execPath, [hook], { input: JSON.stringify({ cwd: session, tool_input: { file_path: join(edited, "src", "a.ts") } }) });
    assert.ok(await waitFor(join(edited, ".claude", ".typecheck-status.json")), "marker in edited repo");
    assert.ok(!existsSync(join(session, ".claude", ".typecheck-status.json")), "no marker in session cwd");
  } finally { rmSync(edited, { recursive: true, force: true }); rmSync(session, { recursive: true, force: true }); }
});

test("no file path: falls back to the session cwd", async () => {
  const session = repo();
  try {
    execFileSync(process.execPath, [hook], { input: JSON.stringify({ cwd: session, tool_input: {} }) });
    assert.ok(await waitFor(join(session, ".claude", ".typecheck-status.json")));
  } finally { rmSync(session, { recursive: true, force: true }); }
});
