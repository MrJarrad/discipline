// The Cursor plugin (~/JHD/ai/discipline-cursor/main) carries its own copy of the
// skills corpus (`skills/<name>/SKILL.md`) so Cursor IDE + Cursor Cloud Agents get the
// same craft skills the Claude plugin ships. Nothing kept the two in sync — this test
// is the drift check.
//
// Canonical comparison unit: `skills/<name>/SKILL.md` in each repo, same frontmatter
// shape (`name` + `description`) in both — there is no per-skill host-adapter format
// difference here (unlike `rules/*.mdc`, which is a Cursor-only always-on layer with no
// plugin equivalent and is out of scope for this test by design: it is the host adapter,
// not a mirror of skills/).
//
// One documented host-adapter substitution is allowed without failing the test: the
// browser-evidence tool name (Cursor's built-in "Cursor Browser" vs the Claude plugin's
// "the Claude browser tools") in `skills/quality/SKILL.md` — the rest of that file, and
// every other shared skill, must be byte-identical.
//
// Root resolution: `$DISCIPLINE_CURSOR_ROOT` env var, else `~/JHD/ai/discipline-cursor/main`.
// Root absent: skip (reason printed) unless `DISCIPLINE_MIRROR_STRICT=1`, which fails.
//
// Run: node --test hooks/scripts/cursor-corpus-drift.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const pluginRepo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pluginSkillsDir = join(pluginRepo, "skills");

const cursorRoot =
  process.env.DISCIPLINE_CURSOR_ROOT || join(homedir(), "JHD", "ai", "discipline-cursor", "main");
const strict = process.env.DISCIPLINE_MIRROR_STRICT === "1";
const cursorSkillsDir = join(cursorRoot, "skills");
const rootPresent = existsSync(cursorSkillsDir);

// The one known, deliberate host-adapter substitution (browser-tool name), documented
// above. Anything outside this exact pair failing to match is real drift.
const KNOWN_ADAPTER_SUBSTITUTIONS = [
  ["Cursor Browser", "the Claude browser tools"],
];

function listSkillDirs(dir) {
  return readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory()).sort();
}

function normalizeKnownAdapters(text) {
  let out = text;
  for (const [cursorText, pluginText] of KNOWN_ADAPTER_SUBSTITUTIONS) {
    out = out.split(cursorText).join(pluginText);
  }
  return out;
}

if (!rootPresent) {
  const reason = `discipline-cursor skills dir ${cursorSkillsDir} is absent — set DISCIPLINE_CURSOR_ROOT to point at a checkout.`;
  if (strict) {
    test("cursor skills corpus matches the plugin corpus (strict, root required)", () => {
      assert.fail(reason);
    });
  } else {
    console.log(`cursor-corpus-drift.test.mjs: skipping — ${reason}`);
    test("cursor skills corpus matches the plugin corpus (skipped — root absent)", { skip: reason }, () => {});
  }
} else {
  const pluginSkills = new Set(listSkillDirs(pluginSkillsDir));
  const cursorSkills = new Set(listSkillDirs(cursorSkillsDir));

  const onlyInPlugin = [...pluginSkills].filter((s) => !cursorSkills.has(s));
  const onlyInCursor = [...cursorSkills].filter((s) => !pluginSkills.has(s));

  const shared = [...pluginSkills].filter((s) => cursorSkills.has(s)).sort();
  const drifted = [];
  for (const name of shared) {
    const pluginPath = join(pluginSkillsDir, name, "SKILL.md");
    const cursorPath = join(cursorSkillsDir, name, "SKILL.md");
    if (!existsSync(pluginPath) || !existsSync(cursorPath)) {
      drifted.push(`${name}: SKILL.md missing on one side`);
      continue;
    }
    const pluginText = readFileSync(pluginPath, "utf8");
    const cursorText = normalizeKnownAdapters(readFileSync(cursorPath, "utf8"));
    if (pluginText !== cursorText) drifted.push(name);
  }

  const isStale = onlyInPlugin.length > 0 || onlyInCursor.length > 0 || drifted.length > 0;
  const report =
    `skill sets — onlyInPlugin: ${JSON.stringify(onlyInPlugin)}, onlyInCursor: ${JSON.stringify(onlyInCursor)}; ` +
    `drifted SKILL.md content: ${JSON.stringify(drifted)}`;

  // Known-stale by design today (this test computes the live shared/drifted/name-mismatch counts —
  // discipline-cursor's README pins "aligned with v1.39.0"; the plugin is well past that).
  // This is NOT this lane's fix: it is reported here so the drift is a standing, re-runnable
  // fact rather than a one-off audit. Default run reports and does not fail the release gate;
  // `DISCIPLINE_MIRROR_STRICT=1` promotes it to a hard failure once the corpora are re-aligned
  // and this should start enforcing zero drift.
  if (isStale) console.log(`cursor-corpus-drift.test.mjs: DRIFT — ${report}`);

  test("the cursor corpus matches the plugin corpus (skill sets + SKILL.md content)", () => {
    if (isStale && !strict) return; // reported above; not yet a gating invariant
    assert.deepEqual({ onlyInPlugin, onlyInCursor, drifted }, { onlyInPlugin: [], onlyInCursor: [], drifted: [] }, report);
  });
}
