#!/usr/bin/env node
/* lesson-ledger — lints the `encoded:` field on every fleet lesson and ruling
   (problem 5, 2026-09-10: nine hoverboard lessons written and never shipped,
   four portfolio items queued and unshipped, three August rulings never
   versioned). A lesson nobody encoded into the plugin is a lesson nobody
   follows, so the disposition is a required field on the file itself rather
   than a memory the next wrap has to reconstruct.

   Scope: <vault-root>/fleet/lessons/*.md and <vault-root>/fleet/rulings/*.md,
   top level only (subfolders are not lesson records). Index files are exempt
   — they list lessons, they are not one. An index is named by the house
   convention (`<folder>/<folder>.md`, so `fleet/lessons/lessons.md`, or the
   `fleet-` prefixed form `fleet/lessons/fleet-lessons.md`) or declares
   `kind: index` in its frontmatter.

   Field grammar, frontmatter only:
     encoded: 1.73.0            a released plugin version shipped the rule
     encoded: pre-1.73.0        predates the ledger; already in the plugin
     encoded: queued            written, not yet shipped — blocks a release
     encoded: skipped(<reason>) deliberately not encoded, reason required
     encoded: merged(<file>)    folded into an existing file; the file must exist
                                in the vault or the plugin tree. `;` separates
                                several files, a `:<line>[,<line>]` suffix is allowed.
     budget: retires(<rule>)    rule budget (DISC-390): required on a record dated 2026-11-27 or later
     budget: none(<reason>)     whose `encoded:` is a release version; names the rule it retires, or why
                                no rule was added. Older and undated records are exempt.
     scope: behaviour-all-projects | behaviour-one-project | state
                                required on a ruling dated 2026-11-28 or later. A
                                behaviour-all-projects ruling fails while `queued` or
                                `skipped(...)` and without `target: <plugin file>[:<line>]`
                                (`;` separates several; each must exist in the plugin tree).
                                Fast lane: such a ruling is not held for the batch of
                                five; it is reported "ship now" and ships in the next release.
     retires: <name>, <name>    optional; lessons/rulings this one supersedes.
                                Each must exist under fleet/lessons or fleet/rulings
                                (`[a, b]` and `.md` suffixes allowed).

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
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const LEDGER_DIRS = ["fleet/lessons", "fleet/rulings"];

// `1.73.0` | `pre-1.73.0` | `queued` | `skipped(<non-empty reason>)`.
export const RELEASE_BATCH = 5;
export const BUDGET_FROM = "2026-11-27";
export const SCOPE_FROM = "2026-11-28";
const SCOPES = ["behaviour-all-projects", "behaviour-one-project", "state"];
const BUDGET_VALUE = /^(?:retires|none)\(\s*[^)\s][^)]*\)$/;
const VALID_ENCODED = /^(?:\d+\.\d+\.\d+|pre-\d+\.\d+\.\d+|queued|skipped\([^)]+\))$/;
const MERGED = /^merged\(([^)]*)\)$/;
// The plugin tree this script ships in (hooks/scripts/ -> repo root).
const PLUGIN_ROOT = fileURLToPath(new URL("../..", import.meta.url));

// True when `rel` resolves to an existing path that stays inside `base`
// (no `..` or absolute-path escape).
function existsInside(base, rel) {
  const full = resolve(base, rel);
  return full.startsWith(resolve(base) + sep) && existsSync(full);
}

// Why a `merged(<files>)` value is illegal, or null. A file may carry a
// `:<line>[,<line>]` suffix; it is checked against the vault, then the plugin.
function mergedProblem(value, vaultRoot) {
  const files = value.match(MERGED)[1].split(";").map((f) => f.trim().replace(/:\d+(?:,\d+)*$/, "")).filter(Boolean);
  if (files.length === 0) return "merged() names no file";
  const gone = files.filter((f) => !existsInside(vaultRoot, f) && !existsInside(PLUGIN_ROOT, f));
  return gone.length ? `merged file not found: ${gone.join(", ")}` : null;
}

// Why a behaviour-all-projects ruling's `target:` is illegal, or null: every named file must exist in the plugin tree.
function targetProblem(value) {
  const files = (value ?? "").split(";").map((f) => f.trim().replace(/:\d+(?:,\d+)*$/, "")).filter(Boolean);
  if (files.length === 0) return "target: names no plugin file";
  const gone = files.filter((f) => !existsInside(PLUGIN_ROOT, f));
  return gone.length ? `target: not a plugin file: ${gone.join(", ")}` : null;
}

// Why a `retires:` value is illegal, or null: each name must be a lesson or ruling.
function retiresProblem(value, vaultRoot) {
  const names = value.replace(/^\[|\]$/g, "").split(",").map((n) => n.trim().replace(/\.md$/, "")).filter(Boolean);
  if (names.length === 0) return "retires: names nothing";
  const gone = names.filter((n) => /[\\/]|\.\./.test(n) || !LEDGER_DIRS.some((d) => existsInside(join(vaultRoot, d), `${n}.md`)));
  return gone.length ? `retires: no such lesson or ruling: ${gone.join(", ")}` : null;
}

// An index rather than a record: stem equal to the folder name, the house
// `fleet-<folder>` form of it, or an explicit `kind: index` in frontmatter.
// The stem tests are cheap and answer nearly every case; the frontmatter read
// is the escape hatch for an index named after its subject (`token-rulings`).
function isIndexFile(dir, name, fullPath) {
  const folder = dir.split("/").pop();
  if (name === `${folder}.md` || name === `fleet-${folder}.md`) return true;
  let text;
  try {
    text = readFileSync(fullPath, "utf8");
  } catch {
    return false;
  }
  return frontmatterValue(text, "kind") === "index";
}

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
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => join(vaultRoot, dir, e.name))
    .filter((full) => !isIndexFile(dir, full.split("/").pop(), full))
    .sort();
}

// The raw value of one frontmatter key, or null when the file has no
// frontmatter or no such key. Scoped to the block on purpose: an `encoded:`
// mentioned in the prose below is documentation, not the field.
function frontmatterValue(text, key) {
  if (!text.startsWith("---\n")) return null;
  const close = text.indexOf("\n---", 4);
  if (close === -1) return null;
  for (const line of text.slice(4, close).split("\n")) {
    const m = line.match(new RegExp(`^${key}:\\s*(.*)$`));
    if (m) return m[1].trim().replace(/\s*#.*$/, "").replace(/^["']|["']$/g, "");
  }
  return null;
}

// A queued file under fleet/rulings/ (never fleet/lessons/) is scope-eligible
// for the named-only gate below — a lesson has no CHANGED.txt entry to name
// it by, so lessons keep the unscoped (always-blocking) behaviour.
function isRulingFile(file) {
  return file.includes("/fleet/rulings/");
}

/**
 * @param {string} vaultRoot - absolute path to the vault working tree.
 * @param {{ release?: string, namedRulings?: Iterable<string> }} [opts] -
 *   `release` makes `queued` a failure. `namedRulings` (ruling filename
 *   stems, e.g. from `namedRulingsFromChangedEntry`) scopes that failure for
 *   fleet/rulings/*.md only: a queued ruling NOT in the set moves to
 *   `queuedWarning` instead of blocking — the release names the ruling it
 *   ships, it does not answer for every other session's open ruling
 *   (operator ruling 2026-09-21, `lane-progress-file`). Omit `namedRulings`
 *   to keep the prior unscoped behaviour (every queued file blocks).
 *   `queued` under fleet/lessons/ is never scoped — always blocks.
 * @returns {{ files: string[], missing: {file: string}[],
 *   invalid: {file: string, value: string, reason?: string}[], queued: {file: string}[],
 *   queuedWarning: {file: string}[], release: string|null, ok: boolean }}
 */
