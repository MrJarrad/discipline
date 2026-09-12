import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRuleFile, SOURCE_PATH, syncInto } from "./sync-doer-rules.mjs";

test("syncInto writes .cursor/rules/doer-rules.mdc with an alwaysApply frontmatter block", () => {
  const dir = mkdtempSync(join(tmpdir(), "doer-rules-sync-"));
  try {
    const outPath = syncInto(dir);
    assert.equal(outPath, join(dir, ".cursor", "rules", "doer-rules.mdc"));
    const written = readFileSync(outPath, "utf8");
    assert.match(written, /^---\n/, "output must open with an .mdc frontmatter block");
    assert.match(written, /alwaysApply: true/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the synced body is byte-identical to the plugin's doer-rules.md below the frontmatter", () => {
  const dir = mkdtempSync(join(tmpdir(), "doer-rules-sync-"));
  try {
    const outPath = syncInto(dir);
    const written = readFileSync(outPath, "utf8");
    const source = readFileSync(SOURCE_PATH, "utf8");
    assert.ok(written.endsWith(source), "synced file must carry doer-rules.md verbatim as its body");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildRuleFile is a pure frontmatter-plus-body wrap (no mutation of the source text)", () => {
  const fakeSource = "# Doer rules\n\nsome law here\n";
  const out = buildRuleFile(fakeSource);
  assert.ok(out.includes(fakeSource));
  assert.ok(out.startsWith("---\n"));
});

test("re-running the sync overwrites rather than duplicating the rule file", () => {
  const dir = mkdtempSync(join(tmpdir(), "doer-rules-sync-"));
  try {
    syncInto(dir);
    const secondOut = syncInto(dir);
    const written = readFileSync(secondOut, "utf8");
    const source = readFileSync(SOURCE_PATH, "utf8");
    assert.ok(written.endsWith(source));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
