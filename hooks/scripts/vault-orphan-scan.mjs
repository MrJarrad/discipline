#!/usr/bin/env node
/* vault-orphan-scan — finds notes with no inbound link (straggler prevention;
   operator ruling 2026-08-25: prevent orphans at write time, not just detect
   them at wrap — four stragglers found in a 308-note vault, each written
   with a "Hubs:" line pointing AT its hub but nothing linking back).

   A note is an orphan if neither its filename stem nor its frontmatter
   `name:` value is targeted by a [[wikilink]] or a relative markdown link
   from any OTHER note in the vault. .obsidian/ and estate/ directories are
   excluded (tooling/mirror trees, not content notes) at any depth.

   Deliberately narrow — link presence, not full Obsidian link resolution:
   no alias-only matching beyond stripping `|alias`/`#heading`, no
   folder-scoped disambiguation between two same-named notes. Good enough to
   catch the straggler failure mode; not a general graph validator (that's
   vault/scripts/vault-lint.{mjs,py} in the vault repo itself).

   Interface (deep module — small surface):
     scanVaultForOrphans(vaultRoot) -> string[] (absolute paths, sorted)

   Usage (CLI): node vault-orphan-scan.mjs <vault-root>
   Prints count + paths, exits 1 if any orphans, 0 if clean.               */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, basename, extname } from "node:path";

const EXCLUDED_DIRS = new Set([".obsidian", "estate"]);

// Recursively collects every .md file under root, skipping unreadable
// directories and the excluded trees (at any depth) rather than crashing.
function walkMarkdownFiles(root, dir = root, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // unreadable directory — skip
  }
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdownFiles(root, full, out);
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

// Extracts the frontmatter `name:` value, or null if absent/unparseable.
// Intentionally simple — same narrow posture as frontmatter-check.mjs, not a
// general YAML parser.
function frontmatterName(text) {
  if (!text.startsWith("---\n") && text !== "---") return null;
  const close = text.indexOf("\n---", 4);
  if (close === -1) return null;
  const block = text.slice(4, close);
  const match = block.match(/^name:\s*(.+)$/m);
  if (!match) return null;
  return match[1].trim().replace(/^["']|["']$/g, "");
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
 * @returns {string[]} absolute paths of orphaned notes, sorted.
 */
export function scanVaultForOrphans(vaultRoot) {
  const files = walkMarkdownFiles(vaultRoot);
  const perFile = [];
  for (const file of files) {
    const text = readSafe(file);
    if (text === null) continue;
    perFile.push({ file, stem: basename(file, ".md"), name: frontmatterName(text), text });
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
    if (target.name) {
      for (const src of linkersByTarget.get(target.name.toLowerCase()) ?? []) sources.add(src);
    }
    sources.delete(target.file); // a note linking itself doesn't count
    if (sources.size === 0) orphans.push(target.file);
  }
  return orphans.sort();
}

// ---- CLI ------------------------------------------------------------------

function isMainModule() {
  return import.meta.url === `file://${process.argv[1]}`;
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
