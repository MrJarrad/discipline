// Tests for lesson-ledger.mjs — the ledger that makes "lessons ship or say
// why not" mechanical. Fixture vaults are built in a tmpdir; the live vault is
// never read by this suite.
// Run: node --test scripts/lesson-ledger.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintLessonLedger, formatLedgerReport } from "./lesson-ledger.mjs";

const SCRIPT = join(import.meta.dirname, "lesson-ledger.mjs");

// Builds a fixture vault: { "fleet/lessons/a.md": "<encoded value>|null" }.
// A null value writes frontmatter with no `encoded:` key at all.
function fixtureVault(records) {
  const root = mkdtempSync(join(tmpdir(), "lesson-ledger-test-"));
  for (const [rel, encoded] of Object.entries(records)) {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    const fm = ["---", "name: fixture", ...(encoded === null ? [] : [`encoded: ${encoded}`]), "---", "", "body"];
    writeFileSync(full, fm.join("\n"));
  }
  return root;
}

function withVault(records, fn) {
  const root = fixtureVault(records);
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("a vault where every lesson and ruling carries encoded: is clean", () => {
  withVault(
    {
      "fleet/lessons/a.md": "1.73.0",
      "fleet/lessons/b.md": "pre-1.73.0",
      "fleet/rulings/c.md": "skipped(hoverboard-rig-specific)",
    },
    (root) => {
      const result = lintLessonLedger(root);
      assert.equal(result.files.length, 3);
      assert.deepEqual(result.missing, []);
      assert.deepEqual(result.invalid, []);
      assert.equal(result.ok, true);
    },
  );
});

test("a lesson with no encoded: field is reported missing and fails", () => {
  withVault({ "fleet/lessons/a.md": "1.73.0", "fleet/lessons/unshipped.md": null }, (root) => {
    const result = lintLessonLedger(root);
    assert.equal(result.ok, false);
    assert.equal(result.missing.length, 1);
    assert.match(result.missing[0].file, /unshipped\.md$/);
  });
});

test("an off-grammar encoded: value is invalid, not silently accepted", () => {
  withVault({ "fleet/rulings/a.md": "yes", "fleet/rulings/b.md": "skipped()" }, (root) => {
    const result = lintLessonLedger(root);
    assert.equal(result.ok, false);
    assert.equal(result.invalid.length, 2, JSON.stringify(result.invalid));
    assert.deepEqual(
      result.invalid.map((i) => i.value).sort(),
      ["skipped()", "yes"],
      "skipped() with no reason is not a disposition",
    );
  });
});

test("queued is clean without --release and a failure with it", () => {
  withVault({ "fleet/lessons/a.md": "queued" }, (root) => {
    assert.equal(lintLessonLedger(root).ok, true, "a queued lesson is legal between releases");
    const gated = lintLessonLedger(root, { release: "1.73.0" });
    assert.equal(gated.ok, false);
    assert.equal(gated.queued.length, 1);
    assert.match(formatLedgerReport(gated, root), /still queued/);
  });
});

test("the house-convention index files are exempt and subfolders are out of scope", () => {
  withVault(
    {
      "fleet/lessons/fleet-lessons.md": null,
      "fleet/lessons/lessons.md": null,
      "fleet/rulings/fleet-rulings.md": null,
      "fleet/lessons/archive/old.md": null,
      "fleet/lessons/a.md": "1.73.0",
    },
    (root) => {
      const result = lintLessonLedger(root);
      assert.equal(result.files.length, 1, result.files.join("\n"));
      assert.equal(result.ok, true);
    },
  );
});

test("kind: index in the frontmatter exempts a file whatever its stem", () => {
  const root = fixtureVault({ "fleet/rulings/a.md": "1.73.0" });
  try {
    writeFileSync(
      join(root, "fleet", "rulings", "token-rulings.md"),
      "---\nname: token-rulings\nkind: index\n---\n\nbody\n",
    );
    const result = lintLessonLedger(root);
    assert.equal(result.files.length, 1, result.files.join("\n"));
    assert.equal(result.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a vault with no fleet directories at all is clean, not an error", () => {
  withVault({ "projects/x/note.md": "1.73.0" }, (root) => {
    const result = lintLessonLedger(root);
    assert.deepEqual(result.files, []);
    assert.equal(result.ok, true);
  });
});

test("an encoded: line in the body below the frontmatter is not the field", () => {
  const root = mkdtempSync(join(tmpdir(), "lesson-ledger-body-"));
  try {
    mkdirSync(join(root, "fleet/lessons"), { recursive: true });
    writeFileSync(join(root, "fleet/lessons/a.md"), "---\nname: x\n---\n\nencoded: 1.73.0\n");
    const result = lintLessonLedger(root);
    assert.equal(result.ok, false);
    assert.equal(result.missing.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- CLI contract ---------------------------------------------------------

function runCli(args) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status, stdout: err.stdout || "", stderr: err.stderr || "" };
  }
}

test("CLI exits 0 on a clean vault and prints the record count", () => {
  withVault({ "fleet/lessons/a.md": "1.73.0" }, (root) => {
    const { code, stdout } = runCli([root]);
    assert.equal(code, 0, stdout);
    assert.match(stdout, /1 record\(s\) clean/);
  });
});

test("CLI exits 0 on this vault's own index files left unstamped", () => {
  withVault(
    {
      "fleet/lessons/fleet-lessons.md": null,
      "fleet/rulings/fleet-rulings.md": null,
      "fleet/lessons/a.md": "1.73.0",
    },
    (root) => {
      const { code, stdout } = runCli([root, "--release", "1.73.0"]);
      assert.equal(code, 0, stdout);
      assert.match(stdout, /1 record\(s\) clean/);
    },
  );
});

test("CLI exits 1 on a missing field", () => {
  withVault({ "fleet/lessons/a.md": null }, (root) => {
    const { code, stdout } = runCli([root]);
    assert.equal(code, 1, stdout);
    assert.match(stdout, /missing encoded:/);
  });
});

test("CLI --release exits 1 while any lesson is still queued", () => {
  withVault({ "fleet/lessons/a.md": "queued" }, (root) => {
    assert.equal(runCli([root]).code, 0);
    const gated = runCli([root, "--release", "1.73.0"]);
    assert.equal(gated.code, 1, gated.stdout);
    assert.match(gated.stdout, /1\.73\.0/);
  });
});

test("CLI accepts the vault root after the --release flag", () => {
  withVault({ "fleet/lessons/a.md": "1.73.0" }, (root) => {
    const { code, stdout } = runCli(["--release", "1.73.0", root]);
    assert.equal(code, 0, stdout);
    assert.match(stdout, /for release 1\.73\.0/);
  });
});

test("CLI exits 2 with no vault root and 2 on a nonexistent one", () => {
  assert.equal(runCli([]).code, 2);
  assert.equal(runCli([join(tmpdir(), "no-such-vault-root-xyz")]).code, 2);
});
