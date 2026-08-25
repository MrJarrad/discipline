#!/usr/bin/env node
/* frames-sync — manual sync lane for the page-frame captures at
   ~/JHD/captures/frames/*.json (each one a whole FRAME's pruned node tree,
   captured via the REST /nodes lane — see figma-node.mjs — but outside the
   plugin's live-sync pipeline, so a Figma-side rename inside one of these
   frames never surfaces until someone re-runs this by hand).

   Usage:
     node frames-sync.mjs [--frame <name>]
       Re-fetches every frame listed in frames.json's manifest (or just the
       one named by --frame), diffs each against its previous on-disk
       capture, and reports what moved. Manual invocation only — no watcher,
       no cron — per the operator's sync-is-manual ruling.

   Reuses fetchNode/pruneNode (figma-node.mjs) for the REST fetch + geometry
   pruning, and writeAtomic/stableStringify (capture-listener.mjs) for the
   write + hash-compare, rather than duplicating either.

   Interface (deep module — small surface, the tree-walk/diff/conformance
   logic is all implementation):
     diffFrameTree(oldRoot, newRoot) -> { framesRenamed, framesAdded, framesRemoved }
     syncFrame({ frame, token, framesDir, liveDir, fetchImpl, conformanceMapPath })
       -> { unchanged, changed?, receipt }

   ID-FIRST DIFF: unlike variables/styles/components (whose `id` is OPTIONAL,
   with a name-only fallback — see capture-listener.mjs's header comment),
   every Figma node always carries an `id`, so tree nodes are correlated by
   id alone. A matched id with a changed `name` is a rename
   (`framesRenamed`); an id with no counterpart on the other side is
   reported by name alone, since there's nothing to pair it with —
   `framesAdded`/`framesRemoved` (the "name fallback" is in how an
   unpaired node is *identified*, not a second correlation pass).

   OUTPUT ENVELOPE: one record per changed sync is appended to
   ~/JHD/captures/live/changes.jsonl in the same shape capture-listener.mjs
   writes ({ ts, fileName, fileKey, changed, counts, summary }), tagged
   `lane: "frames"` so a reader can tell frame-sync records apart from
   variables/styles records; `fileName` carries the frame's manifest `name`
   (human-name-first, same convention as capture-listener's artifact path).
   A receipt line (`{ ts, fileName, fileKey, lane: "frames", unchanged? }`)
   always goes to receipts.jsonl, changed or not.

   NAMES CONFORMANCE LANE (opt-in via CONFORMANCE_MAP_PATH, same env var
   capture-listener.mjs's hook reads): every INSTANCE/COMPONENT node name in
   the freshly-fetched tree is checked against the figma-map.json vocabulary
   (components.entries[].component + components.unmappable[].component) and
   the kebab-cased filenames under <repo>/src/components/ (repo = the
   mapping file's grandparent dir, same convention as conformance-check.mjs/
   binding-check.mjs). No match on either -> `frame_name_unmapped`. Any
   INSTANCE/COMPONENT node caught by the rename diff above is additionally
   flagged `frame_component_renamed` (a Figma-side rename the map may now be
   stale against). Never fails the sync — a broken mapping/capture just logs
   and skips the append, matching capture-listener.mjs's try/catch. */
import { readFileSync, existsSync, readdirSync, appendFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fetchNode } from "./figma-node.mjs";
import { requireToken } from "./figma-capture.mjs";
import { writeAtomic, stableStringify } from "./capture-listener.mjs";

const DEFAULT_FRAMES_DIR = join(homedir(), "JHD", "captures", "frames");
const DEFAULT_LIVE_DIR = join(homedir(), "JHD", "captures", "live");

// ---- id-first tree diff ----------------------------------------------------

function indexTreeById(root) {
  const byId = new Map(); // node.id -> { id, name, type }
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.id) byId.set(node.id, { id: node.id, name: node.name, type: node.type });
    for (const child of node.children || []) walk(child);
  }
  walk(root);
  return byId;
}

