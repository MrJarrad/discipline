// Regression test for the shared isMainModule() CLI-detection pattern used
// across hooks/scripts and hooks/bin: import.meta.url resolves symlinks
// (e.g. macOS's /tmp -> /private/tmp) while process.argv[1] does not, so a
// script invoked through a symlinked path used to fail the equality check
// and silently no-op its CLI block — no output, exit 0, nothing run. Every
// isMainModule() now realpath-normalizes both sides before comparing.
//
// This test reproduces the exact shape: create a symlink to a real script
// elsewhere on disk, invoke the script through the SYMLINK (not the real
// path), and assert the CLI block actually ran — proven by real output on
// stdout, not just a zero exit code (a silent no-op also exits 0).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FRONTMATTER_CHECK = join(import.meta.dirname, "frontmatter-check.mjs");

test("frontmatter-check.mjs invoked through a symlinked path still runs its CLI block", () => {
  const scratch = mkdtempSync(join(tmpdir(), "isMainModule-symlink-test-"));
  try {
    const symlinkPath = join(scratch, "frontmatter-check-via-symlink.mjs");
    symlinkSync(FRONTMATTER_CHECK, symlinkPath);

    // A --skills-dir that doesn't exist takes the "nothing to check" branch
    // (ok:true, exit 0) — the point isn't the verdict, it's that the CLI
    // block produced its summary line at all, which only happens if
    // isMainModule() returned true for the symlinked invocation.
    const nonexistentSkillsDir = join(scratch, "no-such-skills-dir");
    const stdout = execFileSync(
      process.execPath,
      [symlinkPath, "--skills-dir", nonexistentSkillsDir, "--repo-root", scratch],
      { encoding: "utf8" }
    );

    assert.match(stdout, /frontmatter-check:/, "CLI block did not run when invoked through a symlink");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
