#!/usr/bin/env node
/* capture-poll — REST version polling for a Figma file. Complements the
   plugin's live sync (which reacts to in-editor document changes) with an
   out-of-editor watcher: it polls the Versions REST endpoint, and whenever a
   new version appears, snapshots the file pinned to that version and diffs
   it against the previous snapshot.

   Usage:
     node capture-poll.mjs <fileKey> [--interval 300] [--once]

   Behavior:
     - Requires FIGMA_TOKEN (same as figma-capture.mjs).
     - Keeps last-seen version id in ~/JHD/captures/.poll-state.json, keyed
       by fileKey, so re-running doesn't re-snapshot a version already seen.
     - On a new version: writes
         ~/JHD/captures/<file-name-kebab>-snapshot-<versionId>.json
       (reusing figma-capture.mjs's buildSnapshot() directly — imported, not
       spawned — per that file's exported snapshot function) then, if a
       previous snapshot exists, runs the same delta logic and writes
         ~/JHD/captures/<file-name-kebab>-delta-<oldVersionId>-<versionId>.txt
       next to it.
     - Named versions (a `label` on the version) are logged prominently —
       they're the operator's deliberate stopping-point signal, distinct
       from Figma's continuous autosave versions.
     - Single retry on HTTP 429 (matches figma-capture.mjs's figmaFetch).
     - --once runs a single poll cycle and exits (for cron). Without --once,
       loops on --interval seconds (default 300) until SIGINT, which exits
       cleanly.                                                            */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { figmaFetch, requireToken, buildSnapshot } from "./figma-capture.mjs";

const CAPTURES_DIR = join(homedir(), "JHD", "captures");
const STATE_PATH = join(CAPTURES_DIR, ".poll-state.json");

mkdirSync(CAPTURES_DIR, { recursive: true });

function kebab(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

function loadState() {
  if (!existsSync(STATE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function fetchLatestVersion(fileKey, token) {
  const res = await figmaFetch(`/files/${fileKey}/versions`, token);
  if (!res.ok) {
    throw new Error(`versions request failed: ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  const versions = body.versions ?? [];
  return versions[0] ?? null; // most recent first, per Figma's Versions API ordering
}

// Structural diff, factored out of figma-capture.mjs's cmdDelta so
// capture-poll can produce the same delta shape without spawning a child
// process. Kept intentionally small: reuses the same document-tree shape
// (`snapshot.document.document`) documented in figma-capture.mjs's header.
function collectNodesByType(node, types, out) {
  if (!node || typeof node !== "object") return;
  if (types.has(node.type) && node.name) out.set(node.name, node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) collectNodesByType(child, types, out);
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

function buildDelta(oldSnap, newSnap) {
  const oldRoot = oldSnap.document?.document;
  const newRoot = newSnap.document?.document;
  const oldComponents = new Map();
  const newComponents = new Map();
  collectNodesByType(oldRoot, new Set(["COMPONENT"]), oldComponents);
  collectNodesByType(newRoot, new Set(["COMPONENT"]), newComponents);

  const lines = [];
  lines.push(
    `${oldSnap.fileName ?? "unknown"} (${oldSnap.fileKey}) @ ${oldSnap.versionId} -> ${newSnap.fileName ?? "unknown"} (${newSnap.fileKey}) @ ${newSnap.versionId}`
  );
  diffMaps(oldComponents, newComponents, "components", lines);

  const oldStyles = new Map(
    Object.entries(oldSnap.document?.styles ?? {}).map(([, s]) => [s.name, s])
  );
  const newStyles = new Map(
    Object.entries(newSnap.document?.styles ?? {}).map(([, s]) => [s.name, s])
  );
  diffMaps(oldStyles, newStyles, "styles", lines);

  if (lines.length === 1) lines.push("no structural differences detected");
  return lines.join("\n");
}

async function pollOnce(fileKey, token) {
  const state = loadState();
  const prev = state[fileKey] ?? null;

  const latest = await fetchLatestVersion(fileKey, token);
  if (!latest) {
    console.log(`[capture-poll] no versions returned for ${fileKey}`);
    return;
  }

  if (prev && prev.versionId === latest.id) {
    console.log(`[capture-poll] no new version for ${fileKey} (still ${latest.id})`);
    return;
  }

  if (latest.label) {
    console.log(`[capture-poll] NAMED VERSION: "${latest.label}" (${latest.id}) — operator stopping-point signal`);
  } else {
    console.log(`[capture-poll] new version ${latest.id} for ${fileKey}`);
  }

  const snapshot = await buildSnapshot(fileKey, token, latest.id);
  const fileSlug = kebab(snapshot.fileName ?? fileKey);
  const snapshotPath = join(CAPTURES_DIR, `${fileSlug}-snapshot-${latest.id}.json`);
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  console.log(`[capture-poll] wrote ${snapshotPath}`);

  if (prev && existsSync(prev.snapshotPath)) {
    const prevSnapshot = JSON.parse(readFileSync(prev.snapshotPath, "utf8"));
    const delta = buildDelta(prevSnapshot, snapshot);
    const deltaPath = join(CAPTURES_DIR, `${fileSlug}-delta-${prev.versionId}-${latest.id}.txt`);
    writeFileSync(deltaPath, delta + "\n", "utf8");
    console.log(`[capture-poll] wrote ${deltaPath}`);
  }

  state[fileKey] = { versionId: latest.id, snapshotPath, polledAt: new Date().toISOString() };
  saveState(state);
}

async function main() {
  const [, , fileKey, ...rest] = process.argv;
  if (!fileKey) {
    console.error("usage: capture-poll.mjs <fileKey> [--interval 300] [--once]");
    process.exit(1);
  }
  const once = rest.includes("--once");
  const intervalIdx = rest.indexOf("--interval");
  const intervalSec = intervalIdx >= 0 ? Number(rest[intervalIdx + 1]) : 300;

  const token = requireToken();

  let stopped = false;
  process.on("SIGINT", () => {
    console.log("\n[capture-poll] stopping");
    stopped = true;
    process.exit(0);
  });

  do {
    try {
      await pollOnce(fileKey, token);
    } catch (err) {
      console.error(`[capture-poll] error: ${err.message}`);
    }
    if (!once && !stopped) {
      await new Promise((r) => setTimeout(r, intervalSec * 1000));
    }
  } while (!once && !stopped);
}

await main();