export function diffFrameTree(oldRoot, newRoot) {
  const oldById = indexTreeById(oldRoot);
  const newById = indexTreeById(newRoot);

  const framesRenamed = [];
  const framesAdded = [];
  const framesRemoved = [];

  for (const [id, newEntry] of newById) {
    const oldEntry = oldById.get(id);
    if (!oldEntry) {
      framesAdded.push({ id, name: newEntry.name, type: newEntry.type });
      continue;
    }
    if (oldEntry.name !== newEntry.name) {
      framesRenamed.push({ id, oldName: oldEntry.name, newName: newEntry.name, type: newEntry.type });
    }
  }
  for (const [id, oldEntry] of oldById) {
    if (!newById.has(id)) framesRemoved.push({ id, name: oldEntry.name, type: oldEntry.type });
  }

  return { framesRenamed, framesAdded, framesRemoved };
}

// ---- sync one frame ---------------------------------------------------

function loadJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function treeHash(entry) {
  return createHash("sha256").update(stableStringify(entry)).digest("hex");
}

// frame: { name, fileKey, nodeId } (one entry from frames.json's manifest).
// Returns { unchanged, changed?, receipt }. Never throws on a conformance
// failure — see the try/catch below, mirroring capture-listener.mjs's own
// opt-in-hook discipline.
export async function syncFrame({
  frame,
  token,
  framesDir = DEFAULT_FRAMES_DIR,
  liveDir = DEFAULT_LIVE_DIR,
  fetchImpl,
  sleepImpl,
  conformanceMapPath = process.env.CONFORMANCE_MAP_PATH,
}) {
  mkdirSync(framesDir, { recursive: true });
  mkdirSync(liveDir, { recursive: true });

  const framePath = join(framesDir, `${frame.name}.json`);
  const changesPath = join(liveDir, "changes.jsonl");
  const receiptsPath = join(liveDir, "receipts.jsonl");
  const conformancePath = join(liveDir, "conformance.jsonl");

  const oldEntry = loadJsonIfExists(framePath);
  const newEntry = await fetchNode(frame.fileKey, frame.nodeId, token, { fetchImpl, sleepImpl });

  const unchanged = oldEntry !== null && treeHash(oldEntry) === treeHash(newEntry);

  let changeRecord = null;
  if (!unchanged) {
    writeAtomic(framePath, JSON.stringify(newEntry, null, 2) + "\n");

    changeRecord = {
      ts: new Date().toISOString(),
      lane: "frames",
      fileName: frame.name,
      fileKey: frame.fileKey,
      nodeId: frame.nodeId,
    };
    if (oldEntry === null) {
      changeRecord.initial = true;
    } else {
      const { framesRenamed, framesAdded, framesRemoved } = diffFrameTree(oldEntry.document, newEntry.document);
      changeRecord.changed = { framesRenamed, framesAdded, framesRemoved };
      changeRecord.counts = {
        framesRenamed: framesRenamed.length,
        framesAdded: framesAdded.length,
        framesRemoved: framesRemoved.length,
      };
      changeRecord.summary = {
        added: framesAdded.length,
        removed: framesRemoved.length,
        renamed: framesRenamed.length,
      };
    }
    appendFileSync(changesPath, JSON.stringify(changeRecord) + "\n", "utf8");
  }

  const receipt = {
    ts: new Date().toISOString(),
    lane: "frames",
    fileName: frame.name,
    fileKey: frame.fileKey,
    nodeId: frame.nodeId,
    ...(unchanged ? { unchanged: true } : {}),
  };
  appendFileSync(receiptsPath, JSON.stringify(receipt) + "\n", "utf8");

  if (conformanceMapPath) {
    try {
      runFrameNamesConformance({
        frameName: frame.name,
        tree: newEntry.document,
        renamed: changeRecord?.changed?.framesRenamed || [],
        mappingPath: conformanceMapPath,
        conformancePath,
      });
    } catch (err) {
      console.error(`[frames-sync] conformance check failed: ${err.message}`);
    }
  }

  return { unchanged, changed: changeRecord?.changed, receipt };
}

// ---- names conformance lane --------------------------------------------

const NAMED_TYPES = new Set(["INSTANCE", "COMPONENT"]);

function collectNamedNodes(root) {
  const nodes = [];
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (NAMED_TYPES.has(node.type)) nodes.push({ id: node.id, name: node.name, type: node.type });
    for (const child of node.children || []) walk(child);
  }
  walk(root);
  return nodes;
}

// A vocabulary entry's `component` field is sometimes a comma-separated list
// with a trailing "(...)" qualifier per entry (see figma-map.json's
// `components.unmappable` — e.g. "GridMedia (has-header slot)") — split,
// strip the qualifier, and normalize case/leading-dot (private components)
// so it compares cleanly against a node's own name.
function normalizeComponentName(name) {
  return String(name)
    .replace(/\([^)]*\)/g, "")
    .trim()
    .replace(/^\.+/, "")
    .toLowerCase();
}

