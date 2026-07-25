#!/usr/bin/env node
/* figma-capture — supplementary mechanics for the capture-figma skill: version
   pinning, normalized snapshots, delta summaries. The skill works without this;
   this script exists for when true REST version pinning is available/needed.

   Usage:
     figma-capture.mjs versions <fileKey>
       List file versions (id, created_at, label, description), paginated.

     figma-capture.mjs snapshot <fileKey> <outPath> [--version <id>]
       Fetch the file (pinned to <id> if given), normalize deterministically
       (sorted keys, children sorted by name/id, volatile fields stripped)
       and write JSON with a header: fileKey, fileName, versionId,
       versionCreatedAt, capturedAt, schemaVersion. fileName is the file's
       human-readable name (REST response's top-level `name`) — files are
       identified human-name-first, key as suffix. On a 404 with a version pin, retries once
       unpinned and warns loudly that the pin failed. Also attempts GET
       /v1/files/<fileKey>/variables/local and embeds the (normalized) result
       under a top-level `variables` key. That endpoint is Enterprise-plan
       gated: on 403/404 the script prints a loud warning and continues
       without failing (fall back to the MCP get_variable_defs lane per the
       capture-figma skill) — variables capture here is best-effort.

       Children-sort exception: the document root's children (the DOCUMENT
       node's `children`, i.e. the file's CANVAS/page nodes) are NOT sorted
       by name — their array order is preserved as returned by the REST API,
       because page order is semantic (e.g. a design system's dependency
       ramp). Every other `children` array in the tree is still sorted by
       name (fallback id).

       Snapshot shape note: `normalize()` is run over the whole REST file
       response (not just its `document` field), then that entire normalized
       object is nested under `snapshot.document`. So the top-level REST
       `components`/`componentSets`/`styles` maps land at
       `snapshot.document.components` / `.componentSets` / `.styles`
       (siblings of `snapshot.document.document`, the actual node tree) —
       they are preserved, just one level deeper than their REST-response
       position because of that wrapping.

     figma-capture.mjs delta <oldPath> <newPath>
       Structural diff of two snapshots keyed on NAMES: added/removed/renamed
       components, componentSets and styles, variable value changes (keyed
       per variable + per mode, never as one opaque blob), and variant
       additions (variant names parsed as prop equations, e.g.
       "device=desktop, height=medium" -> {device:"desktop",height:"medium"}).
       Variable comparison prefers the embedded `variables` block when both
       snapshots have one; falls back to document-embedded variables otherwise.
       Output opens with a file-identity header line naming both snapshots'
       file name/key and version pair before any diff content.

   Memory: full REST file responses are buffered whole (parsed object +
   serialized JSON string, so peak memory is >=2x file size). Files in the
   250MB+ range have been observed to need more V8 heap than Node's default;
   run with e.g. `node --max-old-space-size=4096 figma-capture.mjs snapshot ...`
   for large files. Pass `--no-geometry` to `snapshot` to additionally strip
   absoluteBoundingBox/absoluteRenderBounds from every node, shrinking the
   snapshot when geometry data isn't needed for the capture at hand.

   Auth: FIGMA_TOKEN env var (sent as X-Figma-Token). Single retry with
   backoff on HTTP 429.                                                      */
import { readFileSync, writeFileSync } from "node:fs";

const SCHEMA_VERSION = 1;
const API_BASE = "https://api.figma.com/v1";

export function requireToken() {
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    console.error("FIGMA_TOKEN environment variable is not set.");
    process.exit(1);
  }
  return token;
}

export async function figmaFetch(path, token) {
  const url = `${API_BASE}${path}`;
  let res = await fetch(url, { headers: { "X-Figma-Token": token } });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    res = await fetch(url, { headers: { "X-Figma-Token": token } });
  }
  return res;
}

async function cmdVersions(fileKey) {
  const token = requireToken();
  let path = `/files/${fileKey}/versions`;
  const versions = [];
  while (path) {
    const res = await figmaFetch(path, token);
    if (!res.ok) {
      console.error(`figma versions request failed: ${res.status} ${res.statusText}`);
      process.exit(1);
    }
    const body = await res.json();
    for (const v of body.versions ?? []) versions.push(v);
    if (body.pagination?.next_page) {
      const next = new URL(body.pagination.next_page);
      path = `${next.pathname.replace(/^\/v1/, "")}${next.search}`;
    } else {
      path = null;
    }
  }
  for (const v of versions) {
    console.log(`${v.id}\t${v.created_at}\t${v.label ?? ""}\t${v.description ?? ""}`);
  }
}

