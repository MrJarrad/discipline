// A skill the docs name but the plugin does not ship is a dead pointer: the
// agent reaches for it, finds nothing, and improvises. 1.79.0 found three
// (`design-taste-frontend` in README + design-craft + routing, `impeccable` in
// README + design-review). This test is the standing guard so a fourth cannot
// land, and its mirror: a shipped skill folder that no routing table names is
// unreachable by the orchestrator — routed or retired, never orphaned.
// Run: node --test hooks/scripts/skill-reference-integrity.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

const skillNames = readdirSync(join(repo, "skills"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

// Every markdown the plugin ships, skills' references/ and templates/ included.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === ".git" || entry.name === "node_modules" ? [] : walk(full);
    return entry.isFile() && entry.name.endsWith(".md") ? [relative(repo, full)] : [];
  });
const markdownDocs = () => walk(repo).filter((rel) => rel !== "CHANGED.txt").sort();

test("the plugin ships at least the skills the routing tables are written against", () => {
  assert.ok(skillNames.length >= 40, `only ${skillNames.length} skill folders found`);
  assert.ok(statSync(join(repo, "skills", "routing", "SKILL.md")).size > 0);
});

// --- Dead pointers: a named skill path must resolve to a shipped folder ----

test("every `skills/<name>` path a shipped doc names resolves to a real folder", () => {
  const dead = [];
  for (const rel of markdownDocs()) {
    const text = read(rel);
    // Path-shaped only: a real in-repo skill path, never prose ("skills/hooks/MCP
    // servers") and never an external citation ("superpowers:skills/...").
    const pathShaped = /(?<![\w:/-])skills\/([a-z0-9][a-z0-9-]*)\/(?=SKILL\.md|references\/|templates\/|scripts\/)/g;
    for (const match of text.matchAll(pathShaped)) {
      const name = match[1];
      if (!skillNames.includes(name)) dead.push(`${rel} → skills/${name}/`);
    }
  }
  assert.deepEqual(dead, [], `dead skill paths: ${dead.join(", ")}`);
});

test("every sibling-skill markdown link resolves to a shipped SKILL.md", () => {
  const dead = [];
  for (const rel of markdownDocs()) {
    for (const match of read(rel).matchAll(/\]\(\.\.\/([a-z0-9][a-z0-9-]*)\/SKILL\.md\)/g)) {
      if (!existsSync(join(repo, "skills", match[1], "SKILL.md"))) dead.push(`${rel} → ${match[1]}`);
    }
  }
  assert.deepEqual(dead, [], `dead sibling links: ${dead.join(", ")}`);
});

// Retired in 1.79.0 — neither ever shipped a folder; both were reached for.
test("no shipped doc names a retired skill", () => {
  for (const name of ["design-taste-frontend", "impeccable"]) {
    for (const rel of markdownDocs()) {
      assert.doesNotMatch(read(rel), new RegExp(name, "i"), `${rel} still names retired skill ${name}`);
    }
  }
});

// --- Orphans: a shipped skill no routing table names is unreachable -------

// "Routed" means reachable through the routing skill. 1.79.0 moved the
// domain-library lookup into routing's own references/ under the ceiling work, so
// the sweep reads routing plus everything routing points at — the law is unchanged,
// only the file the row happens to live in.
test("every shipped skill folder is named in routing or a reference routing points at", () => {
  const dir = join(repo, "skills", "routing");
  const referencesDir = join(dir, "references");
  const corpus = [readFileSync(join(dir, "SKILL.md"), "utf8")];
  if (existsSync(referencesDir)) {
    for (const file of readdirSync(referencesDir).filter((f) => f.endsWith(".md"))) {
      // Only a reference SKILL.md actually links is part of the routing surface.
      assert.ok(
        corpus[0].includes(`references/${file}`),
        `skills/routing/references/${file} is not linked from routing's SKILL.md`,
      );
      corpus.push(readFileSync(join(referencesDir, file), "utf8"));
    }
  }
  const surface = corpus.join("\n");
  const orphans = skillNames.filter((name) => !surface.includes(name));
  assert.deepEqual(orphans, [], `unrouted skill folders: ${orphans.join(", ")}`);
});
