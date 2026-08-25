#!/usr/bin/env node
/* vault-orphan-scan — finds notes with no inbound link (straggler prevention;
   operator ruling 2026-08-25: prevent orphans at write time, not just detect
   them at wrap — four stragglers found in a 308-note vault, each written
   with a "Hubs:" line pointing AT its hub but nothing linking back).

   Resolves links the way Obsidian does: a note is linked iff its FILENAME
   stem, or an entry in its frontmatter `aliases:` list, is targeted by a
   [[wikilink]] or a relative markdown link from any OTHER note in the
   vault. Frontmatter `name:` does NOT count — a live failure the same day
   this script was written showed hub backlinks written as
   `[[frontmatter-name]]` against date-prefixed filenames staying broken,
   because Obsidian never resolves by `name:`. .obsidian/ and estate/
   directories are excluded (tooling/mirror trees, not content notes) at any
   depth.

   Deliberately narrow — link presence, not full Obsidian link resolution:
   no folder-scoped disambiguation between two same-named notes, no
   heading-block resolution beyond stripping `#heading`. Good enough to
   catch the straggler failure mode; not a general graph validator (that's
   vault/scripts/vault-lint.{mjs,py} in the vault repo itself).

   Bundle marker: a directory containing a file named `.vault-bundle` is an
   imported archival bundle (e.g. a salvaged historical doc tree) — its
   whole subtree is excluded from the scan. Bundle .md files are payload,
   not vault notes: neither orphan candidates nor link sources. The
   BUNDLE's own containing folder still needs a hub link from whatever note
   references it — this only exempts what's INSIDE the marked directory. A
   marker at the vault root itself is ignored (with a warning) rather than
   honored — a root-level marker would silence orphan detection for the
   entire vault, which is never the intent of a bundle marker.

   Interface (deep module — small surface):
     scanVaultForOrphans(vaultRoot, { warn }?) -> string[] (absolute paths, sorted)
     `warn` (default console.warn) receives the root-marker-ignored message.

   Usage (CLI): node vault-orphan-scan.mjs <vault-root>
   Prints count + paths, exits 1 if any orphans, 0 if clean.               */
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const EXCLUDED_DIRS = new Set([".obsidian", "estate"]);
const BUNDLE_MARKER = ".vault-bundle";

// Recursively collects every .md file under root, skipping unreadable
// directories, the excluded trees (at any depth), and any subtree marked
// with a `.vault-bundle` file — except at `root` itself, where the marker
// is ignored (with a warning) rather than honored, since honoring it there
// would silence orphan detection for the whole vault.
function walkMarkdownFiles(root, opts, dir = root, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // unreadable directory — skip
  }
  const hasBundleMarker = entries.some((e) => e.isFile() && e.name === BUNDLE_MARKER);
  if (hasBundleMarker) {
    if (dir === root) {
      opts.warn(
        `vault-orphan-scan: ignoring ${BUNDLE_MARKER} marker at the vault root (${dir}) — ` +
          `a root-level marker would silence orphan detection for the whole vault, so it has no effect.`
      );
    } else {
      return out; // marked archival subtree — excluded entirely, not descended into
    }
  }
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdownFiles(root, opts, full, out);
    } else if (entry.isFile() && extname(entry.name) === ".md") {
      out.push(full);
    }
  }
  return out;
}

function readSafe(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null; // unreadable/broken file — skip
  }
}