// --- normalization ---------------------------------------------------------

const VOLATILE_KEYS = new Set(["thumbnailUrl", "lastModified"]);
const BOUNDING_BOX_KEYS = new Set(["absoluteBoundingBox", "absoluteRenderBounds"]);

function isUrlKey(key) {
  return /Url$/.test(key);
}

function normalize(value, parentKey, parentType, opts = {}) {
  if (Array.isArray(value)) {
    const items = value.map((v) => normalize(v, parentKey, parentType, opts));
    // Canvas order is semantic: the document root's children (type DOCUMENT ->
    // children of type CANVAS, i.e. pages) encode a deliberate page ramp
    // (e.g. a design system's dependency order). Every other children array
    // keeps the deterministic sort-by-name/id.
    const isDocumentRootPages = parentKey === "children" && parentType === "DOCUMENT";
    if (parentKey === "children" && !isDocumentRootPages) {
      items.sort((a, b) => {
        const an = a?.name ?? a?.id ?? "";
        const bn = b?.name ?? b?.id ?? "";
        return String(an).localeCompare(String(bn));
      });
    }
    return items;
  }
  if (value && typeof value === "object") {
    const out = {};
    const keys = Object.keys(value).sort();
    const thisType = typeof value.type === "string" ? value.type : undefined;
    for (const key of keys) {
      if (VOLATILE_KEYS.has(key) || isUrlKey(key)) continue;
      if (opts.noGeometry && BOUNDING_BOX_KEYS.has(key)) continue;
      let v = value[key];
      if (BOUNDING_BOX_KEYS.has(key) && v && typeof v === "object") {
        const { x, y, ...rest } = v;
        v = rest;
      }
      out[key] = normalize(v, key, thisType, opts);
    }
    return out;
  }
  return value;
}

// --- snapshot ---------------------------------------------------------------

async function fetchFile(fileKey, token, versionId) {
  const qs = versionId ? `?version=${encodeURIComponent(versionId)}` : "";
  const res = await figmaFetch(`/files/${fileKey}${qs}`, token);
  return res;
}

async function fetchLocalVariables(fileKey, token, opts) {
  const res = await figmaFetch(`/files/${fileKey}/variables/local`, token);
  if (res.status === 403 || res.status === 404) {
    console.warn(
      `WARNING: variables/local returned ${res.status} — variables are Enterprise-plan gated and were NOT captured. Fall back to the MCP get_variable_defs lane per the capture-figma skill.`
    );
    return null;
  }
  if (!res.ok) {
    console.warn(`WARNING: variables/local request failed: ${res.status} ${res.statusText} — variables were NOT captured.`);
    return null;
  }
  const body = await res.json();
  return normalize(body, undefined, undefined, opts);
}

