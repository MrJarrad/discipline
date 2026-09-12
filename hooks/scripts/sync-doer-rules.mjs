#!/usr/bin/env node
// Syncs this plugin's `doer-rules.md` (repo root) into a target product repo's
// `.cursor/rules/doer-rules.mdc`, as AGENTS.md:5-6 promises ("it syncs into target
// repos' `.cursor/rules/` with the rest"). Cursor rule files need an `.mdc`
// frontmatter block (description + alwaysApply); the body is byte-identical to
// `doer-rules.md` below the frontmatter, so drift between plugin and product
// copies is trivially greppable (the body after the closing `---` matches).
//
// Usage:
//   node hooks/scripts/sync-doer-rules.mjs <target-repo-path> [<target-repo-path> ...]
//
// Each target must already have a `.cursor/rules/` directory (product repos
// created via new-product standup do); the script does not create the product
// repo's directory tree from scratch — it writes/overwrites one file into an
// existing `.cursor/rules/`.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SOURCE_PATH = join(repoRoot, "doer-rules.md");

const FRONTMATTER =
  "---\n" +
  "description: Standing law for every dispatched agent in this repo — synced from the discipline plugin's doer-rules.md. Read it whole.\n" +
  "alwaysApply: true\n" +
  "---\n\n";

export function buildRuleFile(sourceText) {
  return FRONTMATTER + sourceText;
}

export function syncInto(targetRepoPath) {
  const sourceText = readFileSync(SOURCE_PATH, "utf8");
  const rulesDir = join(targetRepoPath, ".cursor", "rules");
  if (!existsSync(rulesDir)) mkdirSync(rulesDir, { recursive: true });
  const outPath = join(rulesDir, "doer-rules.mdc");
  writeFileSync(outPath, buildRuleFile(sourceText));
  return outPath;
}

// realpath-normalizes both sides: import.meta.url resolves symlinks while
// process.argv[1] does not, so a symlinked invocation would otherwise
// silently no-op its CLI block (cli-symlink-invocation.test.mjs pattern).
function isMainModule() {
  const realpath = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  };
  const invoked = process.argv[1];
  return Boolean(invoked) && realpath(fileURLToPath(import.meta.url)) === realpath(invoked);
}

if (isMainModule()) {
  const targets = process.argv.slice(2);
  if (targets.length === 0) {
    console.error("Usage: node hooks/scripts/sync-doer-rules.mjs <target-repo-path> [...]");
    process.exit(1);
  }
  for (const target of targets) {
    const outPath = syncInto(target);
    console.log(`synced doer-rules.md -> ${outPath}`);
  }
}
