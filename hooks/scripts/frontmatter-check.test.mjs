// Tests for frontmatter-check.mjs — vertical slices, one behavior per test.
// Run: node --test scripts/frontmatter-check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkSkillFrontmatter,
  checkSkillsDir,
  checkDescriptionAngleBrackets,
  checkAgentFrontmatterKeys,
  checkTopLevelDirs,
  checkMarketplaceSource,
  checkWebValidity,
} from "./frontmatter-check.mjs";

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

// ---- web-validity pass ----------------------------------------------------
// Four rules proven empirically against the claude.ai marketplace validator
// (2026-08-25). Each rule: a violating fixture fails, a clean fixture passes.

test("web rule 1: a literal '<' or '>' in a plain-scalar description fails", () => {
  const text = ["---", "name: x", "description: use <the-thing> here.", "---"].join("\n");
  const result = checkDescriptionAngleBrackets(text);
  assert.equal(result.ok, false);
  assert.equal(result.defects[0].type, "web-angle-bracket");
});

test("web rule 1: a literal '<' or '>' inside a block-scalar description continuation fails", () => {
  // Regression fixture: the block-scalar indicator itself (">-") contains a
  // ">" and must not be mistaken for offending content.
  const text = ["---", "name: x", "description: >-", "  Run with <arg> supplied.", "---"].join("\n");
  const result = checkDescriptionAngleBrackets(text);
  assert.equal(result.ok, false);
  assert.equal(result.defects[0].type, "web-angle-bracket");
});

test("web rule 1: a clean block-scalar description (no angle brackets) passes", () => {
  const text = ["---", "name: x", "description: >-", "  Decide who handles it: no angle brackets here.", "---"].join("\n");
  const result = checkDescriptionAngleBrackets(text);
  assert.equal(result.ok, true);
  assert.deepEqual(result.defects, []);
});

test("web rule 1: angle brackets outside description (e.g. argument-hint) are not flagged", () => {
  const text = [
    "---",
    "name: x",
    "description: does a thing.",
    'argument-hint: "[mode] <idea, path, or command>"',
    "---",
  ].join("\n");
  const result = checkDescriptionAngleBrackets(text);
  assert.equal(result.ok, true);
});

test("web rule 2: a custom frontmatter key on an agent (e.g. skills:) fails", () => {
  const text = [
    "---",
    "name: engineer",
    "description: builds things.",
    "tools: Read, Write",
    "model: sonnet",
    "color: blue",
    "skills: [quality, test-first]",
    "---",
  ].join("\n");
  const result = checkAgentFrontmatterKeys(text);
  assert.equal(result.ok, false);
  assert.equal(result.defects[0].type, "web-agent-key");
  assert.match(result.defects[0].message, /skills/);
});

test("web rule 2: whitelist-only agent frontmatter keys pass", () => {
  const text = [
    "---",
    "name: engineer",
    "description: builds things.",
    "tools: Read, Write",
    "model: sonnet",
    "color: blue",
    "---",
  ].join("\n");
  const result = checkAgentFrontmatterKeys(text);
  assert.equal(result.ok, true);
  assert.deepEqual(result.defects, []);
});

test("web rule 3: an unknown top-level directory with tracked content fails", () => {
  const root = mkdtempSync(join(tmpdir(), "toplevel-check-test-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "t"], { cwd: root });
    mkdirSync(join(root, "skills"), { recursive: true });
    writeFileSync(join(root, "skills", ".keep"), "", "utf8");
    mkdirSync(join(root, "scripts"), { recursive: true }); // unknown, and tracked below
    writeFileSync(join(root, "scripts", "thing.mjs"), "// x\n", "utf8");
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: root });

    const result = checkTopLevelDirs(root);
    assert.equal(result.ok, false);
    assert.equal(result.defects[0].type, "web-unknown-top-dir");
    assert.match(result.defects[0].message, /scripts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("web rule 3: a known top-level directory never fails, tracked or not", () => {
  const root = mkdtempSync(join(tmpdir(), "toplevel-check-test-"));
  try {
    mkdirSync(join(root, "skills"), { recursive: true });
    mkdirSync(join(root, "agents"), { recursive: true });
    mkdirSync(join(root, "hooks"), { recursive: true });
    mkdirSync(join(root, ".claude-plugin"), { recursive: true }); // dotdir, always ignored
    const result = checkTopLevelDirs(root);
    assert.equal(result.ok, true);
    assert.deepEqual(result.defects, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("web rule 3: an unknown directory with nothing git-tracked in it is not a marketplace risk, so it's not flagged", () => {
  const root = mkdtempSync(join(tmpdir(), "toplevel-check-test-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    mkdirSync(join(root, "scratch"), { recursive: true });
    writeFileSync(join(root, "scratch", "notes.log"), "untracked\n", "utf8"); // never `git add`ed
    const result = checkTopLevelDirs(root);
    assert.equal(result.ok, true);
    assert.deepEqual(result.defects, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("web rule 4: a marketplace.json plugin source other than './' fails", () => {
  const root = mkdtempSync(join(tmpdir(), "marketplace-source-test-"));
  try {
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(root, ".claude-plugin", "marketplace.json"),
      JSON.stringify({ plugins: [{ name: "discipline", source: { source: "github", repo: "org/repo" } }] }),
      "utf8"
    );
    const result = checkMarketplaceSource(root);
    assert.equal(result.ok, false);
    assert.equal(result.defects[0].type, "web-marketplace-source");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("web rule 4: a marketplace.json plugin source of './' passes", () => {
  const root = mkdtempSync(join(tmpdir(), "marketplace-source-test-"));
  try {
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(root, ".claude-plugin", "marketplace.json"),
      JSON.stringify({ plugins: [{ name: "discipline", source: "./" }] }),
      "utf8"
    );
    const result = checkMarketplaceSource(root);
    assert.equal(result.ok, true);
    assert.deepEqual(result.defects, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkWebValidity combines all four rules across a repo root and attaches file to each defect", () => {
  const root = mkdtempSync(join(tmpdir(), "web-validity-test-"));
  try {
    mkdirSync(join(root, "skills", "bad-skill"), { recursive: true });
    writeFileSync(
      join(root, "skills", "bad-skill", "SKILL.md"),
      ["---", "name: bad-skill", "description: uses <bracket>.", "---"].join("\n"),
      "utf8"
    );
    mkdirSync(join(root, "agents"), { recursive: true });
    writeFileSync(
      join(root, "agents", "engineer.md"),
      ["---", "name: engineer", "description: builds <things>.", "tools: Read", "model: sonnet", "color: blue", "skills: [quality]", "---"].join("\n"),
      "utf8"
    );
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(root, ".claude-plugin", "marketplace.json"),
      JSON.stringify({ plugins: [{ name: "x", source: "github" }] }),
      "utf8"
    );

    const result = checkWebValidity(root);
    assert.equal(result.ok, false);
    const types = result.defects.map((d) => d.type).sort();
    assert.deepEqual(types, ["web-agent-key", "web-angle-bracket", "web-angle-bracket", "web-marketplace-source"]);
    assert.ok(result.defects.every((d) => typeof d.file === "string" && d.file.length > 0));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