// Builds a snapshot object in memory (no file I/O, no process.exit) — the
// reusable core other scripts (e.g. capture-poll.mjs) import directly rather
// than spawning this file as a child process. Throws on hard failure so
// callers choose their own error handling; cmdSnapshot (the CLI path below)
// is unchanged and still owns process.exit/console.error/writeFileSync.
export async function buildSnapshot(fileKey, token, versionId, opts = {}) {
  let res = await fetchFile(fileKey, token, versionId);
  let effectiveVersionId = versionId;
  if (!res.ok && versionId && res.status === 404) {
    console.warn(
      `WARNING: version pin ${versionId} returned 404 (documented Figma quirk) — retrying unpinned. Snapshot is NOT pinned to the requested version.`
    );
    res = await fetchFile(fileKey, token, undefined);
    effectiveVersionId = undefined;
  }
  if (!res.ok) {
    throw new Error(`figma snapshot request failed: ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  const normalized = normalize(body, undefined, undefined, opts);
  const variables = await fetchLocalVariables(fileKey, token, opts);
  return {
    fileKey,
    fileName: body.name ?? null,
    versionId: effectiveVersionId ?? "unpinned",
    versionCreatedAt: body.version ? body.lastModified ?? null : null,
    capturedAt: new Date(Date.now()).toISOString(),
    schemaVersion: SCHEMA_VERSION,
    document: normalized,
    ...(variables ? { variables } : {}),
  };
}

async function cmdSnapshot(fileKey, outPath, versionId, opts = {}) {
  const token = requireToken();
  let snapshot;
  try {
    snapshot = await buildSnapshot(fileKey, token, versionId, opts);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  console.log(`wrote ${outPath} (${snapshot.fileName ?? "unknown"} @ version ${snapshot.versionId})`);
}

// --- delta -------------------------------------------------------------------

// Walks the actual node tree (snapshot.document.document — see the header
// comment's "Snapshot shape note") collecting every node whose `type` is in
// `types` into `out`, keyed by name. Recurses through `children` regardless
// of node type, so COMPONENT nodes nested inside COMPONENT_SET nodes (variant
// matrices) are reached, not just top-level components.
function collectNodesByType(node, types, out, path = []) {
  if (!node || typeof node !== "object") return;
  if (types.has(node.type) && node.name) {
    out.set(node.name, { path: [...path, node.name], node });
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) collectNodesByType(child, types, out, [...path, node.name ?? ""]);
  }
}

// Variant names are prop equations, not labels: "device=desktop, height=medium"
// -> {device: "desktop", height: "medium"}. Malformed segments (no `=`) are
// dropped rather than throwing, since a stray/legacy variant name shouldn't
// crash the whole delta.
function parseVariantName(name) {
  const props = {};
  for (const part of String(name ?? "").split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key) props[key] = val;
  }
  return props;
}

function formatVariantProps(props) {
  const entries = Object.entries(props);
  if (!entries.length) return null;
  return entries.map(([k, v]) => `${k}=${v}`).join(", ");
}

function diffMaps(oldMap, newMap, label, lines) {
  const added = [];
  const removed = [];
  for (const name of newMap.keys()) if (!oldMap.has(name)) added.push(name);
  for (const name of oldMap.keys()) if (!newMap.has(name)) removed.push(name);
  if (added.length || removed.length) {
    lines.push(`${label}:`);
    for (const name of added.sort()) lines.push(`  + added: ${name}`);
    for (const name of removed.sort()) lines.push(`  - removed: ${name}`);
  }
}

// Keys changes by variable + MODE, per the skill's mode-vector model ("Mode
// pins are per collection — the context is a vector, not a scalar"). Never
// collapses a whole valuesByMode blob into one opaque change line — each
// (variable, mode) pair that actually changed gets its own line.
function diffVariables(oldSnap, newSnap, lines) {
  const oldEmbedded = oldSnap?.variables?.meta?.variables ?? oldSnap?.variables?.variables;
  const newEmbedded = newSnap?.variables?.meta?.variables ?? newSnap?.variables?.variables;
  const oldDoc = oldSnap?.document;
  const newDoc = newSnap?.document;
  const oldVars = oldEmbedded ?? oldDoc?.variables ?? oldDoc?.meta?.variables ?? {};
  const newVars = newEmbedded ?? newDoc?.variables ?? newDoc?.meta?.variables ?? {};
  const oldByName = new Map(Object.values(oldVars).map((v) => [v.name, v]));
  const newByName = new Map(Object.values(newVars).map((v) => [v.name, v]));
  const changes = [];
  for (const [name, nv] of newByName) {
    const ov = oldByName.get(name);
    if (!ov) continue;
    const oldModes = ov.valuesByMode;
    const newModes = nv.valuesByMode;
    if (oldModes && newModes) {
      const modeKeys = new Set([...Object.keys(oldModes), ...Object.keys(newModes)]);
      for (const mode of modeKeys) {
        const oldVal = JSON.stringify(oldModes[mode]);
        const newVal = JSON.stringify(newModes[mode]);
        if (oldVal !== newVal) changes.push(`  ~ ${name} [mode: ${mode}]: ${oldVal} -> ${newVal}`);
      }
    } else {
      const oldVal = JSON.stringify(ov.value);
      const newVal = JSON.stringify(nv.value);
      if (oldVal !== newVal) changes.push(`  ~ ${name}: ${oldVal} -> ${newVal}`);
    }
  }
  if (changes.length) {
    lines.push("variables:");
    lines.push(...changes.sort());
  }
}

function fileIdentityHeader(snap) {
  const name = snap?.fileName ?? "unknown";
  const key = snap?.fileKey ?? "?";
  return `${name} (${key}) @ ${snap?.versionId ?? "?"}`;
}

function cmdDelta(oldPath, newPath) {
  const oldSnap = JSON.parse(readFileSync(oldPath, "utf8"));
  const newSnap = JSON.parse(readFileSync(newPath, "utf8"));

  // The actual node tree lives at snapshot.document.document — see the
  // header comment's "Snapshot shape note". snapshot.document itself is the
  // whole normalized REST response wrapper (components/componentSets/styles
  // maps, plus `document`, the real tree), not the tree itself.
  const oldRoot = oldSnap.document?.document;
  const newRoot = newSnap.document?.document;

  const oldComponents = new Map();
  const newComponents = new Map();
  collectNodesByType(oldRoot, new Set(["COMPONENT"]), oldComponents);
  collectNodesByType(newRoot, new Set(["COMPONENT"]), newComponents);

  const oldComponentSets = new Map();
  const newComponentSets = new Map();
  collectNodesByType(oldRoot, new Set(["COMPONENT_SET"]), oldComponentSets);
  collectNodesByType(newRoot, new Set(["COMPONENT_SET"]), newComponentSets);

  const lines = [];
  lines.push(`${fileIdentityHeader(oldSnap)} -> ${fileIdentityHeader(newSnap)}`);

  diffMaps(oldComponents, newComponents, "components", lines);
  diffMaps(oldComponentSets, newComponentSets, "componentSets", lines);

  const oldStyles = new Map(Object.entries(oldSnap.document?.styles ?? {}).map(([, s]) => [s.name, s]));
  const newStyles = new Map(Object.entries(newSnap.document?.styles ?? {}).map(([, s]) => [s.name, s]));
  diffMaps(oldStyles, newStyles, "styles", lines);

  diffVariables(oldSnap, newSnap, lines);

  // Prop-schema diff: components present in both, compare componentPropertyDefinitions.
  for (const [name, { node: nn }] of newComponents) {
    const oldEntry = oldComponents.get(name);
    if (!oldEntry) continue;
    const oldProps = Object.keys(oldEntry.node.componentPropertyDefinitions ?? {});
    const newProps = Object.keys(nn.componentPropertyDefinitions ?? {});
    const addedProps = newProps.filter((v) => !oldProps.includes(v));
    if (addedProps.length) {
      lines.push(`component props (${name}):`);
      for (const v of addedProps.sort()) lines.push(`  + ${v}`);
    }
  }

  // Variant-instance diff: for component sets present in both snapshots,
  // parse each variant child's name as a prop equation and report added
  // prop-value combinations structurally, not as an opaque name string.
  for (const [setName, { node: newSet }] of newComponentSets) {
    const oldEntry = oldComponentSets.get(setName);
    const newVariantNames = (newSet.children ?? [])
      .filter((c) => c && c.type === "COMPONENT")
      .map((c) => c.name);
    const oldVariantNames = new Set(
      (oldEntry?.node.children ?? []).filter((c) => c && c.type === "COMPONENT").map((c) => c.name)
    );
    const added = newVariantNames.filter((n) => !oldVariantNames.has(n));
    if (added.length) {
      lines.push(`variants (${setName}):`);
      for (const variantName of added.sort()) {
        const props = formatVariantProps(parseVariantName(variantName));
        lines.push(`  + added: ${props ?? variantName}`);
      }
    }
  }

  if (lines.length === 1) {
    console.log(lines[0]);
    console.log("no structural differences detected");
    return;
  }
  console.log(lines.join("\n"));
}

// --- main --------------------------------------------------------------------

// Guard so this block only runs when figma-capture.mjs is invoked directly
// (its CLI, unchanged) — not when another script (capture-poll.mjs) imports
// buildSnapshot/figmaFetch/requireToken from it as a module.
const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
const [, , command, ...rest] = process.argv;

if (command === "versions") {
  const [fileKey] = rest;
  if (!fileKey) { console.error("usage: figma-capture.mjs versions <fileKey>"); process.exit(1); }
  await cmdVersions(fileKey);
} else if (command === "snapshot") {
  const [fileKey, outPath] = rest;
  const versionFlagIdx = rest.indexOf("--version");
  const versionId = versionFlagIdx >= 0 ? rest[versionFlagIdx + 1] : undefined;
  const noGeometry = rest.includes("--no-geometry");
  if (!fileKey || !outPath) { console.error("usage: figma-capture.mjs snapshot <fileKey> <outPath> [--version <id>] [--no-geometry]"); process.exit(1); }
  await cmdSnapshot(fileKey, outPath, versionId, { noGeometry });
} else if (command === "delta") {
  const [oldPath, newPath] = rest;
  if (!oldPath || !newPath) { console.error("usage: figma-capture.mjs delta <oldPath> <newPath>"); process.exit(1); }
  cmdDelta(oldPath, newPath);
} else {
  console.error("usage: figma-capture.mjs <versions|snapshot|delta> ...");
  process.exit(1);
}
}