export function lintLessonLedger(vaultRoot, opts = {}) {
  const release = opts.release ?? null;
  const namedRulings = opts.namedRulings ? new Set(opts.namedRulings) : null;
  const files = LEDGER_DIRS.flatMap((dir) => ledgerFiles(vaultRoot, dir));
  const missing = [];
  const invalid = [];
  const queued = [];
  const queuedWarning = [];
  const behaviourDue = [];

  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue; // unreadable record — skip, same posture as the orphan scan
    }
    const value = frontmatterValue(text, "encoded");
    if (value === null || value === "") {
      missing.push({ file });
      continue;
    }
    if (MERGED.test(value)) {
      const reason = mergedProblem(value, vaultRoot);
      if (reason) {
        invalid.push({ file, value, reason });
        continue;
      }
    } else if (!VALID_ENCODED.test(value)) {
      invalid.push({ file, value });
      continue;
    }
    /* Rule budget (DISC-390): a dated record encoded in a release states what it retires, or that it added no rule. */
    const day = /(\d{4}-\d{2}-\d{2})-/.exec(file.split("/").pop())?.[1];
    if (/^\d+\.\d+\.\d+$/.test(value) && day && day >= BUDGET_FROM) {
      const budget = frontmatterValue(text, "budget");
      if (budget === null || !BUDGET_VALUE.test(budget)) {
        invalid.push({ file, value: `budget: ${budget ?? "(missing)"}`, reason: "budget: want retires(<rule>) or none(<reason>)" });
        continue;
      }
    }
    const retires = frontmatterValue(text, "retires");
    if (retires !== null) {
      const reason = retiresProblem(retires, vaultRoot);
      if (reason) {
        invalid.push({ file, value: `retires: ${retires}`, reason });
        continue;
      }
    }
    /* Scope gate (2026-11-28): a ruling that changes agent behaviour in every project must be in the plugin. */
    if (isRulingFile(file) && day && day >= SCOPE_FROM) {
      const scope = frontmatterValue(text, "scope");
      if (!SCOPES.includes(scope)) {
        invalid.push({ file, value: `scope: ${scope ?? "(missing)"}`, reason: `scope: want ${SCOPES.join(" | ")}` });
        continue;
      }
      if (scope === "behaviour-all-projects") {
        const reason =
          value === "queued" || value.startsWith("skipped(")
            ? `behaviour-all-projects ruling cannot be ${value}; put the rule in the plugin and encode it`
            : targetProblem(frontmatterValue(text, "target"));
        if (reason) {
          invalid.push({ file, value: `scope: ${scope}, encoded: ${value}`, reason });
          if (value === "queued") behaviourDue.push({ file });
          continue;
        }
      }
    }
    if (value !== "queued") continue;

    if (namedRulings && isRulingFile(file)) {
      const stem = file.split("/").pop().replace(/\.md$/, "");
      if (namedRulings.has(stem)) queued.push({ file });
      else queuedWarning.push({ file });
    } else {
      queued.push({ file });
    }
  }

  const ok = missing.length === 0 && invalid.length === 0 && (!release || queued.length === 0);
  // Release batch (DISC-390): five queued records are enough to cut a release, so the
  // queue never piles up. A prompt, not a failure; `ok` is unchanged.
  const releaseDue = queued.length + queuedWarning.length >= RELEASE_BATCH;
  return { files, missing, invalid, queued, queuedWarning, behaviourDue, release, releaseDue, ok };
}

