#!/usr/bin/env node
/* lesson-ledger — lints the `encoded:` field on every fleet lesson and ruling
   (problem 5, 2026-09-10: nine hoverboard lessons written and never shipped,
   four portfolio items queued and unshipped, three August rulings never
   versioned). A lesson nobody encoded into the plugin is a lesson nobody
   follows, so the disposition is a required field on the file itself rather
   than a memory the next wrap has to reconstruct.

   Scope: <vault-root>/fleet/lessons/*.md and <vault-root>/fleet/rulings/*.md,
   top level only (subfolders are not lesson records). Index files —
   `index.md`, `README.md` — are exempt: they list lessons, they are not one.

   Field grammar, frontmatter only:
     encoded: 1.73.0            a released plugin version shipped the rule
     encoded: pre-1.73.0        predates the ledger; already in the plugin
     encoded: queued            written, not yet shipped — blocks a release
     encoded: skipped(<reason>) deliberately not encoded, reason required

   Deliberately narrow, same posture as vault-orphan-scan.mjs and
   frontmatter-check.mjs: a line-scan of the frontmatter block, not a YAML
   parser. It answers one question — is the disposition stated and legal.

   Interface (deep module — small surface):
     lintLessonLedger(vaultRoot, { release }?) -> { files, missing, invalid, queued, ok }
     Each of missing/invalid/queued is an array of { file, value? }; `ok` folds
     in the release rule (queued is only a failure when `release` is set).

   Usage (CLI): node lesson-ledger.mjs <vault-root> [--release <ver>]
   Exit 0 clean · 1 any missing/invalid field (and, with --release, any
   `queued`) · 2 usage error or an unreadable vault root.                  */
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const LEDGER_DIRS = ["fleet/lessons", "fleet/rulings"];
const EXEMPT_FILES = new Set(["index.md", "README.md"]);

// `1.73.0` | `pre-1.73.0` | `queued` | `skipped(<non-empty reason>)`.
const VALID_ENCODED = /^(?:\d+\.\d+\.\d+|pre-\d+\.\d+\.\d+|queued|skipped\([^)]+\))$/;

// Top-level .md records in one ledger directory, sorted; index files dropped.
// A missing directory is not an error — a vault without rulings yet is clean.
function ledgerFiles(vaultRoot, dir) {
  let entries;
  try {
    entries = readdirSync(join(vaultRoot, dir), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md") && !EXEMPT_FILES.has(e.name))
    .map((e) => join(vaultRoot, dir, e.name))
    .sort();
}

// The raw `encoded:` value from the frontmatter block, or null when the file
// has no frontmatter or no such key. Scoped to the block on purpose: an
// `encoded:` mentioned in the prose below is documentation, not the field.
function encodedValue(text) {
  if (!text.startsWith("---\n")) return null;
  const close = text.indexOf("\n---", 4);
  if (close === -1) return null;
  for (const line of text.slice(4, close).split("\n")) {
    const m = line.match(/^encoded:\s*(.*)$/);
    if (m) return m[1].trim().replace(/\s*#.*$/, "").replace(/^["']|["']$/g, "");
  }
  return null;
}

/**
 * @param {string} vaultRoot - absolute path to the vault working tree.
 * @param {{ release?: string }} [opts] - `release` makes `queued` a failure.
 * @returns {{ files: string[], missing: {file: string}[],
 *   invalid: {file: string, value: string}[], queued: {file: string}[],
 *   release: string|null, ok: boolean }}
 */
export function lintLessonLedger(vaultRoot, opts = {}) {
  const release = opts.release ?? null;
  const files = LEDGER_DIRS.flatMap((dir) => ledgerFiles(vaultRoot, dir));
  const missing = [];
  const invalid = [];
  const queued = [];

  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue; // unreadable record — skip, same posture as the orphan scan
    }
    const value = encodedValue(text);
    if (value === null || value === "") {
      missing.push({ file });
      continue;
    }
    if (!VALID_ENCODED.test(value)) {
      invalid.push({ file, value });
      continue;
    }
    if (value === "queued") queued.push({ file });
  }

  const ok = missing.length === 0 && invalid.length === 0 && (!release || queued.length === 0);
  return { files, missing, invalid, queued, release, ok };
}

/** Human-readable report for a lintLessonLedger result. */
export function formatLedgerReport(result, vaultRoot) {
  const rel = (f) => relative(vaultRoot, f) || f;
  const lines = [];
  for (const { file } of result.missing) {
    lines.push(`  missing encoded:  ${rel(file)}`);
  }
  for (const { file, value } of result.invalid) {
    lines.push(`  invalid encoded:  ${rel(file)} — "${value}" (want <semver> | pre-<semver> | queued | skipped(<reason>))`);
  }
  if (result.release) {
    for (const { file } of result.queued) {
      lines.push(`  still queued:     ${rel(file)} — encode it in ${result.release} or mark skipped(<reason>)`);
    }
  }
  const head = result.ok
    ? `lesson-ledger: ${result.files.length} record(s) clean${result.release ? ` for release ${result.release}` : ""}.`
    : `lesson-ledger: ${lines.length} problem(s) across ${result.files.length} record(s)${result.release ? ` for release ${result.release}` : ""}.`;
  return [head, ...lines].join("\n");
}

// ---- CLI ------------------------------------------------------------------

// realpath-normalizes both sides: import.meta.url resolves symlinks (macOS's
// /tmp -> /private/tmp) while process.argv[1] does not, so a symlinked
// invocation would otherwise silently no-op its CLI block
// (cli-symlink-invocation.test.mjs).
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
  const args = process.argv.slice(2);
  const releaseIdx = args.indexOf("--release");
  const release = releaseIdx === -1 ? null : args[releaseIdx + 1];
  // The release VALUE is not a positional — drop it before picking the root,
  // so `--release 1.73.0 <vault>` resolves the same as `<vault> --release …`.
  const releaseValueIdx = releaseIdx === -1 ? -1 : releaseIdx + 1;
  const positionals = args.filter((a, i) => !a.startsWith("--") && i !== releaseValueIdx);
  const vaultRoot = positionals[0];
  if (!vaultRoot || (releaseIdx !== -1 && (!release || release.startsWith("--")))) {
    console.error("usage: node lesson-ledger.mjs <vault-root> [--release <ver>]");
    process.exit(2);
  }
  if (!existsSync(vaultRoot)) {
    console.error(`[lesson-ledger] vault root not found: ${vaultRoot}`);
    process.exit(2);
  }
  try {
    const result = lintLessonLedger(vaultRoot, { release });
    console.log(formatLedgerReport(result, vaultRoot));
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(`[lesson-ledger] ${err.message}`);
    process.exit(2);
  }
}
