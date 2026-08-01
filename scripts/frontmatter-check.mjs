#!/usr/bin/env node
/* frontmatter-check — parses every skills/<dir>/SKILL.md frontmatter block and
   fails on the failure class that killed shape-stress and stress-plan for
   their whole lives: a plain (unquoted) YAML scalar containing ": " partway
   through, which YAML reads as an unexpected nested mapping and refuses to
   parse the whole document — silently, with zero error surface, since a
   skill with unparseable frontmatter just renders with no description and
   never fires (proposals/INTEGRATION-REPORT.md:87-95).

   This is NOT a general-purpose YAML parser. Full YAML is far more than a
   commit gate needs, and a hand-rolled general parser is exactly the kind
   of shallow reinvention design-modules warns against. Instead this reads
   only the frontmatter shapes actually in use across skills/<dir>/SKILL.md
   (plain scalar, double/single-quoted scalar, ">-"/">"/"|"/"|-" block
   scalar, "- " list items) and is deliberately narrow: it exists to catch
   the one documented failure class (plus the adjacent "not YAML at all"
   cases: missing/unclosed delimiters, missing required keys, name/dir
   mismatch) — not to validate arbitrary YAML correctness.

   Interface (deep module — small surface):

     checkSkillFrontmatter(dirName, fileText) -> { ok, defects }
     checkSkillsDir(skillsDir) -> { ok, results, summary }

   defects[].type is one of: missing-frontmatter, unclosed-frontmatter,
   missing-name, missing-description, name-mismatch, unquoted-colon,
   invalid-yaml. Every defect carries a human `message` naming the file
   already (via checkSkillsDir's summary) and the specific defect.        */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const KEY_LINE = /^([A-Za-z0-9_-]+):(.*)$/;
const BLOCK_SCALAR_INDICATOR = /^[>|][+-]?\d*$/;

// Splits the raw file text into its frontmatter block (the lines strictly
// between the first "---" and the next line that is exactly "---") and the
// body. Returns { block: string[] | null, error: "missing" | "unclosed" }.
function extractFrontmatterLines(fileText) {
  const lines = fileText.split("\n");
  if (lines[0]?.trim() !== "---") return { block: null, error: "missing" };
  const closeIdx = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (closeIdx === -1) return { block: null, error: "unclosed" };
  return { block: lines.slice(1, closeIdx), error: null };
}

// Groups frontmatter lines into top-level entries: a line with no leading
// whitespace matching `key:` starts a new entry; every following line until
// the next such line is that entry's continuation (block scalar body, list
// items, or folded-plain continuation).
function groupEntries(blockLines) {
  const entries = [];
  for (const line of blockLines) {
    const isTopLevelKey = !/^\s/.test(line) && KEY_LINE.test(line);
    if (isTopLevelKey) {
      const [, key, rest] = line.match(KEY_LINE);
      entries.push({ key, firstLineValue: rest.trim(), continuation: [] });
    } else if (entries.length > 0 && line.trim() !== "") {
      entries[entries.length - 1].continuation.push(line);
    }
  }
  return entries;
}

// Determines whether a single physical line of a PLAIN (unquoted) scalar is
// the specific invalid-YAML shape that killed shape-stress/stress-plan: a
// colon followed by whitespace (or a trailing colon), which YAML parses as
// an unexpected nested mapping key inside what was meant to be one string.
function hasUnquotedColonDefect(line) {
  return /:(\s|$)/.test(line);
}

// Parses one entry's value enough to tell whether it's a safely-quoted /
// block-scalar form (never flagged, whatever colons it contains) or a
// plain scalar (flagged if any physical line trips hasUnquotedColonDefect).
// Returns { safe: boolean, plainLines: string[] } — plainLines is only
// populated for the plain-scalar case, for the caller to scan.
function classifyEntry(entry) {
  const first = entry.firstLineValue;
  if (first.startsWith('"') || first.startsWith("'")) {
    return { safe: true, plainLines: [] };
  }
  if (BLOCK_SCALAR_INDICATOR.test(first)) {
    return { safe: true, plainLines: [] };
  }
  if (first === "" && entry.continuation.some((l) => l.trim().startsWith("- "))) {
    return { safe: true, plainLines: [] };
  }
  // Plain scalar — first line plus any folded continuation lines.
  return { safe: false, plainLines: [first, ...entry.continuation.map((l) => l.trim())].filter(Boolean) };
}

