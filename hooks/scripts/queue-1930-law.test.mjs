// The 1.93.0 queue: `2026-09-22-scripts-not-agents.md` — four mechanical
// lane shapes become deterministic plugin scripts (operator: "is there
// anything else we use agents for that could just be a script?" → "let's do
// it") plus the same-day mechanical-first addition (operator: "i have
// preference for … ways to do things that takes the need away from using ai
// … where we can go mechanical or use things like scripts that a
// preference").
// Run: node --test hooks/scripts/queue-1930-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

const SCRIPTS = ["release-build.mjs", "rulebook-sync.mjs", "ds-regen.mjs", "merge-after-review.mjs"];

// --- the four scripts exist, accept --dry-run, and carry a law test --------

for (const script of SCRIPTS) {
  test(`${script} exists under hooks/scripts/`, () => {
    assert.ok(existsSync(join(repo, "hooks", "scripts", script)), `hooks/scripts/${script} must exist`);
  });

  test(`${script} accepts --dry-run`, () => {
    const src = read(`hooks/scripts/${script}`);
    assert.match(src, /--dry-run/);
  });

  const testFile = script.replace(/\.mjs$/, ".test.mjs");
  test(`${script} has a companion law test (${testFile})`, () => {
    assert.ok(existsSync(join(repo, "hooks", "scripts", testFile)), `hooks/scripts/${testFile} must exist`);
  });

  test(`${testFile} exercises a scratch git repo, never a real remote`, () => {
    const src = read(`hooks/scripts/${testFile}`);
    assert.match(src, /git.*init/s, `${testFile} must set up a scratch git repo`);
    assert.doesNotMatch(src, /github\.com\/MrJarrad|\bgit@github\.com/, `${testFile} must never point at a real remote`);
  });
}

// --- lane-end.mjs's --then-merge/--then-build chain -------------------------

test("lane-end.mjs supports --then-merge chaining to merge-after-review.mjs", () => {
  const src = read("hooks/scripts/lane-end.mjs");
  assert.match(src, /then-merge/);
  assert.match(src, /merge-after-review\.mjs/);
});

test("lane-end.mjs's --then-merge chain also supports --then-build", () => {
  const src = read("hooks/scripts/lane-end.mjs");
  assert.match(src, /then-build/);
});

// --- routing names the four scripts (offloaded to a reference) -------------

test("routing's baton table points at the mechanical scripts reference", () => {
  const doc = flat(read("skills/routing/SKILL.md"));
  assert.match(doc, /MECHANICAL-SCRIPTS\.md/);
});

test("routing's MECHANICAL-SCRIPTS.md names all four scripts", () => {
  const doc = read("skills/routing/references/MECHANICAL-SCRIPTS.md");
  for (const script of SCRIPTS) {
    assert.match(doc, new RegExp(script.replace(".", "\\.")));
  }
});

// --- mechanical-first principle, three sites --------------------------------

test("doer-rules.md states mechanical-first at the top of § You are the doer", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /\*\*Mechanical first\.\*\* When shaping any solution, a deterministic mechanism/);
});

test("quality/SKILL.md states mechanical-first as a non-negotiable", () => {
  const doc = flat(read("skills/quality/SKILL.md"));
  assert.match(doc, /\*\*Mechanical first\.\*\* A deterministic mechanism/);
});

test("code-minimalism/SKILL.md's ladder names mechanical-first as the rung before authoring new code", () => {
  const doc = flat(read("skills/code-minimalism/SKILL.md"));
  assert.match(doc, /\*\*Mechanical first\?\*\*/);
  assert.match(doc, /\*\*Only then:\*\* write the \*minimum working code\*/);
  // Mechanical-first must be the rung immediately before "Only then: write the
  // minimum working code" — never after it.
  const mechanicalIdx = doc.indexOf("**Mechanical first?**");
  const onlyThenIdx = doc.indexOf("**Only then:** write the *minimum working code*");
  assert.ok(mechanicalIdx > -1 && onlyThenIdx > -1 && mechanicalIdx < onlyThenIdx);
});

// --- Boundaries paragraph in the ruling file --------------------------------

test("the vault ruling's Boundaries paragraph is present with the four-script contract", () => {
  // The vault lives outside this repo checkout in CI; this test only runs
  // where the vault path is reachable (local dev / the release lane).
  const vaultPath = join(
    process.env.HOME || "",
    "JHD/vault/main/projects/jhd-discipline/decisions/2026-09-22-scripts-not-agents.md",
  );
  if (!existsSync(vaultPath)) return; // skip outside the dev machine
  const doc = readFileSync(vaultPath, "utf8");
  assert.match(doc, /encoded: 1\.93\.0/);
  assert.match(doc, /## Principle/);
  assert.match(doc, /Mechanical first/);
});

// --- CHANGED.txt / version -------------------------------------------------
// Converted on touch (1.93.2, gates-assert-mechanism-not-values-2026-09-19):
// pinning "top CHANGED entry is exactly 1.93.0" / "plugin.json is exactly
// 1.93.0" re-anchors on every later release — the same pinning-gate shape
// the other queue law tests avoid via "at or past". The mechanism asserted
// here is that CHANGED.txt carries a 1.93.0 entry naming scripts-not-agents
// and the mechanical-first principle somewhere in the file (not necessarily
// at the top), and that plugin.json's version is at or past 1.93.0.

test("CHANGED.txt carries a 1.93.0 entry naming scripts-not-agents and the mechanical-first principle", () => {
  const changed = read("CHANGED.txt");
  const entries = changed.split(/\n\n/);
  const entry = entries.find((e) => /^1\.93\.0\b/.test(e));
  assert.ok(entry, "no 1.93.0 entry found in CHANGED.txt");
  assert.match(entry, /scripts-not-agents/);
  assert.match(entry, /[Mm]echanical/);
});

test("the plugin.json version is at or past 1.93.0", () => {
  const pkg = JSON.parse(read(".claude-plugin/plugin.json"));
  const semver = /^\d+\.\d+\.\d+$/;
  assert.match(pkg.version, semver);
  const [major, minor] = pkg.version.split(".").map(Number);
  assert.ok(major > 1 || (major === 1 && minor >= 93), `${pkg.version} regressed before 1.93.0`);
});
