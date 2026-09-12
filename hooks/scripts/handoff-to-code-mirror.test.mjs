// The plugin's `skills/handoff-to-code/SKILL.md` is a byte copy of the
// handoff-css package's `skills/handoff-to-code/dist/claude-plugin/SKILL.md`
// (AC-1, 1.75.0). This test proves the copy has not drifted from its source
// repo across sessions — the source-contract-law test only proves the
// ratified SENTENCES survive, this proves the whole file is byte-identical
// and that every law sentence in the package's own test list survives too.
//
// 1.79.0 reconciliation: the file is byte-identical to the version merged in
// 1.78.0 — there was no regression. What made it look like "0 tests" is the
// absent-root path below: it registered ONE skipped test and nothing else, so
// `node --test` reported `pass 0` for this file and the suite still went green.
// A guard that can report zero assertions is a guard you stop trusting, so the
// plugin-side assertions now run unconditionally and only the cross-repo
// comparison is conditional on the sibling checkout.
//
// Root resolution: `$HANDOFF_CSS_ROOT` env var, else `~/JHD/handoff-css/main`.
// - Root absent: skip with the reason printed, UNLESS `DISCIPLINE_MIRROR_STRICT=1`,
//   in which case absence is a failure (used in CI / release gating where the
//   sibling repo is expected to be checked out).
// - Root present: byte-compare the plugin copy to the package's dist file, and
//   dynamically import the package's `test/skill-law-sentences.mjs` to assert
//   every LAW_SENTENCES entry survives in the plugin's copy.
//
// Run: node --test hooks/scripts/handoff-to-code-mirror.test.mjs
// Strict (fail rather than skip on an absent root):
//   DISCIPLINE_MIRROR_STRICT=1 node --test hooks/scripts/handoff-to-code-mirror.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pluginSkillPath = join(repo, "skills", "handoff-to-code", "SKILL.md");

const root =
  process.env.HANDOFF_CSS_ROOT || join(homedir(), "JHD", "handoff-css", "main");
const strict = process.env.DISCIPLINE_MIRROR_STRICT === "1";
const rootPresent = existsSync(root);

// Runs on every machine, checkout or no checkout: the thing being mirrored has
// to be there and has to be the handoff-to-code skill. Without this the file
// contributes no assertion at all when the sibling repo is absent.
test("the plugin ships the handoff-to-code skill the mirror guards", () => {
  assert.ok(existsSync(pluginSkillPath), `${pluginSkillPath} is missing`);
  const pluginText = readFileSync(pluginSkillPath, "utf8");
  assert.match(pluginText, /^---\r?\n[\s\S]*?name: handoff-to-code\r?\n/, "frontmatter name is not handoff-to-code");
  assert.ok(pluginText.length > 2000, `${pluginSkillPath} is ${pluginText.length} bytes — truncated copy`);
});

if (!rootPresent) {
  const reason = `handoff-css root ${root} is absent — set HANDOFF_CSS_ROOT to point at a checkout.`;
  if (strict) {
    test("handoff-to-code plugin copy matches the handoff-css dist source (strict, root required)", () => {
      assert.fail(reason);
    });
  } else {
    console.log(`handoff-to-code-mirror.test.mjs: skipping — ${reason}`);
    test("handoff-to-code plugin copy matches the handoff-css dist source (skipped — root absent)", { skip: reason }, () => {});
  }
} else {
  const distPath = join(root, "skills", "handoff-to-code", "dist", "claude-plugin", "SKILL.md");

  test("the plugin's handoff-to-code SKILL.md is byte-identical to handoff-css's claude-plugin dist", () => {
    const pluginText = readFileSync(pluginSkillPath, "utf8");
    const distText = readFileSync(distPath, "utf8");
    assert.equal(pluginText, distText, `${pluginSkillPath} has drifted from ${distPath}`);
  });

  test("every handoff-css LAW_SENTENCES entry survives in the plugin's copy", async () => {
    const lawModulePath = join(root, "test", "skill-law-sentences.mjs");
    const { LAW_SENTENCES, carries } = await import(pathToFileURL(lawModulePath).href);
    const pluginText = readFileSync(pluginSkillPath, "utf8");
    const missing = LAW_SENTENCES.filter((sentence) => !carries(pluginText, sentence));
    assert.deepEqual(missing, [], `sentences missing from the plugin copy: ${JSON.stringify(missing)}`);
  });
}