// Strips a quoted scalar's delimiters for comparison purposes (name/desc
// presence + name-mismatch checks). Good enough for the simple escapes
// actually in use (\" inside double quotes) — not a general YAML unquoter.
function unquote(value) {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

/**
 * Checks one SKILL.md's frontmatter for the parse-gate's required shape.
 * @param {string} dirName - the skill's directory name (for name-mismatch).
 * @param {string} fileText - the full contents of SKILL.md.
 * @returns {{ ok: boolean, defects: Array<{type: string, message: string}> }}
 */
export function checkSkillFrontmatter(dirName, fileText) {
  const { block, error } = extractFrontmatterLines(fileText);
  if (error === "missing") {
    return { ok: false, defects: [{ type: "missing-frontmatter", message: "file does not open with a --- frontmatter delimiter" }] };
  }
  if (error === "unclosed") {
    return { ok: false, defects: [{ type: "unclosed-frontmatter", message: "frontmatter block has no closing --- delimiter" }] };
  }

  const entries = groupEntries(block);
  const defects = [];

  for (const entry of entries) {
    if (entry.key !== "name" && entry.key !== "description") continue;
    const { safe, plainLines } = classifyEntry(entry);
    if (!safe) {
      const badLine = plainLines.find(hasUnquotedColonDefect);
      if (badLine) {
        defects.push({
          type: "unquoted-colon",
          message: `${entry.key}: contains an unquoted colon ("${badLine.trim()}") — invalid YAML (a plain scalar can't contain ": " or a trailing ":"); quote the whole value or use a ">-" block scalar`,
        });
      }
    }
  }
  // Once an unquoted-colon defect is found for a key, don't also report a
  // name-mismatch on top of it — the key IS present, it's just unparseable.
  const unquotedKeys = new Set(
    entries
      .filter((e) => {
        const { safe, plainLines } = classifyEntry(e);
        return !safe && plainLines.some(hasUnquotedColonDefect);
      })
      .map((e) => e.key)
  );

  const nameEntry = entries.find((e) => e.key === "name");
  const descEntry = entries.find((e) => e.key === "description");

  if (!nameEntry) {
    defects.push({ type: "missing-name", message: "frontmatter has no `name` key" });
  }
  if (!descEntry) {
    defects.push({ type: "missing-description", message: "frontmatter has no `description` key" });
  }

  if (nameEntry && !unquotedKeys.has("name")) {
    const resolvedName = unquote(nameEntry.firstLineValue);
    if (resolvedName !== dirName) {
      defects.push({
        type: "name-mismatch",
        message: `frontmatter name "${resolvedName}" does not match its directory "${dirName}"`,
      });
    }
  }

  return { ok: defects.length === 0, defects };
}

/**
 * Scans every skills/<dir>/SKILL.md under skillsDir and checks each one's
 * frontmatter. Directories without a SKILL.md (references/, assets/, etc.)
 * are ignored — this checks skills, not arbitrary directories.
 * @param {string} skillsDir - absolute path to the skills/ directory.
 * @returns {{ ok: boolean, results: Array<{dir, file, ok, defects}>, summary: string }}
 */
export function checkSkillsDir(skillsDir) {
  const results = [];
  if (!existsSync(skillsDir)) {
    return { ok: true, results, summary: `frontmatter-check: ${skillsDir} does not exist, nothing to check.` };
  }
  const dirEntries = readdirSync(skillsDir).filter((name) => statSync(join(skillsDir, name)).isDirectory());
  for (const dir of dirEntries) {
    const skillFile = join(skillsDir, dir, "SKILL.md");
    if (!existsSync(skillFile)) continue; // not a skill directory
    const fileText = readFileSync(skillFile, "utf8");
    const { ok, defects } = checkSkillFrontmatter(dir, fileText);
    results.push({ dir, file: skillFile, ok, defects });
  }

  const failing = results.filter((r) => !r.ok);
  const summaryLines = [`frontmatter-check: ${results.length} skills checked, ${failing.length} failing.`];
  for (const r of failing) {
    for (const d of r.defects) {
      summaryLines.push(`  [${d.type}] ${r.file}: ${d.message}`);
    }
  }
  return { ok: failing.length === 0, results, summary: summaryLines.join("\n") };
}

// ---- CLI ----------------------------------------------------------------

function isMainModule() {
  return import.meta.url === `file://${process.argv[1]}`;
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  const getArg = (flag, fallback) => {
    const idx = args.indexOf(flag);
    return idx === -1 ? fallback : args[idx + 1];
  };
  const skillsDir = getArg("--skills-dir", join(process.cwd(), "skills"));

  try {
    const result = checkSkillsDir(skillsDir);
    console.log(result.summary);
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(`[frontmatter-check] ${err.message}`);
    process.exit(2);
  }
}