export function buildComponentVocabulary(mapping) {
  const vocab = new Set();
  const addAll = (field) => {
    for (const item of field || []) {
      for (const piece of String(item.component).split(",")) {
        const normalized = normalizeComponentName(piece);
        if (normalized) vocab.add(normalized);
      }
    }
  };
  addAll(mapping.components?.entries);
  addAll(mapping.components?.unmappable);
  return vocab;
}

// Figma component names are PascalCase (optionally "." prefixed for a
// private component) — insert a hyphen at each lower/digit -> upper
// boundary before lowercasing, so "HeroText" compares against the code
// convention's "hero-text.tsx" filename stem.
export function pascalToKebab(name) {
  return String(name)
    .replace(/^\.+/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

export function buildComponentFilenameSet(componentsDir) {
  const stems = new Set();
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".tsx")) {
        stems.add(entry.name.replace(/\.test\.tsx$|\.tsx$/, ""));
      }
    }
  }
  walk(componentsDir);
  return stems;
}

// Pure core of the names lane: given the already-fetched tree, the map's
// vocabulary, and the repo's component filenames, report every INSTANCE/
// COMPONENT node whose name resolves to neither.
export function checkFrameNames({ frameName, tree, vocabulary, componentFilenames }) {
  const defects = [];
  for (const node of collectNamedNodes(tree)) {
    const mapped = vocabulary.has(normalizeComponentName(node.name)) || componentFilenames.has(pascalToKebab(node.name));
    if (!mapped) {
      defects.push({ type: "frame_name_unmapped", frame: frameName, nodeId: node.id, name: node.name });
    }
  }
  return defects;
}

function runFrameNamesConformance({ frameName, tree, renamed, mappingPath, conformancePath }) {
  const mapping = JSON.parse(readFileSync(mappingPath, "utf8"));
  const repoRoot = dirname(dirname(resolve(mappingPath)));
  const vocabulary = buildComponentVocabulary(mapping);
  const componentFilenames = buildComponentFilenameSet(join(repoRoot, "src", "components"));

  const defects = checkFrameNames({ frameName, tree, vocabulary, componentFilenames });

  for (const r of renamed) {
    if (NAMED_TYPES.has(r.type)) {
      defects.push({ type: "frame_component_renamed", frame: frameName, nodeId: r.id, oldName: r.oldName, newName: r.newName });
    }
  }

  if (defects.length === 0) return;
  const ts = new Date().toISOString();
  const lines = defects.map((d) => JSON.stringify({ ts, ...d })).join("\n") + "\n";
  appendFileSync(conformancePath, lines, "utf8");
}

// ---- CLI --------------------------------------------------------------

export function loadManifest(framesDir) {
  const manifestPath = join(framesDir, "frames.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return manifest.frames || [];
}

async function main(argv) {
  const frameFilterIdx = argv.indexOf("--frame");
  const frameFilter = frameFilterIdx === -1 ? null : argv[frameFilterIdx + 1];

  const framesDir = DEFAULT_FRAMES_DIR;
  const liveDir = DEFAULT_LIVE_DIR;
  const frames = loadManifest(framesDir).filter((f) => !frameFilter || f.name === frameFilter);

  if (frames.length === 0) {
    console.error(frameFilter ? `no frame named "${frameFilter}" in frames.json` : "frames.json has no frames");
    process.exit(1);
  }

  const token = requireToken();
  let hadError = false;

  for (const frame of frames) {
    try {
      const result = await syncFrame({ frame, token, framesDir, liveDir });
      if (result.unchanged) {
        console.log(`[frames-sync] ${frame.name}: unchanged`);
      } else if (result.changed) {
        const { framesRenamed, framesAdded, framesRemoved } = result.changed;
        console.log(
          `[frames-sync] ${frame.name}: ${framesRenamed.length} renamed, ${framesAdded.length} added, ${framesRemoved.length} removed`
        );
      } else {
        console.log(`[frames-sync] ${frame.name}: initial capture written`);
      }
    } catch (err) {
      hadError = true;
      console.error(`[frames-sync] ${frame.name}: ${err.message}`);
    }
  }

  if (hadError) process.exit(1);
}

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  await main(process.argv.slice(2));
}
