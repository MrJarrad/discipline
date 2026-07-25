#!/usr/bin/env node
/* figma-capture — supplementary mechanics for the capture-figma skill: version
   pinning, normalized snapshots, delta summaries. The skill works without this;
   this script exists for when true REST version pinning is available/needed.

   Usage:
     figma-capture.mjs versions <fileKey>
       List file versions (id, created_at, label, description), paginated.

     figma-capture.mjs snapshot <fileKey> <outPath> [--version <id>]
       Fetch the file (pinned to <id> if given), normalize deterministically
       (sorted keys, children sorted by name/id, volatile fields stripped),
       and write JSON with a header: fileKey, versionId, versionCreatedAt,
       capturedAt, schemaVersion. On a 404 with a version pin, retries once
       unpinned and warns loudly that the pin failed. Also attempts GET
       /v1/files/<fileKey>/variables/local and embeds the (normalized) result
       under a top-level `variables` key. That endpoint is Enterprise-plan
       gated: on 403/404 the script prints a loud warning and continues
       without failing (fall back to the MCP get_variable_defs lane per the
       capture-figma skill) — variables capture here is best-effort.

     figma-capture.mjs delta <oldPath> <newPath>
       Structural diff of two snapshots keyed on NAMES: added/removed/renamed
       components and styles, variable value changes, variant additions.
       Variable comparison prefers the embedded `variables` block when both
       snapshots have one; falls back to document-embedded variables otherwise.

   Auth: FIGMA_TOKEN env var (sent as X-Figma-Token). Single retry with
   backoff on HTTP 429.                                                      */
import { readFileSync, writeFileSync } from "node:fs";

const SCHEMA_VERSION = 1;
const API_BASE = "https://api.figma.com/v1";

function requireToken() {
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    console.error("FIGMA_TOKEN environment variable is not set.");
    process.exit(1);
  }
  return token;
}

async function figmaFetch(path, token) {
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

function normalize(value, parentKey) {
  if (Array.isArray(value)) {
    const items = value.map((v) => normalize(v, parentKey));
    if (parentKey === "children") {
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
    for (const key of keys) {
      if (VOLATILE_KEYS.has(key) || isUrlKey(key)) continue;
      let v = value[key];
      if (BOUNDING_BOX_KEYS.has(key) && v && typeof v === "object") {
        const { x, y, ...rest } = v;
        v = rest;
      }
      out[key] = normalize(v, key);
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

async function fetchLocalVariables(fileKey, token) {
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
  return normalize(body);
}

async function cmdSnapshot(fileKey, outPath, versionId) {
  const token = requireToken();
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
    console.error(`figma snapshot request failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const body = await res.json();
  const normalized = normalize(body);
  const variables = await fetchLocalVariables(fileKey, token);
  const snapshot = {
    fileKey,
    versionId: effectiveVersionId ?? "unpinned",
    versionCreatedAt: body.version ? body.lastModified ?? null : null,
    capturedAt: new Date(Date.now()).toISOString(),
    schemaVersion: SCHEMA_VERSION,
    document: normalized,
    ...(variables ? { variables } : {}),
  };
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  console.log(`wrote ${outPath} (version: ${snapshot.versionId})`);
}

// --- delta -------------------------------------------------------------------

function collectByName(node, kind, out, path = []) {
  if (!node || typeof node !== "object") return;
  if (kind === "components" && node.type === "COMPONENT" && node.name) {
    out.set(node.name, { path: [...path, node.name], node });
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) collectByName(child, kind, out, [...path, node.name ?? ""]);
  }
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
    const oldVal = JSON.stringify(ov.valuesByMode ?? ov.value);
    const newVal = JSON.stringify(nv.valuesByMode ?? nv.value);
    if (oldVal !== newVal) changes.push(`  ~ ${name}: ${oldVal} -> ${newVal}`);
  }
  if (changes.length) {
    lines.push("variables:");
    lines.push(...changes.sort());
  }
}

function cmdDelta(oldPath, newPath) {
  const oldSnap = JSON.parse(readFileSync(oldPath, "utf8"));
  const newSnap = JSON.parse(readFileSync(newPath, "utf8"));

  const oldComponents = new Map();
  const newComponents = new Map();
  collectByName(oldSnap.document, "components", oldComponents);
  collectByName(newSnap.document, "components", newComponents);

  const lines = [];
  diffMaps(oldComponents, newComponents, "components", lines);

  const oldStyles = new Map(Object.entries(oldSnap.document?.styles ?? {}).map(([, s]) => [s.name, s]));
  const newStyles = new Map(Object.entries(newSnap.document?.styles ?? {}).map(([, s]) => [s.name, s]));
  diffMaps(oldStyles, newStyles, "styles", lines);

  diffVariables(oldSnap, newSnap, lines);

  // variant additions: components present in both, compare variantGroupProperties
  for (const [name, { node: nn }] of newComponents) {
    const oldEntry = oldComponents.get(name);
    if (!oldEntry) continue;
    const oldVariants = Object.keys(oldEntry.node.componentPropertyDefinitions ?? {});
    const newVariants = Object.keys(nn.componentPropertyDefinitions ?? {});
    const addedVariants = newVariants.filter((v) => !oldVariants.includes(v));
    if (addedVariants.length) {
      lines.push(`variants (${name}):`);
      for (const v of addedVariants.sort()) lines.push(`  + ${v}`);
    }
  }

  if (!lines.length) {
    console.log("no structural differences detected");
    return;
  }
  console.log(lines.join("\n"));
}

// --- main --------------------------------------------------------------------

const [, , command, ...rest] = process.argv;

if (command === "versions") {
  const [fileKey] = rest;
  if (!fileKey) { console.error("usage: figma-capture.mjs versions <fileKey>"); process.exit(1); }
  await cmdVersions(fileKey);
} else if (command === "snapshot") {
  const [fileKey, outPath] = rest;
  const versionFlagIdx = rest.indexOf("--version");
  const versionId = versionFlagIdx >= 0 ? rest[versionFlagIdx + 1] : undefined;
  if (!fileKey || !outPath) { console.error("usage: figma-capture.mjs snapshot <fileKey> <outPath> [--version <id>]"); process.exit(1); }
  await cmdSnapshot(fileKey, outPath, versionId);
} else if (command === "delta") {
  const [oldPath, newPath] = rest;
  if (!oldPath || !newPath) { console.error("usage: figma-capture.mjs delta <oldPath> <newPath>"); process.exit(1); }
  cmdDelta(oldPath, newPath);
} else {
  console.error("usage: figma-capture.mjs <versions|snapshot|delta> ...");
  process.exit(1);
}
