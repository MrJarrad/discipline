#!/usr/bin/env node
/* conformance-check — reads a Figma variable capture (from capture-listener's
   POST /capture artifact) + a figma-map.json mapping file, and reports where
   the mapped code token's actual value disagrees with the Figma-resolved
   value for that variable, per mode.

   Interface (deep module — small surface, the value-resolution/extraction
   logic is all implementation):

     runConformanceCheck({ capturePath, mappingPath })
       -> { ok, defects, summary }

   ConformanceDefect reuses the capture-listener's change-record shape
   ({ path, mode, old, new, type }) plus codeLocation/tokenName tying it back
   to the mapping entry, so a defect can flow through the same taxonomy/
   tooling that already reads changes.jsonl.

   Mapping schema (figma-map.json):
     { "$schema": "conformance-map/v1",
       "entries": { "<figma variable path>": { codeLocation, tokenName, extraction } } }
   codeLocation is relative to the mapping file's GRANDPARENT directory (the
   convention: a mapping lives at <repo>/design/figma-map.json, so
   codeLocation paths are repo-relative, e.g. "src/app/globals.css").

   extraction enum (extend as new code shapes need support):
     "css-root-dark" — tokenName is a CSS custom property declared inside a
       `:root { }` block (light-mode value) and optionally overridden inside
       a `.dark { }` block (dark-mode value, falls back to the :root value
       when not overridden). Only Figma modes named "light"/"dark" are
       checked against this extraction — other mode names are skipped (no
       defect), since there's no code-side counterpart to compare against.
*/
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// ---- Figma variable index + alias resolution ----------------------------

function buildVariableIndex(collections) {
  const index = new Map(); // "collection/name" -> { valuesByMode }
  for (const col of collections || []) {
    for (const v of col.variables || []) {
      index.set(`${col.name}/${v.name}`, { valuesByMode: v.valuesByMode || {} });
    }
  }
  return index;
}

function isAliasValue(v) {
  return typeof v === "string" && v.startsWith("→ ");
}

// Resolves a Figma variable's value at `mode` down to a raw (non-alias)
// value, following alias chains. When an alias target doesn't carry the
// requested mode but has exactly one mode of its own (the common case for
// primitive collections), that single mode is used instead.
function resolveValue(path, mode, index) {
  let currentPath = path;
  let currentMode = mode;
  for (let depth = 0; depth < 10; depth++) {
    const entry = index.get(currentPath);
    if (!entry) return { error: "unresolved-path", path: currentPath };
    let value = entry.valuesByMode[currentMode];
    if (value === undefined) {
      const modes = Object.keys(entry.valuesByMode);
      if (modes.length === 1) value = entry.valuesByMode[modes[0]];
      else return { error: "unresolved-mode", path: currentPath, mode: currentMode };
    }
    if (isAliasValue(value)) {
      currentPath = value.slice(2);
      continue;
    }
    return { value };
  }
  return { error: "alias-cycle", path: currentPath };
}

// ---- CSS extraction -------------------------------------------------------

