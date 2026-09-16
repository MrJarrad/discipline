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
// 1.81.0 determinism fix (reviewer amber-1): the cross-repo comparison used to
// read handoff-css's LIVE working tree, so the gate's answer depended on
// whatever happened to be checked out there at run time — not deterministic.
// It now pins to a fixed handoff-css ref (tag `v0.7.3` by default, overridable
// via `$HANDOFF_CSS_REF`) and reads both the dist file and the law-sentences
// module through `git show <ref>:<path>` inside that checkout, so the gate's
// result depends only on the ref, not on working-tree state.
//
// Root resolution: `$HANDOFF_CSS_ROOT` env var, else `~/JHD/handoff-css/main`.
// - Root absent: skip with the reason printed, UNLESS `DISCIPLINE_MIRROR_STRICT=1`,
//   in which case absence is a failure (used in CI / release gating where the
//   sibling repo is expected to be checked out).
// - Root present: byte-compare the plugin copy to the package's dist file AT
//   the pinned ref, and evaluate the pinned ref's `test/skill-law-sentences.mjs`
//   to assert every LAW_SENTENCES entry survives in the plugin's copy.
//
// Run: node --test hooks/scripts/handoff-to-code-mirror.test.mjs
// Strict (fail rather than skip on an absent root):
//   DISCIPLINE_MIRROR_STRICT=1 node --test hooks/scripts/handoff-to-code-mirror.test.mjs
// Pin to a different ref:
//   HANDOFF_CSS_REF=v0.7.4 node --test hooks/scripts/handoff-to-code-mirror.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pluginSkillPath = join(repo, "skills", "handoff-to-code", "SKILL.md");

const root =
  process.env.HANDOFF_CSS_ROOT || join(homedir(), "JHD", "handoff-css", "main");
const ref = process.env.HANDOFF_CSS_REF || "v0.7.3";
const strict = process.env.DISCIPLINE_MIRROR_STRICT === "1";
const rootPresent = existsSync(root);

// Read a path out of the handoff-css repo AT the pinned ref, not off whatever
// happens to be checked out in the working tree — this is what makes the
// cross-repo comparison below deterministic.
function readAtRef(relPath) {
  return execFileSync("git", ["-C", root, "show", `${ref}:${relPath}`], {
    encoding: "utf8",
  });
}

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
  const distRelPath = join("skills", "handoff-to-code", "dist", "claude-plugin", "SKILL.md");

  test(`the plugin's handoff-to-code SKILL.md is byte-identical to handoff-css's claude-plugin dist at ${ref}`, () => {
    const pluginText = readFileSync(pluginSkillPath, "utf8");
    const distText = readAtRef(distRelPath);
    assert.equal(pluginText, distText, `${pluginSkillPath} has drifted from ${distRelPath} at ${ref}`);
  });

  test(`every handoff-css LAW_SENTENCES entry at ${ref} survives in the plugin's copy`, async () => {
    const lawModuleSource = readAtRef(join("test", "skill-law-sentences.mjs"));
    const tmpDir = mkdtempSync(join(tmpdir(), "handoff-to-code-mirror-"));
    const tmpModulePath = join(tmpDir, "skill-law-sentences.mjs");
    writeFileSync(tmpModulePath, lawModuleSource, "utf8");
    const { LAW_SENTENCES, carries } = await import(pathToFileURL(tmpModulePath).href);
    const pluginText = readFileSync(pluginSkillPath, "utf8");
    const missing = LAW_SENTENCES.filter((sentence) => !carries(pluginText, sentence));
    assert.deepEqual(missing, [], `sentences missing from the plugin copy: ${JSON.stringify(missing)}`);
  });
}
