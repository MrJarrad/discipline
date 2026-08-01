// Tests for frontmatter-check.mjs — vertical slices, one behavior per test.
// Run: node --test scripts/frontmatter-check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSkillFrontmatter, checkSkillsDir } from "./frontmatter-check.mjs";

test("a valid skill frontmatter passes", () => {
  const text = [
    "---",
    "name: shape-stress",
    "description: Shape work into six sections. Use when planning.",
    "---",
    "",
    "# Shape Stress",
  ].join("\n");
  const result = checkSkillFrontmatter("shape-stress", text);
  assert.equal(result.ok, true);
  assert.deepEqual(result.defects, []);
});

test("an unquoted colon in the description fails with the unquoted-colon defect", () => {
  // The real shape-stress/stress-plan bug: a bare `key: value` scalar that
  // contains ": " partway through breaks YAML's mapping-value parse.
  const text = [
    "---",
    "name: shape-stress",
    "description: the absorbed stress-plan mode: one question per turn",
    "---",
  ].join("\n");
  const result = checkSkillFrontmatter("shape-stress", text);
  assert.equal(result.ok, false);
  assert.equal(result.defects.length, 1);
  assert.equal(result.defects[0].type, "unquoted-colon");
  assert.match(result.defects[0].message, /unquoted colon/i);
});

test("a missing description key fails with a missing-description defect", () => {
  const text = ["---", "name: shape-stress", "---"].join("\n");
  const result = checkSkillFrontmatter("shape-stress", text);
  assert.equal(result.ok, false);
  assert.equal(result.defects.length, 1);
  assert.equal(result.defects[0].type, "missing-description");
});

test("a missing name key fails with a missing-name defect", () => {
  const text = ["---", "description: does a thing.", "---"].join("\n");
  const result = checkSkillFrontmatter("shape-stress", text);
  assert.equal(result.ok, false);
  assert.equal(result.defects[0].type, "missing-name");
});

test("frontmatter not delimited by --- fails with a missing-frontmatter defect", () => {
  const text = "# Shape Stress\nno frontmatter here.\n";
  const result = checkSkillFrontmatter("shape-stress", text);
  assert.equal(result.ok, false);
  assert.equal(result.defects[0].type, "missing-frontmatter");
});

test("an unclosed frontmatter block fails with an unclosed-frontmatter defect", () => {
  const text = ["---", "name: shape-stress", "description: no closing delimiter"].join("\n");
  const result = checkSkillFrontmatter("shape-stress", text);
  assert.equal(result.ok, false);
  assert.equal(result.defects[0].type, "unclosed-frontmatter");
});

test("name not matching the containing directory fails with a name-mismatch defect", () => {
  const text = ["---", "name: wrong-name", "description: does a thing.", "---"].join("\n");
  const result = checkSkillFrontmatter("shape-stress", text);
  assert.equal(result.ok, false);
  assert.equal(result.defects[0].type, "name-mismatch");
});

test("a double-quoted description containing colons parses fine", () => {
  const text = [
    "---",
    "name: motion",
    '"description": "Build motion: easing, timing: springs — a fence line."'.replace('"description"', "description"),
    "---",
  ].join("\n");
  const result = checkSkillFrontmatter("motion", text);
  assert.equal(result.ok, true);
});

test("a folded block-scalar (>-) description containing colons parses fine", () => {
  const text = [
    "---",
    "name: routing",
    "description: >-",
    "  Decide WHO handles work: the orchestrator dispatches, it does not do.",
    "  Trigger on: any request.",
    "---",
  ].join("\n");
  const result = checkSkillFrontmatter("routing", text);
  assert.equal(result.ok, true);
});

test("checkSkillsDir scans every skills/*/SKILL.md and ignores non-skill dirs", () => {
  const root = mkdtempSync(join(tmpdir(), "frontmatter-check-test-"));
  try {
    // A valid skill.
    mkdirSync(join(root, "good-skill"), { recursive: true });
    writeFileSync(
      join(root, "good-skill", "SKILL.md"),
      ["---", "name: good-skill", "description: does a thing.", "---"].join("\n"),
      "utf8"
    );
    // A broken skill (unquoted colon).
    mkdirSync(join(root, "bad-skill"), { recursive: true });
    writeFileSync(
      join(root, "bad-skill", "SKILL.md"),
      ["---", "name: bad-skill", "description: breaks here: because unquoted", "---"].join("\n"),
      "utf8"
    );
    // A non-skill directory — no SKILL.md, must be ignored, not error.
    mkdirSync(join(root, "references"), { recursive: true });
    writeFileSync(join(root, "references", "notes.md"), "# not a skill\n", "utf8");

    const result = checkSkillsDir(root);
    assert.equal(result.ok, false);
    assert.equal(result.results.length, 2);
    const bad = result.results.find((r) => r.dir === "bad-skill");
    assert.equal(bad.ok, false);
    assert.equal(bad.defects[0].type, "unquoted-colon");
    const good = result.results.find((r) => r.dir === "good-skill");
    assert.equal(good.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