// Minimal CSS custom-property scanner: tracks a selector stack through
// arbitrary nesting (so `@media (...) { :root { --x: 1; } }` still attributes
// `--x` to `:root`) and records the LAST declaration seen for each selector,
// since source order determines override. Only declarations directly inside
// a `:root` or `.dark` block are collected — this file's other selectors
// (`@theme inline`, component utilities, etc.) are walked over but ignored.
function parseCssCustomProps(css) {
  const root = {};
  const dark = {};
  const stack = [];
  let i = 0;
  const len = css.length;
  while (i < len) {
    if (css[i] === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? len : end + 2;
      continue;
    }
    if (css[i] === "}") {
      stack.pop();
      i++;
      continue;
    }
    const declMatch = css.slice(i).match(/^--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/);
    const top = stack[stack.length - 1];
    if (declMatch && (top === ":root" || top === ".dark")) {
      const target = top === ":root" ? root : dark;
      target[declMatch[1]] = declMatch[2].trim();
      i += declMatch[0].length;
      continue;
    }
    const selMatch = css.slice(i).match(/^([^{};]+)\{/);
    if (selMatch) {
      stack.push(selMatch[1].trim());
      i += selMatch[0].length;
      continue;
    }
    i++;
  }
  return { root, dark };
}

function extractCssRootDark(cssText, tokenName) {
  const name = tokenName.replace(/^--/, "");
  const { root, dark } = parseCssCustomProps(cssText);
  const result = {};
  if (root[name] !== undefined) result.light = root[name];
  if (dark[name] !== undefined) result.dark = dark[name];
  else if (root[name] !== undefined) result.dark = root[name];
  return result;
}

const EXTRACTORS = {
  "css-root-dark": extractCssRootDark,
};

// ---- Core check ------------------------------------------------------------

function resolveCodeLocation(mappingPath, codeLocation) {
  const repoRoot = dirname(dirname(resolve(mappingPath)));
  return join(repoRoot, codeLocation);
}

function normalize(v) {
  return String(v).trim().toLowerCase();
}

export function runConformanceCheck({ capturePath, mappingPath }) {
  if (!existsSync(capturePath)) throw new Error(`capture file not found: ${capturePath}`);
  if (!existsSync(mappingPath)) throw new Error(`mapping file not found: ${mappingPath}`);

  const capture = JSON.parse(readFileSync(capturePath, "utf8"));
  const mapping = JSON.parse(readFileSync(mappingPath, "utf8"));
  const index = buildVariableIndex(capture.collections);

  const defects = [];
  let checkedCount = 0;

  for (const [figmaPath, entry] of Object.entries(mapping.entries || {})) {
    const { codeLocation, tokenName, extraction } = entry;
    checkedCount++;

    const variable = index.get(figmaPath);
    if (!variable) {
      defects.push({ path: figmaPath, codeLocation, tokenName, type: "missing-figma-path" });
      continue;
    }

    const codeFilePath = resolveCodeLocation(mappingPath, codeLocation);
    if (!existsSync(codeFilePath)) {
      defects.push({ path: figmaPath, codeLocation, tokenName, type: "missing-code-location" });
      continue;
    }

    const extractor = EXTRACTORS[extraction];
    if (!extractor) {
      defects.push({ path: figmaPath, codeLocation, tokenName, type: "unsupported-extraction", extraction });
      continue;
    }

    const codeValues = extractor(readFileSync(codeFilePath, "utf8"), tokenName);
    const figmaModes = Object.keys(variable.valuesByMode);

    for (const mode of figmaModes) {
      const codeValue = codeValues[mode];
      if (codeValue === undefined) continue; // extraction has nothing for this mode — no code counterpart to compare

      const resolved = resolveValue(figmaPath, mode, index);
      if (resolved.error) {
        defects.push({ path: figmaPath, mode, codeLocation, tokenName, type: "unresolved-value", detail: resolved.error });
        continue;
      }

      if (normalize(resolved.value) !== normalize(codeValue)) {
        defects.push({ path: figmaPath, mode, old: resolved.value, new: codeValue, codeLocation, tokenName, type: "value_mismatch" });
      }
    }
  }

  const ok = defects.length === 0;
  const summaryLines = [`Conformance check: ${checkedCount} entries checked, ${defects.length} defects.`];
  for (const d of defects) {
    if (d.type === "value_mismatch") {
      summaryLines.push(`  [value_mismatch] ${d.path} (${d.mode}): figma=${d.old} code=${d.new} (${d.codeLocation}:${d.tokenName})`);
    } else {
      summaryLines.push(`  [${d.type}] ${d.path} (${d.codeLocation}:${d.tokenName})`);
    }
  }
  return { ok, defects, summary: summaryLines.join("\n") };
}

// ---- CLI --------------------------------------------------------------

function isMainModule() {
  return import.meta.url === `file://${process.argv[1]}`;
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  const getArg = (flag, fallback) => {
    const idx = args.indexOf(flag);
    return idx === -1 ? fallback : args[idx + 1];
  };
  const capturePath = getArg(
    "--capture",
    join(process.env.HOME, "JHD", "captures", "live", "jhd-spec-designsystem-variables-styles.json")
  );
  const mappingPath = getArg("--map", join(process.env.HOME, "JHD", "portfolio-v2", "design", "figma-map.json"));

  try {
    const result = runConformanceCheck({ capturePath, mappingPath });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(`[conformance-check] ${err.message}`);
    process.exit(2);
  }
}