// Ruling names the CHANGED.txt top entry cites — `[[stem]]` wiki-links (the
// house convention going forward), an explicit `fleet/rulings/<stem>.md` path, or
// a backticked `<stem>.md`. Only these can block a release under the named-only gate; any other
// queued ruling is a warning, never a refusal.
export function namedRulingsFromChangedEntry(entryText) {
  const names = new Set();
  for (const m of entryText.matchAll(/\[\[([^\]|#]+?)(?:\|[^\]]*)?\]\]/g)) {
    names.add(m[1].trim().replace(/\.md$/, ""));
  }
  for (const m of entryText.matchAll(/fleet\/rulings\/([^\s)`'"]+?)\.md/g)) {
    names.add(m[1]);
  }
  // A backticked `<stem>.md` (any leading path dropped) — the form a CHANGED entry
  // uses when it names a vault note by file, e.g. `jhd-discipline-handover.md`.
  for (const m of entryText.matchAll(/`(?:[^`\s]*\/)?([^`\s/]+?)\.md`/g)) {
    names.add(m[1]);
  }
  return names;
}

// The first entry (top of file to the first blank line) of a CHANGED.txt —
// one release per entry, blank-line separated, newest first.
export function topChangedEntry(changedText) {
  const idx = changedText.indexOf("\n\n");
  return idx === -1 ? changedText : changedText.slice(0, idx);
}

/** Human-readable report for a lintLessonLedger result. */
export function formatLedgerReport(result, vaultRoot) {
  const rel = (f) => relative(vaultRoot, f) || f;
  const lines = [];
  for (const { file } of result.missing) {
    lines.push(`  missing encoded:  ${rel(file)}`);
  }
  for (const { file, value, reason } of result.invalid) {
    lines.push(
      `  invalid encoded:  ${rel(file)} — "${value}" ` +
        (reason ? `(${reason})` : "(want <semver> | pre-<semver> | queued | skipped(<reason>) | merged(<file>))"),
    );
  }
  if (result.release) {
    for (const { file } of result.queued) {
      lines.push(`  still queued:     ${rel(file)} — encode it in ${result.release} or mark skipped(<reason>)`);
    }
    for (const { file } of result.queuedWarning ?? []) {
      lines.push(`  queued, unrelated to this release (warning only): ${rel(file)}`);
    }
  }
  const head = result.ok
    ? `lesson-ledger: ${result.files.length} record(s) clean${result.release ? ` for release ${result.release}` : ""}.`
    : `lesson-ledger: ${lines.length} problem(s) across ${result.files.length} record(s)${result.release ? ` for release ${result.release}` : ""}.`;
  for (const { file } of result.behaviourDue ?? []) {
    lines.push(`  ship now, not batched: ${rel(file)} — behaviour-all-projects ruling, next release`);
  }
  if (result.releaseDue && !result.release) {
    lines.push(
      `  release due: ${result.queued.length + (result.queuedWarning ?? []).length} queued (batch of ${RELEASE_BATCH}) — start a release for them`,
    );
  }
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