// Extracts frontmatter `aliases:` entries — either a flow list
// (`aliases: [a, b]`) or a block list (`aliases:` then `- a` / `- b` lines).
// Empty array if absent/unparseable. Intentionally simple — same narrow
// posture as frontmatter-check.mjs, not a general YAML parser.
function frontmatterAliases(text) {
  if (!text.startsWith("---\n") && text !== "---") return [];
  const close = text.indexOf("\n---", 4);
  if (close === -1) return [];
  const block = text.slice(4, close);
  const lines = block.split("\n");
  const startIdx = lines.findIndex((l) => /^aliases:/.test(l));
  if (startIdx === -1) return [];

  const firstLineValue = lines[startIdx].replace(/^aliases:/, "").trim();
  if (firstLineValue.startsWith("[")) {
    const inner = firstLineValue.replace(/^\[/, "").replace(/\]$/, "");
    return inner
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }

  const aliases = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*-\s+/.test(line)) break; // end of the block list
    aliases.push(line.replace(/^\s*-\s+/, "").trim().replace(/^["']|["']$/g, ""));
  }
  return aliases;
}

// Every [[wikilink]] target and every relative-markdown-link .md basename
// this text references, lowercased. `[[target|alias]]` and `[[target#head]]`
// resolve to `target`; a bare relative link's basename is used regardless of
// its directory (Obsidian-style: the filename is the resolution key).
function extractLinkTargets(text) {
  const targets = new Set();
  for (const m of text.matchAll(/\[\[([^\]|#]+)/g)) {
    targets.add(m[1].trim().toLowerCase());
  }
  for (const m of text.matchAll(/\]\(([^)]+\.md)\)/g)) {
    const linkPath = m[1].split("#")[0];
    try {
      targets.add(basename(decodeURIComponent(linkPath), ".md").toLowerCase());
    } catch {
      // malformed URI-encoded link — skip this one match, don't crash the scan
    }
  }
  return targets;
}

/**
 * @param {string} vaultRoot - absolute path to the vault working tree.
 * @param {{ warn?: (msg: string) => void }} [opts] - `warn` receives the
 *   root-marker-ignored message (default `console.warn`).
 * @returns {string[]} absolute paths of orphaned notes, sorted.
 */
export function scanVaultForOrphans(vaultRoot, opts = {}) {
  const warn = opts.warn ?? console.warn;
  const files = walkMarkdownFiles(vaultRoot, { warn });
  const perFile = [];
  for (const file of files) {
    const text = readSafe(file);
    if (text === null) continue;
    perFile.push({ file, stem: basename(file, ".md"), aliases: frontmatterAliases(text), text });
  }

  // target (lowercase) -> set of files that link it.
  const linkersByTarget = new Map();
  for (const f of perFile) {
    for (const target of extractLinkTargets(f.text)) {
      if (!linkersByTarget.has(target)) linkersByTarget.set(target, new Set());
      linkersByTarget.get(target).add(f.file);
    }
  }

  const orphans = [];
  for (const target of perFile) {
    const sources = new Set(linkersByTarget.get(target.stem.toLowerCase()) ?? []);
    for (const alias of target.aliases) {
      for (const src of linkersByTarget.get(alias.toLowerCase()) ?? []) sources.add(src);
    }
    sources.delete(target.file); // a note linking itself doesn't count
    if (sources.size === 0) orphans.push(target.file);
  }
  return orphans.sort();
}

// ---- CLI ------------------------------------------------------------------

// realpath-normalizes both sides before comparing: import.meta.url resolves
// symlinks (e.g. macOS's /tmp -> /private/tmp) while process.argv[1] does
// not, so a script invoked through a symlinked path used to fail this check
// and silently no-op its CLI block. Falls back to the raw path if realpath
// itself fails (e.g. a path that no longer exists).
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
  const vaultRoot = process.argv[2];
  if (!vaultRoot) {
    console.error("usage: node vault-orphan-scan.mjs <vault-root>");
    process.exit(2);
  }
  try {
    const orphans = scanVaultForOrphans(vaultRoot);
    if (orphans.length === 0) {
      console.log("vault-orphan-scan: 0 orphans.");
      process.exit(0);
    }
    console.log(`vault-orphan-scan: ${orphans.length} orphan(s).`);
    for (const orphan of orphans) console.log(`  ${orphan}`);
    process.exit(1);
  } catch (err) {
    console.error(`[vault-orphan-scan] ${err.message}`);
    process.exit(2);
  }
}
