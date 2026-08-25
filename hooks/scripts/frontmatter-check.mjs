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
import { readFileSync, readdirSync, statSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

// ---- web-validity pass ----------------------------------------------------
// Four rules proven empirically against the claude.ai marketplace validator
// (2026-08-25, one-shot harness, all fail->pass verified). Not YAML-general —
// same narrow-parser posture as the frontmatter checks above.

const AGENT_KEY_WHITELIST = new Set(["name", "description", "tools", "model", "color"]);
const KNOWN_TOP_LEVEL_DIRS = new Set([".claude-plugin", "skills", "agents", "hooks", "output-styles"]);

// Returns a short snippet centered on the first `<` or `>`, or null if none.
function findAngleBracketSnippet(text) {
  const idx = text.search(/[<>]/);
  if (idx === -1) return null;
  return text.slice(Math.max(0, idx - 15), Math.min(text.length, idx + 16)).trim();
}

// Rule 1: literal `<`/`>` in a `description:` frontmatter value. Bodies and
// argument-hint are fine — only the description key is checked.
export function checkDescriptionAngleBrackets(fileText) {
  const { block, error } = extractFrontmatterLines(fileText);
  if (error) return { ok: true, defects: [] }; // missing/unclosed caught elsewhere
  const descEntry = groupEntries(block).find((e) => e.key === "description");
  if (!descEntry) return { ok: true, defects: [] };
  // A block-scalar indicator ("|", ">-", etc.) as the first-line value is
  // markup, not content — the real text is the continuation lines only.
  const firstLineIsContent = !BLOCK_SCALAR_INDICATOR.test(descEntry.firstLineValue);
  const raw = [firstLineIsContent ? descEntry.firstLineValue : "", ...descEntry.continuation].join(" ");
  const snippet = findAngleBracketSnippet(raw);
  if (!snippet) return { ok: true, defects: [] };
  return {
    ok: false,
    defects: [{
      type: "web-angle-bracket",
      message: `description contains "<"/">" ("${snippet}") — claude.ai marketplace validator rejects literal angle brackets in description frontmatter`,
    }],
  };
}

// Rule 2: agent frontmatter keys outside the whitelist (e.g. a custom
// `skills:` key) — the validator rejects the file outright.
export function checkAgentFrontmatterKeys(fileText) {
  const { block, error } = extractFrontmatterLines(fileText);
  if (error) return { ok: true, defects: [] };
  const defects = [];
  for (const entry of groupEntries(block)) {
    if (!AGENT_KEY_WHITELIST.has(entry.key)) {
      defects.push({
        type: "web-agent-key",
        message: `agent frontmatter key "${entry.key}:" is not on the web-validator whitelist (name/description/tools/model/color)`,
      });
    }
  }
  return { ok: defects.length === 0, defects };
}

// A directory with nothing git-tracked in it (e.g. a stray local scratch dir
// holding only an untracked file) never reaches the published plugin tree —
// it isn't a real marketplace-validator risk, so it's not flagged. Falls
// back to "assume tracked" (still flags) when git isn't available.
function hasTrackedFiles(repoRoot, dirName) {
  try {
    const out = execFileSync("git", ["ls-files", dirName], { cwd: repoRoot, encoding: "utf8" });
    return out.trim().length > 0;
  } catch {
    return true;
  }
}

// Rule 3: any top-level directory outside the known-good set. Dotfiles/
// dotdirs and loose files are ignored — only unknown directories fail.
export function checkTopLevelDirs(repoRoot) {
  if (!existsSync(repoRoot)) return { ok: true, defects: [] };
  const defects = [];
  for (const entry of readdirSync(repoRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (KNOWN_TOP_LEVEL_DIRS.has(entry.name)) continue;
    if (!hasTrackedFiles(repoRoot, entry.name)) continue;
    defects.push({
      type: "web-unknown-top-dir",
      message: `top-level directory "${entry.name}/" is outside the known-good set (.claude-plugin, skills, agents, hooks, output-styles) — unknown top-level directories fail marketplace validation`,
    });
  }
  return { ok: defects.length === 0, defects };
}

// Rule 4: marketplace.json plugins[].source must stay "./" — a github-object
// source breaks web validation on a private repo (2026-08-25 finding).
export function checkMarketplaceSource(repoRoot) {
  const path = join(repoRoot, ".claude-plugin", "marketplace.json");
  if (!existsSync(path)) return { ok: true, defects: [] };
  let data;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return { ok: false, defects: [{ type: "web-marketplace-source", message: `marketplace.json failed to parse: ${err.message}` }] };
  }
  const defects = [];
  for (const plugin of data.plugins ?? []) {
    if (plugin.source !== "./") {
      defects.push({
        type: "web-marketplace-source",
        message: `plugin "${plugin.name ?? "?"}" source is ${JSON.stringify(plugin.source)}, not "./" — a github-object source breaks web validation on a private repo`,
      });
    }
  }
  return { ok: defects.length === 0, defects };
}

/**
 * Runs all four web-validity rules across a repo root: description
 * angle-brackets + agent-key whitelist over skills/*​/SKILL.md and
 * agents/*.md, plus the top-level-dirs and marketplace-source repo-wide
 * checks. Returns a flat defect list with `file` attached to each.
 */
export function checkWebValidity(repoRoot) {
  const defects = [];
  const skillsDir = join(repoRoot, "skills");
  if (existsSync(skillsDir)) {
    for (const dir of readdirSync(skillsDir).filter((n) => statSync(join(skillsDir, n)).isDirectory())) {
      const file = join(skillsDir, dir, "SKILL.md");
      if (!existsSync(file)) continue;
      const { defects: d } = checkDescriptionAngleBrackets(readFileSync(file, "utf8"));
      for (const def of d) defects.push({ ...def, file });
    }
  }
  const agentsDir = join(repoRoot, "agents");
  if (existsSync(agentsDir)) {
    for (const name of readdirSync(agentsDir).filter((n) => n.endsWith(".md"))) {
      const file = join(agentsDir, name);
      const text = readFileSync(file, "utf8");
      for (const def of checkDescriptionAngleBrackets(text).defects) defects.push({ ...def, file });
      for (const def of checkAgentFrontmatterKeys(text).defects) defects.push({ ...def, file });
    }
  }
  for (const def of checkTopLevelDirs(repoRoot).defects) defects.push({ ...def, file: repoRoot });
  for (const def of checkMarketplaceSource(repoRoot).defects) defects.push({ ...def, file: join(repoRoot, ".claude-plugin", "marketplace.json") });

  return { ok: defects.length === 0, defects };
}

// ---- CLI ----------------------------------------------------------------

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
  const args = process.argv.slice(2);
  const getArg = (flag, fallback) => {
    const idx = args.indexOf(flag);
    return idx === -1 ? fallback : args[idx + 1];
  };
  const repoRoot = getArg("--repo-root", process.cwd());
  const skillsDir = getArg("--skills-dir", join(repoRoot, "skills"));

  try {
    const result = checkSkillsDir(skillsDir);
    console.log(result.summary);

    const web = checkWebValidity(repoRoot);
    if (web.defects.length === 0) {
      console.log("frontmatter-check (web-validity): clean.");
    } else {
      const lines = [`frontmatter-check (web-validity): ${web.defects.length} finding(s).`];
      for (const d of web.defects) lines.push(`  [${d.type}] ${d.file}: ${d.message}`);
      console.log(lines.join("\n"));
    }

    process.exit(result.ok && web.ok ? 0 : 1);
  } catch (err) {
    console.error(`[frontmatter-check] ${err.message}`);
    process.exit(2);
  }
}
