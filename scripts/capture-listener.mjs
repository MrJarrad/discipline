#!/usr/bin/env node
/* capture-listener — local HTTP receiver for the capture-figma plugin's live
   sync mode. Single-file, no deps, style-matched to figma-capture.mjs.

   The plugin (figma-plugin/capture-figma/) POSTs its full variables+styles
   export JSON here on every debounced document change while sync is on.
   This script never talks to Figma or the network — it only accepts
   localhost connections and writes what it's given.

   Usage:
     node capture-listener.mjs &
     CAPTURE_LISTENER_PORT=5000 node capture-listener.mjs   (override port)

   Endpoints:
     POST /capture   body = the plugin's export JSON (header.fileName,
                      header.pluginVersion, header.exportedAt, header.counts
                      required — same shape code.js's buildExport() produces;
                      header.fileKey optional — figma.fileKey, absent in some
                      plugin-execution contexts, e.g. a file never saved to
                      the cloud).
                      Writes atomically (temp file + rename) to
                      ~/JHD/captures/live/<file-name-kebab>--<fileKey>-variables-styles.json
                      when header.fileKey is present (fileKey preferred for
                      routing/dedup — filename alone can collide across
                      files, or drift if a file is renamed between syncs —
                      but the filename stays first in the path per the
                      human-name-first identity ruling, so listing the
                      directory still reads as file names, not opaque keys),
                      or ~/JHD/captures/live/<file-name-kebab>-variables-styles.json
                      when header.fileKey is absent (stable path — always
                      overwritten, the diffable artifact) and appends one
                      receipt line to ~/JHD/captures/live/receipts.jsonl:
                        { ts, fileName, fileKey, counts }
     GET  /health     -> 200 "ok"
     GET  /changes    -> 200, JSON array of the last 10 changes.jsonl records
                      (newest first); ?n= overrides the count, up to 50.
                      Empty array when changes.jsonl doesn't exist yet.
     GET  /warnings   -> 200, JSON array — the most recently synced capture's
                      warnings[] (v2's structural-warning bucket, see SCHEMA
                      V2 below). [] before any capture, or when the latest
                      capture was v1.

     GET  /todos      -> 200 {"items":[{"id":string,"text":string}]} — the
                      pending todo queue, read from
                      ~/JHD/captures/live/todo-queue.json (empty items[] when
                      the file is missing or corrupt). This is the operator's
                      in-Figma todo plugin's pull channel.
     POST /todos      body = {"items":[{"text":string,"id"?:string}]} —
                      pipeline producers (conformance lanes, later; manual
                      curl for now) enqueue items here. Deduped by text
                      against the current queue; an omitted id is generated
                      (crypto.randomUUID). Writes atomically. Responds with
                      the updated queue.
     POST /todos/ack  body = {"ids":[string], "done"?:[string]} — the plugin
                      acks items it pulled; matching ids are removed from the
                      queue (atomic write). An optional `done` list appends
                      one receipts.jsonl record ({ ts, lane: "todos", ids,
                      done }) as a seam for future two-way sync — it never
                      gates the removal. Responds with the updated queue.
     POST /todos/push body = {"items":[{"id":string,"text":string,
                      "status":string}]} — the operator's todo plugin's
                      OUTBOUND mirror: its full current list, pushed wholesale
                      on every change (not the pipeline's inbound queue above
                      — a separate file, separate direction). Persisted
                      atomically to ~/JHD/captures/live/todo-state.json,
                      replacing the prior state entirely. `status` is one of
                      the plugin's five (todo/inprogress/blocked/done/wontdo)
                      but trusted as-is, unvalidated — the listener mirrors
                      the plugin's state machine, it doesn't own it. `text` is
                      markdown-capable and stored verbatim. Appends one
                      receipts.jsonl record ({ ts, lane: "todos", action:
                      "push", count }). Responds with the persisted state.

   Dedup + change log: every POST is hashed (sha256 of a stable-key-sorted
   stringify of the body, excluding header.exportedAt so identical file
   state hashes identical regardless of when it was exported). The hash and
   a copy of the full previous export are kept in a per-file sidecar under
   <CAPTURES_DIR>/.state/. A POST whose hash matches the stored hash is a
   no-op sync (nothing changed since last time): the artifact file is not
   rewritten, and the receipt line gets `unchanged: true`. A POST whose hash
   differs is diffed against the sidecar's previous export — variables

   CONFORMANCE RE-CHECK INVALIDATION: an unchanged document does NOT always
   mean the design<->code conformance/binding lanes can skip re-running. The
   sidecar also carries a `checkFingerprint` ({ docHash, checkerHash,
   mapHash, processStartedAt } — see this file's checkFingerprint/
   fingerprintsMatch) alongside the document hash; the checks re-run
   whenever ANY of the four differ from the cached fingerprint, not just
   docHash: the checker source (conformance-check.mjs + binding-check.mjs,
   content-hashed fresh per request), the mapping file (CONFORMANCE_MAP_PATH,
   also content-hashed fresh per request — it's already read live, never
   cached), or the listener process itself (PROCESS_STARTED_AT, fixed at
   module load — a restart is the only way a checker-source edit actually
   takes effect, since Node's ESM cache never reloads a changed file without
   one; releaseops kickstarts the com.jhd.capture-listener launchd service
   after every release, so a restart reliably follows a checker deploy). An
   unchanged document whose fingerprint is stale still skips rewriting the
   artifact/changes.jsonl (nothing about the FILE changed), but the
   conformance/binding lanes run anyway and the sidecar's fingerprint is
   refreshed so the next truly-unchanged sync can skip again.
   (keyed by collection/name, compared per mode, added/removed), styles
   (keyed by type/name, compared per property, added/removed), and components
   (keyed by name within standalone/sets, added/removed; for sets: per-prop
   defaultValue changes, per-VARIANT-prop option added/removed, prop
   added/removed — OPTIONAL, only diffed when both sides carry
   body.components) — and one record is appended to
   ~/JHD/captures/live/changes.jsonl:
     { ts, fileName, fileKey, changed: { variables, variablesAdded,
       variablesRemoved, variablesRenamed, aliasRepoints, styles,
       stylesRenamed, components, componentsAdded, componentsRemoved,
       componentsRenamed, layerBindings }, counts, summary: { added, modified,
       removed, renamed, repointed, layerBindings } }

   RENAME DETECTION: variables/styles/components each carry an OPTIONAL
   stable id (variables/styles: `id`; components: the existing `key` field —
   see the brief's OUTPUT JSON SHAPE). When both the old and new export carry
   an id for an entry, entries are correlated by id FIRST — same id +
   different name is a `renamed` record ({ bucket, id, oldName, newName }) in
   the matching *Renamed array, never a removed+added pair. Name-only diffing
   is the fallback whenever an id is missing on either side (older exports
   from plugins that predate this field) — ids are never required.

   ALIAS REPOINTS: a per-mode variable value change is classified before it
   lands in `variables` (the generic modified list) or `aliasRepoints` (the
   alias-specific one): old-alias -> new-alias with a different target is
   `alias_repointed` ({ path, mode, aliasFrom, aliasTo, type }); alias ->
   raw is `binding_broken`; raw -> alias is `binding_added`. Only a plain
   value-to-value change (neither side an alias, or an unchanged alias
   target) stays in `variables`.
   LAYER BINDINGS: component SETS may OPTIONALLY carry per-variant layer
   bindings (variants[].bindings — component-internals chain data, see the
   brief). For sets correlated between the two exports (key-then-name, same
   as the outer set correlation), each matched variant's bindings are diffed
   by `layer`+`property`: alias->alias (different target) is
   `layer_binding_repointed`, alias->raw is `layer_binding_broken`, raw->alias
   or an entry appearing only on the new side is `layer_binding_added`, an
   entry appearing only on the old side is `layer_binding_removed`, and a
   plain raw->raw value change on an otherwise-unchanged layer path (e.g. an
   instance-size property edit) is `layer_binding_changed` — this last one
   used to be silently skipped, which is why a spec's instance-size drift
   could go unreported for a full sync cycle. Records land in
   `changed.layerBindings` as { set, variant, layer, property, from, to, type }.

   `summary` totals the per-bucket added/modified/removed arrays into one
   cross-bucket count (styles has no separate added/removed array, so it
   only contributes to `modified` — see diffStyles' header comment).
   The first-ever sync for a file (no sidecar yet) logs { initial: true }
   with no diff (and no `summary`), since there's nothing to compare against.

   SCHEMA V2: header.schemaVersion=2 (OPTIONAL — absence means v1) marks a
   richer DS-documentation payload with five additive top-level buckets, all
   OPTIONAL and validated loosely (array shape only):
     componentSets[]        { key?, name, description } — a set's own
                             description, separate from body.components.sets'
                             structural (variant/property) data.
     exampleStructure[]     { name, frames: [{ id?, name }] } — sectioned
                             Example frames (M-/D- section pairing).
     templateFrames[]       { id?, name, instances: [{ id?, name, component,
                             variantProps: {axis:value}, properties:
                             {name:value}, overrides: [{id?, property,
                             value}] }] } — resolved instance state of the
                             layout's Example frames (per the vault ruling:
                             "resolved instance state ... IS the spec").
     latentCapabilities[]   { id?, name, visible, binding } — capability-
                             present-unused booleans and what they're bound to.
     warnings[]              { type, nodeId, nodeName, context, message } —
                             typed structural-lint records the plugin
                             surfaces about its own capture (malformed
                             spacer names, duplicate sibling names, axis-
                             ownership violations, etc.) — see GET /warnings
                             below. Validated loosely (array shape only,
                             same as every other v2 bucket); a consumer
                             keying off `.type` should not assume every
                             record populates every field.
   Every changes.jsonl record (initial or diffed) carries `schemaVersion`
   (default 1) and `warningCount` (warnings.length, default 0) regardless of
   which schema produced it.
   On a diffed sync, all five buckets are diffed the same id-first/name-
   fallback way as every other bucket, landing in changeRecord.changed:
     componentSets   -> component_description_changed
     examples         -> example_section_added/removed,
                         example_frame_added/removed/renamed
     templateFrames   -> template_frame_added/removed,
                         template_instance_added/removed,
                         template_variant_changed (axis-ownership filtered —
                         see AXIS_OWNERSHIP_DEFAULT_BLOCK_OWNED_AXIS below),
                         template_properties_changed,
                         template_overrides_changed (per-instance, id-first)
     capabilities     -> capability_added/removed/visibility_changed/
                         binding_changed
   v1 payloads (no schemaVersion, none of the five buckets) diff to empty
   arrays in all five — no behavior change from the pre-v2 listener.

   Bind: 127.0.0.1 only, never 0.0.0.0 — this is a localhost-only bridge, no
   auth needed because nothing outside the machine can reach it. Bodies over
   ~50MB or non-JSON bodies are rejected with 4xx and never written.        */
import { createServer } from "node:http";
import {
  mkdirSync,
  renameSync,
  appendFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { runConformanceCheck } from "./conformance-check.mjs";
import { runBindingCheck } from "./binding-check.mjs";

const PORT = Number(process.env.CAPTURE_LISTENER_PORT || 4411);
const MAX_BODY_BYTES = 50 * 1024 * 1024; // ~50MB
// CAPTURES_DIR is overridable (test isolation only — production always uses
// the default) so tests can point the listener at a scratch directory
// instead of the real ~/JHD/captures/live artifacts.
const CAPTURES_DIR = process.env.CAPTURES_DIR ? resolve(process.env.CAPTURES_DIR) : join(homedir(), "JHD", "captures", "live");
const RECEIPTS_PATH = join(CAPTURES_DIR, "receipts.jsonl");
const CHANGES_PATH = join(CAPTURES_DIR, "changes.jsonl");
const CONFORMANCE_PATH = join(CAPTURES_DIR, "conformance.jsonl");
const STATE_DIR = join(CAPTURES_DIR, ".state");
const TODO_QUEUE_PATH = join(CAPTURES_DIR, "todo-queue.json");
const TODO_STATE_PATH = join(CAPTURES_DIR, "todo-state.json");
const WARNINGS_PATH = join(CAPTURES_DIR, "latest-warnings.json");

// Guards every side effect below (dir creation, the HTTP listen) so this
// module can be imported for its exported helpers (writeAtomic,
// stableStringify — reused by frames-sync.mjs) without starting a second
// server or touching disk. Direct invocation (`node capture-listener.mjs`,
// including the way capture-listener.test.mjs spawns it) is unaffected —
// same guard convention as figma-node.mjs/conformance-check.mjs.
const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  mkdirSync(CAPTURES_DIR, { recursive: true });
  mkdirSync(STATE_DIR, { recursive: true });
}

function kebab(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

// The export header shape code.js's buildExport() produces (see code.js's
// header comment for the full shape). We only require the fields this
// listener actually needs to file the artifact and write a receipt.
//
// header.exportedAt: the brief never specified a wire type, so we accept
// either shape a contract-compliant plugin might reasonably send — a number
// (our own plugin's Date.now()) or a string parseable by Date (an ISO-8601
// timestamp, which is what Figma's agent-built plugin sends). Only reject
// when it's neither.
function isValidExportedAt(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value !== "" && !Number.isNaN(Date.parse(value));
  return false;
}

function validateExportShape(body) {
  if (!body || typeof body !== "object") return "body is not a JSON object";
  const header = body.header;
  if (!header || typeof header !== "object") return "missing header";
  if (typeof header.fileName !== "string" || !header.fileName) return "missing header.fileName";
  if (typeof header.pluginVersion !== "string") return "missing header.pluginVersion";
  if (!isValidExportedAt(header.exportedAt)) return "missing or invalid header.exportedAt (must be a number or a parseable date string)";
  if (!header.counts || typeof header.counts !== "object") return "missing header.counts";
  // fileKey is optional (see header comment) — when present it must be a
  // non-empty string, but its absence is never a rejection.
  if (header.fileKey !== undefined && (typeof header.fileKey !== "string" || !header.fileKey)) {
    return "header.fileKey, when present, must be a non-empty string";
  }
  // components is OPTIONAL (older contract plugins never send it) — when
  // present, validate loosely: an object with standalone/sets arrays. We
  // never require specific fields inside each entry so a future exporter can
  // add fields without breaking validation.
  if (body.components !== undefined) {
    const c = body.components;
    if (!c || typeof c !== "object") return "components, when present, must be an object";
    if (c.standalone !== undefined && !Array.isArray(c.standalone)) return "components.standalone, when present, must be an array";
    if (c.sets !== undefined && !Array.isArray(c.sets)) return "components.sets, when present, must be an array";
  }
  // schemaVersion is OPTIONAL — its absence means v1 (the original
  // variables+styles+components contract). When present it must be a number;
  // no specific value is enforced here (future schema bumps shouldn't need a
  // listener change just to be accepted — the diff logic below is what
  // actually branches on the value 2).
  if (header.schemaVersion !== undefined && typeof header.schemaVersion !== "number") {
    return "header.schemaVersion, when present, must be a number";
  }
  // v2's additive top-level buckets are all OPTIONAL and validated loosely —
  // an array, no shape enforced on entries (same spirit as `components`
  // above: a future field a producer adds shouldn't break validation).
  for (const field of ["componentSets", "exampleStructure", "templateFrames", "latentCapabilities", "warnings"]) {
    if (body[field] !== undefined && !Array.isArray(body[field])) {
      return `${field}, when present, must be an array`;
    }
  }
  return null;
}

// Deterministic stringify: object keys sorted at every level, arrays kept in
// their given order (order is meaningful — it's the plugin's own collection/
// variable iteration order, which is stable sync-to-sync for the same file
// state). Used only to derive the dedup hash, never for the written artifact.
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

// Hash the full export excluding the header fields that describe the SYNC
// rather than the FILE, so two syncs of identical file state hash identical:
// exportedAt (when it was sent) and timings (the plugin's per-phase export
// cost, capture-figma's lag instrumentation — necessarily different every
// run, so leaving it in would make every sync read as a change).
function exportHash(fullExport) {
  const clone = JSON.parse(JSON.stringify(fullExport));
  if (clone.header) delete clone.header.exportedAt;
  if (clone.header) delete clone.header.timings;
  return createHash("sha256").update(stableStringify(clone)).digest("hex");
}

// Sidecar state key mirrors the artifact-path identity rule (fileKey
// preferred, filename-only fallback) so dedup/diff track the same file the
// artifact path tracks.
function stateKey(fileSlug, fileKey) {
  return fileKey ? `${fileSlug}--${fileKey}` : fileSlug;
}

function statePath(fileSlug, fileKey) {
  return join(STATE_DIR, `${stateKey(fileSlug, fileKey)}.json`);
}

function readState(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null; // corrupt/partial sidecar — treat as no prior state
  }
}

function jsonEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// RE-CHECK INVALIDATION — the conformance/binding lanes used to skip
// re-running whenever the document hash was unchanged, full stop. That's
// right for "the same document synced twice in a row" but wrong the moment
// the CHECKER code, the mapping file, or the listener process itself has
// moved on since the cached result — a checker bugfix landing and then an
// unchanged-document re-sync would keep showing the pre-fix defect count.
// Four independent things invalidate a cached check result; a match on ALL
// four is what "nothing changed" actually means:
//   - docHash            the export content hash (existing dedup hash)
//   - checkerHash         conformance-check.mjs + binding-check.mjs, content-
//                          hashed fresh on every request. Content hashing
//                          (not mtime) is used because it's a direct claim
//                          ("the bytes the checks would run are the same
//                          bytes as last time"), not an inference from a
//                          filesystem timestamp a touch/checkout could
//                          change without altering content.
//   - mapHash              CONFORMANCE_MAP_PATH's own file, same reasoning —
//                          already read fresh per request by runConformance
//                          Check/runBindingCheck, so a map edit takes effect
//                          without a listener restart and must invalidate
//                          the cache the same way.
//   - processStartedAt     fixed once at module load (see PROCESS_STARTED_AT
//                          below). A listener restart is the only way a
//                          checker-source edit actually takes effect (ESM
//                          imports are cached for the process lifetime), so
//                          this is the cheap, direct signal for "the code
//                          that's about to run may not be the code that ran
//                          last time" — belt-and-braces alongside checkerHash
//                          rather than a replacement for it, since it also
//                          catches a redeploy where a hash happens to
//                          collide (astronomically unlikely, but the check
//                          is nearly free) or any future checker input this
//                          fingerprint hasn't been extended to cover yet.
// The fingerprint is persisted in the sidecar next to the document hash, so
// it survives a listener restart on disk and is compared fresh on the very
// next request from a brand-new process (a fresh PROCESS_STARTED_AT).
const PROCESS_STARTED_AT = Date.now();
// CHECKER_SOURCE_PATHS is overridable (test isolation only — production
// always hashes the real sibling checkers) via a comma-separated env var, so
// a test can simulate "the checker source changed" by pointing at scratch
// files it controls, instead of mutating this repo's own conformance-check.mjs/
// binding-check.mjs mid-run — same override convention as CAPTURES_DIR above.
const CHECKER_SOURCE_PATHS = process.env.CHECKER_SOURCE_PATHS
  ? process.env.CHECKER_SOURCE_PATHS.split(",")
  : [join(import.meta.dirname, "conformance-check.mjs"), join(import.meta.dirname, "binding-check.mjs")];

function checkerSourceHash() {
  const h = createHash("sha256");
  for (const p of CHECKER_SOURCE_PATHS) {
    h.update(readFileSync(p));
  }
  return h.digest("hex");
}

function mapFileHash(mappingPath) {
  if (!mappingPath || !existsSync(mappingPath)) return null;
  return createHash("sha256").update(readFileSync(mappingPath)).digest("hex");
}

function checkFingerprint(docHash, mappingPath) {
  return {
    docHash,
    checkerHash: checkerSourceHash(),
    mapHash: mapFileHash(mappingPath),
    processStartedAt: PROCESS_STARTED_AT,
  };
}

function fingerprintsMatch(a, b) {
  return !!a && !!b && a.docHash === b.docHash && a.checkerHash === b.checkerHash && a.mapHash === b.mapHash && a.processStartedAt === b.processStartedAt;
}

// A v2 bucket (components, componentSets, exampleStructure, templateFrames,
// latentCapabilities) is OPTIONAL per sync — a producer simply not reporting
// it this time is not the same claim as "everything it used to hold is gone"
// (see the bothSidesDefined() call sites' comment). Only when BOTH the prior
// and current export actually carry the field does a diff mean anything.
function bothSidesDefined(oldValue, newValue) {
  return oldValue !== undefined && newValue !== undefined;
}

// An alias value is the "→ {collection}/{variable}" string form (see the
// brief's OUTPUT JSON SHAPE) — never resolved, so a raw string comparison
// against that arrow prefix is sufficient to tell alias from raw value.
function isAliasValue(v) {
  return typeof v === "string" && v.startsWith("→ ");
}

// Classifies one per-mode value change as an alias-specific flavor, or null
// when it's a generic (non-alias-involving) value change that belongs in the
// plain `variables` modified list. A mode added/removed (old or new value
// undefined) is never an alias flavor — there's no "from" or "to" binding to
// describe, just presence/absence.
function classifyModeChange(oldV, newV) {
  if (oldV === undefined || newV === undefined) return null;
  const oldAlias = isAliasValue(oldV);
  const newAlias = isAliasValue(newV);
  if (oldAlias && newAlias) return { type: "alias_repointed", aliasFrom: oldV, aliasTo: newV };
  if (oldAlias && !newAlias) return { type: "binding_broken", aliasFrom: oldV, raw: newV };
  if (!oldAlias && newAlias) return { type: "binding_added", aliasTo: newV, raw: oldV };
  return null;
}

// Variables are keyed by collection name + variable name; each variable's
// value is compared per mode (the mode-vector model — a variable's value is
// a map of mode name -> value, and modes can be added/removed/changed
// independently of the variable itself).
//
// RENAME DETECTION: when a variable carries a stable `id` (Figma's persistent
// id, OPTIONAL — see the brief) on both sides, entries are correlated by id
// FIRST. Same id + different path = a `renamed` record, not a removed+added
// pair. Id-matched entries are still diffed per-mode for value changes (under
// the new path). Name-only diffing (the original behaviour) is the fallback
// for entries without an id on both sides — ids are never required.
//
// ALIAS REPOINTS: a per-mode change where both the old and new value are
// alias strings ("→ target") but the target differs is an `alias_repointed`
// record, not a generic modified-value record — it's a structural rewire, not
// a value edit. A change from alias to raw (or raw to alias) is its own
// flavor (`binding_broken` / `binding_added`) — these three land in
// `aliasRepoints`, not in the generic `variables` list.
function diffVariables(oldCollections, newCollections) {
  const buildMaps = (collections) => {
    const byKey = new Map(); // "collection name" -> entry
    const byId = new Map(); // variable.id -> entry (only when id present)
    for (const col of collections || []) {
      for (const v of col.variables || []) {
        const entry = { path: `${col.name}/${v.name}`, collection: col.name, valuesByMode: v.valuesByMode || {} };
        byKey.set(`${col.name} ${v.name}`, entry);
        if (v.id) byId.set(v.id, entry);
      }
    }
    return { byKey, byId };
  };
  const oldM = buildMaps(oldCollections);
  const newM = buildMaps(newCollections);

  const variables = [];
  const variablesAdded = [];
  const variablesRemoved = [];
  const variablesRenamed = [];
  const aliasRepoints = [];

  const matchedOldEntries = new Set();
  const matchedNewEntries = new Set();

  function diffModes(path, oldValues, newValues) {
    const modes = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
    for (const mode of modes) {
      const oldV = oldValues[mode];
      const newV = newValues[mode];
      if (jsonEq(oldV, newV)) continue;
      const kind = classifyModeChange(oldV, newV);
      if (kind) {
        aliasRepoints.push({ path, mode, ...kind });
      } else {
        variables.push({ path, mode, old: oldV, new: newV });
      }
    }
  }

  // Pass 1: id correlation — rename detection + value diff under the id.
  for (const [id, newEntry] of newM.byId) {
    const oldEntry = oldM.byId.get(id);
    if (!oldEntry) continue;
    matchedOldEntries.add(oldEntry);
    matchedNewEntries.add(newEntry);
    if (oldEntry.path !== newEntry.path) {
      variablesRenamed.push({ bucket: newEntry.collection, id, oldName: oldEntry.path, newName: newEntry.path });
    }
    diffModes(newEntry.path, oldEntry.valuesByMode, newEntry.valuesByMode);
  }

  // Pass 2: name-only fallback for everything id correlation didn't match
  // (no id on one or both sides, or an id present only on one side).
  for (const [key, newEntry] of newM.byKey) {
    if (matchedNewEntries.has(newEntry)) continue;
    const oldEntry = oldM.byKey.get(key);
    if (!oldEntry) {
      variablesAdded.push(newEntry.path);
      continue;
    }
    diffModes(newEntry.path, oldEntry.valuesByMode, newEntry.valuesByMode);
  }
  for (const [key, oldEntry] of oldM.byKey) {
    if (matchedOldEntries.has(oldEntry)) continue;
    if (!newM.byKey.has(key)) variablesRemoved.push(oldEntry.path);
  }

  return { variables, variablesAdded, variablesRemoved, variablesRenamed, aliasRepoints };
}

// Styles are keyed by type (text/paint/effect/grid) + name. `properties` is
// an object for text styles (compared key by key) or an array of paint/
// effect/grid layers for the rest (compared as one unit — layers are
// order-sensitive and don't have a stable per-item key to diff finer than
// that). A style with no counterpart on the other side is one record with
// property "(style)" and old or new set to null.
//
// RENAME DETECTION: same id-first, name-fallback correlation as
// diffVariables (see its header comment) — a style's stable `id`, OPTIONAL,
// is compared within its own type bucket (a text style never renames into a
// paint style). Same id + different name = a `renamed` record in
// `stylesRenamed`, not removed+added; the property diff still runs for the
// matched pair under the new name.
function diffStyles(oldStyles, newStyles) {
  const styles = [];
  const stylesRenamed = [];
  const types = new Set([...Object.keys(oldStyles || {}), ...Object.keys(newStyles || {})]);
  for (const type of types) {
    if (type === "total" || type === "emptyDescriptions") continue; // styleCounts fields, not a style bucket
    const oldList = oldStyles?.[type] || [];
    const newList = newStyles?.[type] || [];
    const oldByName = new Map(oldList.map((s) => [s.name, s]));
    const newByName = new Map(newList.map((s) => [s.name, s]));
    const oldById = new Map(oldList.filter((s) => s.id).map((s) => [s.id, s]));
    const newById = new Map(newList.filter((s) => s.id).map((s) => [s.id, s]));

    const matchedOldStyles = new Set();
    const matchedNewStyles = new Set();

    function diffProps(name, oldStyle, newStyle) {
      const oldProps = oldStyle.properties;
      const newProps = newStyle.properties;
      if (Array.isArray(oldProps) || Array.isArray(newProps)) {
        if (!jsonEq(oldProps, newProps)) {
          styles.push({ type, name, property: "properties", old: oldProps, new: newProps });
        }
      } else {
        const keys = new Set([...Object.keys(oldProps || {}), ...Object.keys(newProps || {})]);
        for (const k of keys) {
          if (!jsonEq(oldProps?.[k], newProps?.[k])) {
            styles.push({ type, name, property: k, old: oldProps?.[k], new: newProps?.[k] });
          }
        }
      }
    }

    // Pass 1: id correlation — rename detection + property diff under the id.
    for (const [id, newStyle] of newById) {
      const oldStyle = oldById.get(id);
      if (!oldStyle) continue;
      matchedOldStyles.add(oldStyle);
      matchedNewStyles.add(newStyle);
      if (oldStyle.name !== newStyle.name) {
        stylesRenamed.push({ bucket: type, id, oldName: oldStyle.name, newName: newStyle.name });
      }
      diffProps(newStyle.name, oldStyle, newStyle);
    }

    // Pass 2: name-only fallback for everything id correlation didn't match.
    for (const [name, newStyle] of newByName) {
      if (matchedNewStyles.has(newStyle)) continue;
      const oldStyle = oldByName.get(name);
      if (!oldStyle) {
        styles.push({ type, name, property: "(style)", old: null, new: newStyle.properties });
        continue;
      }
      diffProps(name, oldStyle, newStyle);
    }
    for (const [name, oldStyle] of oldByName) {
      if (matchedOldStyles.has(oldStyle)) continue;
      if (!newByName.has(name)) {
        styles.push({ type, name, property: "(style)", old: oldStyle.properties, new: null });
      }
    }
  }
  return { styles, stylesRenamed };
}

// Components are keyed by name (standalone components and component sets
// live in separate namespaces per the exporter's own top-level split, so a
// standalone and a set can share a name without colliding here). For sets,
// each VARIANT-typed property's `options` list is diffed for added/removed
// option strings, and every property (VARIANT or not) has its `defaultValue`
// compared for a changed-default record. Property added/removed is caught by
// diffing the property-name sets themselves. Variant instances themselves
// (the individual variant nodes in `variants[]`) are not diffed further here
// — the option-list diff on the driving VARIANT property already captures
// "a variant option was added/removed", which is the changelog-worthy event;
// per-variant node churn (key, description) is not surfaced as its own
// modification-level record.
//
// RENAME DETECTION: components already carry a stable `key` (Figma's own
// component key) — that's the "id" for this bucket per the brief. Same key +
// different name = a `renamed` record in `componentsRenamed`, not
// removed+added; the property diff still runs for the matched pair under the
// new name. Name-only diffing is the fallback when `key` is absent on either
// side (older exports).
// Diffs one matched component SET's per-variant layer bindings
// (variants[].bindings — see the brief's OUTPUT JSON SHAPE: component-internals
// chain data, OPTIONAL on every set/variant). Variants within the set are
// correlated by variant.key first (falls back to variant.name, same
// key-then-name pattern as the outer set/standalone correlation), and each
// matched variant's bindings are keyed by `layer\0property` since a variant
// can bind several properties on the same layer. A binding entry appearing
// only on the new side is `layer_binding_added`, only on the old side is
// `layer_binding_removed`; a value present on both sides that changed is
// classified the same way alias transitions are classified for variables:
// alias->alias (different target) is `layer_binding_repointed`, alias->raw is
// `layer_binding_broken`, raw->alias is `layer_binding_added`.
function diffSetBindings(setName, oldComp, newComp, layerBindings) {
  const oldVariants = oldComp.variants || [];
  const newVariants = newComp.variants || [];
  const oldByKey = new Map(oldVariants.filter((v) => v.key).map((v) => [v.key, v]));
  const newByKey = new Map(newVariants.filter((v) => v.key).map((v) => [v.key, v]));
  const oldByName = new Map(oldVariants.map((v) => [v.name, v]));
  const matchedOld = new Set();
  const matchedNew = new Set();

  function diffBindings(variantName, oldVariant, newVariant) {
    const keyOf = (b) => `${b.layer} ${b.property}`;
    const oldB = new Map((oldVariant.bindings || []).map((b) => [keyOf(b), b]));
    const newB = new Map((newVariant.bindings || []).map((b) => [keyOf(b), b]));
    const keys = new Set([...oldB.keys(), ...newB.keys()]);
    for (const k of keys) {
      const ob = oldB.get(k);
      const nb = newB.get(k);
      if (!ob) {
        layerBindings.push({ set: setName, variant: variantName, layer: nb.layer, property: nb.property, from: null, to: nb.value, type: "layer_binding_added" });
        continue;
      }
      if (!nb) {
        layerBindings.push({ set: setName, variant: variantName, layer: ob.layer, property: ob.property, from: ob.value, to: null, type: "layer_binding_removed" });
        continue;
      }
      if (ob.value === nb.value) continue;
      const oldAlias = isAliasValue(ob.value);
      const newAlias = isAliasValue(nb.value);
      let type;
      if (oldAlias && newAlias) type = "layer_binding_repointed";
      else if (oldAlias && !newAlias) type = "layer_binding_broken";
      else if (!oldAlias && newAlias) type = "layer_binding_added";
      else type = "layer_binding_changed"; // raw->raw: a plain value edit on an unchanged layer path
      layerBindings.push({ set: setName, variant: variantName, layer: ob.layer, property: ob.property, from: ob.value, to: nb.value, type });
    }
  }

  for (const [key, nv] of newByKey) {
    const ov = oldByKey.get(key);
    if (!ov) continue;
    matchedOld.add(ov);
    matchedNew.add(nv);
    diffBindings(nv.name, ov, nv);
  }
  for (const nv of newVariants) {
    if (matchedNew.has(nv)) continue;
    const ov = oldByName.get(nv.name);
    if (!ov || matchedOld.has(ov)) continue;
    diffBindings(nv.name, ov, nv);
  }
}

function diffComponents(oldComponents, newComponents) {
  const componentsAdded = [];
  const componentsRemoved = [];
  const componentsRenamed = [];
  const components = [];
  const layerBindings = [];

  function diffBucket(bucketName, oldList, newList) {
    const oldByName = new Map((oldList || []).map((c) => [c.name, c]));
    const newByName = new Map((newList || []).map((c) => [c.name, c]));
    const oldByKey = new Map((oldList || []).filter((c) => c.key).map((c) => [c.key, c]));
    const newByKey = new Map((newList || []).filter((c) => c.key).map((c) => [c.key, c]));

    const matchedOldComps = new Set();
    const matchedNewComps = new Set();

    function diffProps(name, oldComp, newComp) {
      const oldProps = oldComp.properties || {};
      const newProps = newComp.properties || {};
      const propNames = new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);
      for (const propName of propNames) {
        const oldProp = oldProps[propName];
        const newProp = newProps[propName];
        if (oldProp === undefined) {
          components.push({ bucket: bucketName, name, property: propName, change: "propertyAdded", new: newProp });
          continue;
        }
        if (newProp === undefined) {
          components.push({ bucket: bucketName, name, property: propName, change: "propertyRemoved", old: oldProp });
          continue;
        }
        if (!jsonEq(oldProp.defaultValue, newProp.defaultValue)) {
          components.push({
            bucket: bucketName,
            name,
            property: propName,
            change: "defaultValue",
            old: oldProp.defaultValue,
            new: newProp.defaultValue,
          });
        }
        const oldOptions = oldProp.options || [];
        const newOptions = newProp.options || [];
        const optionsAdded = newOptions.filter((o) => !oldOptions.includes(o));
        const optionsRemoved = oldOptions.filter((o) => !newOptions.includes(o));
        if (optionsAdded.length) {
          components.push({ bucket: bucketName, name, property: propName, change: "optionsAdded", options: optionsAdded });
        }
        if (optionsRemoved.length) {
          components.push({ bucket: bucketName, name, property: propName, change: "optionsRemoved", options: optionsRemoved });
        }
      }
    }

    // Pass 1: key correlation — rename detection + property diff under the key.
    for (const [key, newComp] of newByKey) {
      const oldComp = oldByKey.get(key);
      if (!oldComp) continue;
      matchedOldComps.add(oldComp);
      matchedNewComps.add(newComp);
      if (oldComp.name !== newComp.name) {
        componentsRenamed.push({ bucket: bucketName, id: key, oldName: oldComp.name, newName: newComp.name });
      }
      diffProps(newComp.name, oldComp, newComp);
      if (bucketName === "sets") diffSetBindings(newComp.name, oldComp, newComp, layerBindings);
    }

    // Pass 2: name-only fallback for everything key correlation didn't match.
    for (const [name, newComp] of newByName) {
      if (matchedNewComps.has(newComp)) continue;
      const oldComp = oldByName.get(name);
      if (!oldComp) {
        componentsAdded.push({ bucket: bucketName, name });
        continue;
      }
      diffProps(name, oldComp, newComp);
      if (bucketName === "sets") diffSetBindings(name, oldComp, newComp, layerBindings);
    }
    for (const [name, oldComp] of oldByName) {
      if (matchedOldComps.has(oldComp)) continue;
      if (!newByName.has(name)) componentsRemoved.push({ bucket: bucketName, name });
    }
  }

  diffBucket("standalone", oldComponents?.standalone, newComponents?.standalone);
  diffBucket("sets", oldComponents?.sets, newComponents?.sets);

  return { components, componentsAdded, componentsRemoved, componentsRenamed, layerBindings };
}

// v2 schema diffing (componentSets, exampleStructure, templateFrames,
// latentCapabilities — see the file header's SCHEMA V2 section). Each diff
// function returns a flat array of type-tagged records, same convention as
// aliasRepoints/layerBindings above, so a downstream reader filters on
// `.type` rather than juggling one array per diff flavor.

// componentSets are keyed by `key` (Figma's stable component-set key) first,
// falling back to `name` — same id-first/name-fallback correlation as
// diffComponents. Only `description` is diffed (v2's one new per-set field);
// structural changes to the set itself are still covered by diffComponents.
function diffComponentSets(oldSets, newSets) {
  const records = [];
  const oldByKey = new Map((oldSets || []).filter((s) => s.key).map((s) => [s.key, s]));
  const newByKey = new Map((newSets || []).filter((s) => s.key).map((s) => [s.key, s]));
  const oldByName = new Map((oldSets || []).map((s) => [s.name, s]));
  const matchedOld = new Set();
  const matchedNew = new Set();

  function diffDescription(oldSet, newSet) {
    if (oldSet.description !== newSet.description) {
      records.push({ type: "component_description_changed", key: newSet.key, name: newSet.name, old: oldSet.description, new: newSet.description });
    }
  }

  for (const [key, newSet] of newByKey) {
    const oldSet = oldByKey.get(key);
    if (!oldSet) continue;
    matchedOld.add(oldSet);
    matchedNew.add(newSet);
    diffDescription(oldSet, newSet);
  }
  for (const newSet of newSets || []) {
    if (matchedNew.has(newSet) || (newSet.key && oldByKey.has(newSet.key))) continue;
    const oldSet = oldByName.get(newSet.name);
    if (!oldSet || matchedOld.has(oldSet)) continue;
    diffDescription(oldSet, newSet);
  }

  return records;
}

// exampleStructure sections are keyed by name only (the brief names no
// stable section id, and M-/D-Example section names are themselves the
// stable identity per the M/D section-pairing convention). Frames within a
// matched section use the usual id-first/name-fallback correlation.
function diffExampleStructure(oldStructure, newStructure) {
  const records = [];
  const oldByName = new Map((oldStructure || []).map((s) => [s.name, s]));
  const newByName = new Map((newStructure || []).map((s) => [s.name, s]));

  for (const [name, newSection] of newByName) {
    if (!oldByName.has(name)) {
      records.push({ type: "example_section_added", name });
    }
  }
  for (const [name, oldSection] of oldByName) {
    if (!newByName.has(name)) {
      records.push({ type: "example_section_removed", name });
      continue;
    }
    const newSection = newByName.get(name);
    const oldFrames = oldSection.frames || [];
    const newFrames = newSection.frames || [];
    const oldByKey = new Map(oldFrames.filter((f) => f.id).map((f) => [f.id, f]));
    const newByKey = new Map(newFrames.filter((f) => f.id).map((f) => [f.id, f]));
    const oldFrameByName = new Map(oldFrames.map((f) => [f.name, f]));
    const matchedOld = new Set();
    const matchedNew = new Set();

    for (const [id, newFrame] of newByKey) {
      const oldFrame = oldByKey.get(id);
      if (!oldFrame) continue;
      matchedOld.add(oldFrame);
      matchedNew.add(newFrame);
      if (oldFrame.name !== newFrame.name) {
        records.push({ type: "example_frame_renamed", section: name, id, oldName: oldFrame.name, newName: newFrame.name });
      }
    }
    for (const newFrame of newFrames) {
      if (matchedNew.has(newFrame) || (newFrame.id && oldByKey.has(newFrame.id))) continue;
      if (!oldFrameByName.has(newFrame.name)) {
        records.push({ type: "example_frame_added", section: name, name: newFrame.name });
      }
    }
    for (const oldFrame of oldFrames) {
      if (matchedOld.has(oldFrame) || (oldFrame.id && newByKey.has(oldFrame.id))) continue;
      if (!newFrames.some((f) => f.name === oldFrame.name)) {
        records.push({ type: "example_frame_removed", section: name, name: oldFrame.name });
      }
    }
  }

  return records;
}

// AXIS OWNERSHIP (operator-ratified, 2026-07-29 — see the vault's
// design-system-opinion-gradient.md "Axis ownership rule" and
// token-rulings.md's todo-triage-filter entry): variant axes split by
// design-system level. `device` is always the BLOCK's own adaptation
// machinery (how a chosen variant renders per breakpoint) — a device-axis
// change on a template instance is block-internal noise, not a layout
// opinion. Every OTHER variant axis belongs to the LAYOUT (its opinion:
// HeroText `height`, SplitContent `layout`, alignment axes, etc.) — a change
// there is a real, changelog-worthy layout decision. This is a GLOBAL rule,
// hardcoded, with NO in-file sentinel by default (the ruling explicitly
// rejected one unless a second block-owned axis ever exists).
const AXIS_OWNERSHIP_DEFAULT_BLOCK_OWNED_AXIS = "device";

// A componentSet's description MAY carry an explicit `@axis-ownership
// <axis>=block|layout` annotation that overrides the global rule for that
// one set (the ruling's escape hatch — "parser ready, unused today"). One
// annotation per line, any number of axes.
const AXIS_OWNERSHIP_ANNOTATION_RE = /@axis-ownership\s+([a-zA-Z0-9_-]+)=(block|layout)/g;

function parseAxisOwnershipAnnotations(description) {
  const map = {};
  if (!description) return map;
  for (const match of description.matchAll(AXIS_OWNERSHIP_ANNOTATION_RE)) {
    map[match[1]] = match[2];
  }
  return map;
}

// True when `axis` is block-owned (device-adaptation noise, not a layout
// opinion) for the component set carrying `description` — annotation first,
// global rule as fallback.
function isBlockOwnedAxis(axis, description) {
  const annotations = parseAxisOwnershipAnnotations(description);
  if (axis in annotations) return annotations[axis] === "block";
  return axis === AXIS_OWNERSHIP_DEFAULT_BLOCK_OWNED_AXIS;
}

// templateFrames are the resolved instance state of the layout's Example
// frames (see the vault ruling: "resolved instance state of the DS Example
// frames IS the spec — read overrides as authored intent"). Frames and their
// instances both use the usual id-first/name-fallback correlation.
//
// Per matched instance:
//  - variantProps (the instance's resolved variant selection per axis) are
//    diffed per axis; a BLOCK-owned axis change (see AXIS OWNERSHIP above) is
//    suppressed — it's the block's own adaptation, not a layout decision —
//    while a LAYOUT-owned axis change is `template_variant_changed`.
//  - properties (non-variant componentProperties — text/boolean/instance-swap
//    values) are diffed key by key -> `template_properties_changed`.
//  - overrides (per-instance layer overrides, each carrying its own stable
//    id — "per-instance, id-first" per the brief) are correlated by id;
//    added/removed/changed all land in `template_overrides_changed`.
function diffTemplateFrames(oldFrames, newFrames, componentSetsByName) {
  const records = [];
  const oldByKey = new Map((oldFrames || []).filter((f) => f.id).map((f) => [f.id, f]));
  const newByKey = new Map((newFrames || []).filter((f) => f.id).map((f) => [f.id, f]));
  const oldByName = new Map((oldFrames || []).map((f) => [f.name, f]));
  const newByName = new Map((newFrames || []).map((f) => [f.name, f]));
  const matchedOldFrames = new Set();
  const matchedNewFrames = new Set();

  function diffInstances(frameName, oldInstances, newInstances) {
    const oldIByKey = new Map((oldInstances || []).filter((i) => i.id).map((i) => [i.id, i]));
    const newIByKey = new Map((newInstances || []).filter((i) => i.id).map((i) => [i.id, i]));
    const oldIByName = new Map((oldInstances || []).map((i) => [i.name, i]));
    const newIByName = new Map((newInstances || []).map((i) => [i.name, i]));
    const matchedOldI = new Set();
    const matchedNewI = new Set();

    function diffInstance(oldInst, newInst) {
      const description = componentSetsByName.get(newInst.component)?.description;

      const oldVariant = oldInst.variantProps || {};
      const newVariant = newInst.variantProps || {};
      const axes = new Set([...Object.keys(oldVariant), ...Object.keys(newVariant)]);
      for (const axis of axes) {
        if (jsonEq(oldVariant[axis], newVariant[axis])) continue;
        if (isBlockOwnedAxis(axis, description)) continue; // block-adaptation noise, never reported
        records.push({ type: "template_variant_changed", frame: frameName, instance: newInst.name, axis, old: oldVariant[axis], new: newVariant[axis] });
      }

      const oldProps = oldInst.properties || {};
      const newProps = newInst.properties || {};
      const propNames = new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);
      for (const propName of propNames) {
        if (jsonEq(oldProps[propName], newProps[propName])) continue;
        records.push({ type: "template_properties_changed", frame: frameName, instance: newInst.name, property: propName, old: oldProps[propName], new: newProps[propName] });
      }

      const oldOverrides = oldInst.overrides || [];
      const newOverrides = newInst.overrides || [];
      const oldOByKey = new Map(oldOverrides.filter((o) => o.id).map((o) => [o.id, o]));
      const newOByKey = new Map(newOverrides.filter((o) => o.id).map((o) => [o.id, o]));
      const overrideIds = new Set([...oldOByKey.keys(), ...newOByKey.keys()]);
      for (const id of overrideIds) {
        const oldO = oldOByKey.get(id);
        const newO = newOByKey.get(id);
        if (!oldO) {
          records.push({ type: "template_overrides_changed", frame: frameName, instance: newInst.name, id, property: newO.property, change: "added", new: newO.value });
          continue;
        }
        if (!newO) {
          records.push({ type: "template_overrides_changed", frame: frameName, instance: newInst.name, id, property: oldO.property, change: "removed", old: oldO.value });
          continue;
        }
        if (!jsonEq(oldO.value, newO.value)) {
          records.push({ type: "template_overrides_changed", frame: frameName, instance: newInst.name, id, property: newO.property, change: "changed", old: oldO.value, new: newO.value });
        }
      }
    }

    for (const [id, newInst] of newIByKey) {
      const oldInst = oldIByKey.get(id);
      if (!oldInst) continue;
      matchedOldI.add(oldInst);
      matchedNewI.add(newInst);
      diffInstance(oldInst, newInst);
    }
    for (const newInst of newInstances || []) {
      if (matchedNewI.has(newInst) || (newInst.id && oldIByKey.has(newInst.id))) continue;
      const oldInst = oldIByName.get(newInst.name);
      if (!oldInst || matchedOldI.has(oldInst)) {
        if (!oldInst) records.push({ type: "template_instance_added", frame: frameName, name: newInst.name });
        continue;
      }
      diffInstance(oldInst, newInst);
    }
    for (const oldInst of oldInstances || []) {
      if (matchedOldI.has(oldInst) || (oldInst.id && newIByKey.has(oldInst.id))) continue;
      if (!newIByName.has(oldInst.name)) {
        records.push({ type: "template_instance_removed", frame: frameName, name: oldInst.name });
      }
    }
  }

  for (const [id, newFrame] of newByKey) {
    const oldFrame = oldByKey.get(id);
    if (!oldFrame) continue;
    matchedOldFrames.add(oldFrame);
    matchedNewFrames.add(newFrame);
    diffInstances(newFrame.name, oldFrame.instances, newFrame.instances);
  }
  for (const newFrame of newFrames || []) {
    if (matchedNewFrames.has(newFrame) || (newFrame.id && oldByKey.has(newFrame.id))) continue;
    const oldFrame = oldByName.get(newFrame.name);
    if (!oldFrame || matchedOldFrames.has(oldFrame)) {
      if (!oldFrame) records.push({ type: "template_frame_added", name: newFrame.name });
      continue;
    }
    diffInstances(newFrame.name, oldFrame.instances, newFrame.instances);
  }
  for (const oldFrame of oldFrames || []) {
    if (matchedOldFrames.has(oldFrame) || (oldFrame.id && newByKey.has(oldFrame.id))) continue;
    if (!newByName.has(oldFrame.name)) {
      records.push({ type: "template_frame_removed", name: oldFrame.name });
    }
  }

  return records;
}

// latentCapabilities are keyed by id-first, name-fallback (same convention
// as every other v2 bucket). `visible` and `binding` are each diffed
// independently — a capability can flip visibility without rebinding, or
// rebind without a visibility change, and each is its own changelog signal.
function diffLatentCapabilities(oldCaps, newCaps) {
  const records = [];
  const oldByKey = new Map((oldCaps || []).filter((c) => c.id).map((c) => [c.id, c]));
  const newByKey = new Map((newCaps || []).filter((c) => c.id).map((c) => [c.id, c]));
  const oldByName = new Map((oldCaps || []).map((c) => [c.name, c]));
  const newByName = new Map((newCaps || []).map((c) => [c.name, c]));
  const matchedOld = new Set();
  const matchedNew = new Set();

  function diffCap(oldCap, newCap) {
    if (oldCap.visible !== newCap.visible) {
      records.push({ type: "capability_visibility_changed", id: newCap.id, name: newCap.name, old: oldCap.visible, new: newCap.visible });
    }
    if (!jsonEq(oldCap.binding, newCap.binding)) {
      records.push({ type: "capability_binding_changed", id: newCap.id, name: newCap.name, old: oldCap.binding, new: newCap.binding });
    }
  }

  for (const [id, newCap] of newByKey) {
    const oldCap = oldByKey.get(id);
    if (!oldCap) continue;
    matchedOld.add(oldCap);
    matchedNew.add(newCap);
    diffCap(oldCap, newCap);
  }
  for (const newCap of newCaps || []) {
    if (matchedNew.has(newCap) || (newCap.id && oldByKey.has(newCap.id))) continue;
    const oldCap = oldByName.get(newCap.name);
    if (!oldCap || matchedOld.has(oldCap)) {
      if (!oldCap) records.push({ type: "capability_added", id: newCap.id, name: newCap.name });
      continue;
    }
    diffCap(oldCap, newCap);
  }
  for (const oldCap of oldCaps || []) {
    if (matchedOld.has(oldCap) || (oldCap.id && newByKey.has(oldCap.id))) continue;
    if (!newByName.has(oldCap.name)) {
      records.push({ type: "capability_removed", id: oldCap.id, name: oldCap.name });
    }
  }

  return records;
}

export function writeAtomic(path, contents) {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, path);
}

function readBody(req, onDone, onError) {
  const chunks = [];
  let total = 0;
  let rejected = false;
  req.on("data", (chunk) => {
    if (rejected) return;
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      rejected = true;
      onError(413, "body exceeds 50MB limit");
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    if (rejected) return;
    onDone(Buffer.concat(chunks));
  });
  req.on("error", () => {
    if (!rejected) onError(400, "error reading body");
  });
}

// The plugin's live-sync POST originates from ui.html — the iframe context
// Figma plugins run browser code in (see code.js's header comment: the main
// thread sandbox has no fetch at all, only the iframe does). That fetch is
// a normal cross-origin browser request (Figma's iframe origin isn't
// localhost:4411), so the browser enforces CORS: a preflight OPTIONS for
// the POST, and an Access-Control-Allow-Origin on every response, or the
// browser blocks the response before the plugin ever sees it. This is a
// localhost-bound, unauthenticated-by-design bridge (see file header) reached
// only by this one plugin on this machine, so a wildcard origin is fine —
// there's no session/cookie/credential surface for a third party to steal
// via CORS here.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

// How many defects per lane the response carries as examples. The full
// records already live in conformance.jsonl; this is only enough for the
// plugin to show "which token, which file" without a second round trip.
const CONFORMANCE_SAMPLE_LIMIT = 3;

// Compact, wire-friendly view of the two conformance lanes for the POST
// /capture response — counts plus a few labelled examples. Deliberately does
// NOT change conformance.jsonl, changes.jsonl, or the capture artifact: those
// keep the full records in their existing schemas, and this is a derived
// summary for the plugin UI, which has no filesystem access.
//
// Lane vocabulary: the VALUE lane (runConformanceCheck) compares a Figma
// variable's value against a token in code; the BINDING lane (runBindingCheck)
// compares a component layer's binding against what the code renders. Their
// defect records carry different identifying fields, so each lane gets its own
// label shape rather than one lowest-common-denominator string.
export function summarizeConformance(valueResult, bindingResult) {
  const lane = (result, label) => {
    const defects = Array.isArray(result && result.defects) ? result.defects : [];
    return {
      defects: defects.length,
      samples: defects.slice(0, CONFORMANCE_SAMPLE_LIMIT).map((d) => ({
        type: d.type,
        label: label(d),
        codeLocation: d.codeLocation || null,
      })),
    };
  };
  return {
    ran: true,
    skipped: false,
    value: lane(valueResult, (d) => d.tokenName || d.path || "(unnamed token)"),
    binding: lane(bindingResult, (d) =>
      [d.component, d.layer, d.property].filter(Boolean).join(" · ") || "(unnamed binding)"
    ),
  };
}

// Response body: { ok, path, unchanged, receipt, warningCount, conformance,
// summary? }. `conformance` is always present: { ran, skipped } alone when
// CONFORMANCE_MAP_PATH is unset (opt-in — never render that as "clean"),
// { ran: false, skipped: false, error } when the check threw, or the two-lane
// summary above when it ran. A check failure never fails the capture.
// `warningCount` is always present (parsed.warnings.length, 0 default).
// `summary` mirrors the changes.jsonl record's cross-bucket summary (see
// this file's header) and is present ONLY on a diffed, non-initial sync —
// an initial sync has nothing to diff against, and an unchanged sync has no
// changeRecord at all. ui.html reads these to show "N change(s), M
// warning(s)" from the sync response itself, no GET /changes round trip.
function handleCapture(req, res) {
  readBody(
    req,
    (buf) => {
      let parsed;
      try {
        parsed = JSON.parse(buf.toString("utf8"));
      } catch {
        res.writeHead(400, { "Content-Type": "text/plain", ...CORS_HEADERS });
        res.end("invalid JSON body");
        return;
      }
      const err = validateExportShape(parsed);
      if (err) {
        res.writeHead(400, { "Content-Type": "text/plain", ...CORS_HEADERS });
        res.end(`invalid export shape: ${err}`);
        return;
      }
      const fileSlug = kebab(parsed.header.fileName);
      const fileKey = parsed.header.fileKey;
      // fileKey preferred for routing/dedup when present (stable across
      // renames; unique where fileName alone could collide) — filename
      // stays first in the path so a directory listing still reads by
      // human name, key trails as the disambiguator.
      const outPath = fileKey
        ? join(CAPTURES_DIR, `${fileSlug}--${fileKey}-variables-styles.json`)
        : join(CAPTURES_DIR, `${fileSlug}-variables-styles.json`);
      const sidecarPath = statePath(fileSlug, fileKey);
      const prevState = readState(sidecarPath);
      const hash = exportHash(parsed);
      const unchanged = prevState !== null && prevState.hash === hash;
      // mappingPath/currentCheckFingerprint are computed once up front (they
      // depend only on the document hash + files on disk, never on the check
      // RESULT) and reused by both branches below — see the RE-CHECK
      // INVALIDATION header comment for what each fingerprint field means.
      const mappingPath = process.env.CONFORMANCE_MAP_PATH || null;
      const currentCheckFingerprint = mappingPath ? checkFingerprint(hash, mappingPath) : null;
      const prevCheckFingerprint = (prevState && prevState.checkFingerprint) || null;
      const checksStale = !!mappingPath && !fingerprintsMatch(currentCheckFingerprint, prevCheckFingerprint);

      let receipt;
      // Set only when this sync actually diffed something (see response
      // shape note above handleCapture).
      let changeRecord = null;
      // Design<->code conformance summary for the response body. Defaults to
      // the honest "not configured" state: CONFORMANCE_MAP_PATH is opt-in, and
      // "unset" must never render as "0 defects, all clean" in the plugin.
      let conformance = { ran: false, skipped: true };
      if (unchanged) {
        receipt = {
          ts: new Date().toISOString(),
          fileName: parsed.header.fileName,
          fileKey: fileKey || null,
          exportedAt: new Date(parsed.header.exportedAt).toISOString(),
          counts: parsed.header.counts,
          unchanged: true,
        };
        appendFileSync(RECEIPTS_PATH, JSON.stringify(receipt) + "\n", "utf8");
        if (mappingPath && checksStale) {
          // The document is unchanged, but the checker source, the mapping
          // file, or the listener process itself has moved on since the
          // cached fingerprint — re-run both lanes against the artifact
          // already on disk (nothing about the FILE changed, so it's not
          // rewritten) and refresh the sidecar's fingerprint so the next
          // truly-unchanged sync can skip again.
          try {
            const result = runConformanceCheck({ capturePath: outPath, mappingPath });
            const binding = runBindingCheck({ capturePath: outPath, mappingPath });
            appendFileSync(
              CONFORMANCE_PATH,
              JSON.stringify({ ts: new Date().toISOString(), fileName: parsed.header.fileName, fileKey: fileKey || null, ...result, binding }) + "\n",
              "utf8"
            );
            conformance = summarizeConformance(result, binding);
            writeAtomic(sidecarPath, JSON.stringify({ hash, export: prevState.export, checkFingerprint: currentCheckFingerprint }) + "\n");
          } catch (err) {
            console.error(`[capture-listener] conformance check failed: ${err.message}`);
            conformance = { ran: false, skipped: false, error: err.message };
          }
          console.log(`[capture-listener] unchanged document, but checkers/map/process moved on — re-checked (${parsed.header.fileName})`);
        } else {
          // Nothing was written, so the conformance check doesn't re-run — but
          // "configured and not re-run" is a different fact from "not
          // configured", and the plugin has to be able to tell them apart.
          if (mappingPath) {
            conformance = { ran: false, skipped: false, unchanged: true };
          }
          console.log(`[capture-listener] unchanged, skipped write (${parsed.header.fileName})`);
        }
      } else {
        writeAtomic(outPath, JSON.stringify(parsed, null, 2) + "\n");
        writeAtomic(sidecarPath, JSON.stringify({ hash, export: parsed, checkFingerprint: currentCheckFingerprint }) + "\n");
        writeAtomic(WARNINGS_PATH, JSON.stringify(Array.isArray(parsed.warnings) ? parsed.warnings : []) + "\n");

        changeRecord = {
          ts: new Date().toISOString(),
          fileName: parsed.header.fileName,
          fileKey: fileKey || null,
          schemaVersion: parsed.header.schemaVersion || 1,
          warningCount: Array.isArray(parsed.warnings) ? parsed.warnings.length : 0,
        };
        if (prevState === null) {
          changeRecord.initial = true;
        } else {
          const { variables, variablesAdded, variablesRemoved, variablesRenamed, aliasRepoints } = diffVariables(
            prevState.export.collections,
            parsed.collections
          );
          const { styles, stylesRenamed } = diffStyles(prevState.export.styles, parsed.styles);
          // `components` and every v2 bucket are documented OPTIONAL fields
          // reported by some producers and not others (e.g. the live plugin
          // never sends `components` at all — see figma-capture.mjs's REST
          // lane vs. code.js). A field simply not being reported this sync
          // is not the same claim as "every entry it used to hold is gone" —
          // diffing against an absent side unconditionally treats the whole
          // prior bucket as removed (or, symmetrically, the whole new bucket
          // as added). Only diff when BOTH sides actually carry the field;
          // otherwise it contributes nothing to this sync's diff.
          const { components, componentsAdded, componentsRemoved, componentsRenamed, layerBindings } =
            bothSidesDefined(prevState.export.components, parsed.components)
              ? diffComponents(prevState.export.components, parsed.components)
              : { components: [], componentsAdded: [], componentsRemoved: [], componentsRenamed: [], layerBindings: [] };
          const componentSets = bothSidesDefined(prevState.export.componentSets, parsed.componentSets)
            ? diffComponentSets(prevState.export.componentSets, parsed.componentSets)
            : [];
          const examples = bothSidesDefined(prevState.export.exampleStructure, parsed.exampleStructure)
            ? diffExampleStructure(prevState.export.exampleStructure, parsed.exampleStructure)
            : [];
          const componentSetsByName = new Map((parsed.componentSets || []).map((s) => [s.name, s]));
          const templateFrames = bothSidesDefined(prevState.export.templateFrames, parsed.templateFrames)
            ? diffTemplateFrames(prevState.export.templateFrames, parsed.templateFrames, componentSetsByName)
            : [];
          const capabilities = bothSidesDefined(prevState.export.latentCapabilities, parsed.latentCapabilities)
            ? diffLatentCapabilities(prevState.export.latentCapabilities, parsed.latentCapabilities)
            : [];
          changeRecord.changed = {
            variables,
            variablesAdded,
            variablesRemoved,
            variablesRenamed,
            aliasRepoints,
            styles,
            stylesRenamed,
            components,
            componentsAdded,
            componentsRemoved,
            componentsRenamed,
            layerBindings,
            componentSets,
            examples,
            templateFrames,
            capabilities,
          };
          changeRecord.counts = {
            variablesChanged: variables.length,
            variablesAdded: variablesAdded.length,
            variablesRemoved: variablesRemoved.length,
            variablesRenamed: variablesRenamed.length,
            aliasRepoints: aliasRepoints.length,
            stylesChanged: styles.length,
            stylesRenamed: stylesRenamed.length,
            componentsChanged: components.length,
            componentsAdded: componentsAdded.length,
            componentsRemoved: componentsRemoved.length,
            componentsRenamed: componentsRenamed.length,
            layerBindings: layerBindings.length,
            componentSets: componentSets.length,
            examples: examples.length,
            templateFrames: templateFrames.length,
            capabilities: capabilities.length,
          };
          // Cross-bucket totals for a quick at-a-glance read of the record —
          // added/removed come from the buckets that track them separately
          // (variables, components); styles has no separate added/removed
          // array (an added/removed style shows up as a "(style)" entry
          // inside `styles` itself, per diffStyles' header comment), so it
          // only contributes to `modified`. `renamed` totals the three
          // renamed buckets; `repointed` is the alias-repoint/binding-change
          // count from `aliasRepoints` (all three of its record types —
          // alias_repointed, binding_broken, binding_added — count as one
          // "repointed" drift signal here); `layerBindings` totals
          // `changed.layerBindings` (all four of its record types) as its own
          // signal — it's a different chain (component-internals, not
          // variable/style aliasing) so it isn't folded into `repointed`.
          changeRecord.summary = {
            added: variablesAdded.length + componentsAdded.length,
            modified: variables.length + styles.length + components.length,
            removed: variablesRemoved.length + componentsRemoved.length,
            renamed: variablesRenamed.length + stylesRenamed.length + componentsRenamed.length,
            repointed: aliasRepoints.length,
            layerBindings: layerBindings.length,
          };
        }
        appendFileSync(CHANGES_PATH, JSON.stringify(changeRecord) + "\n", "utf8");

        // Opt-in conformance check (CONFORMANCE_MAP_PATH): unset by default,
        // so this block never runs unless explicitly configured — existing
        // behavior is unchanged with nothing configured. Never lets a check
        // failure fail the capture request; a broken mapping/capture just
        // logs and skips the append. Runs BOTH lanes off the same mapping
        // file — the value lane (`entries`, top-level result fields) and
        // the binding lane (`components.entries`, nested under `binding`) —
        // so a mapping with no "components" section still works exactly as
        // before (runBindingCheck sees zero entries and reports ok:true).
        if (mappingPath) {
          try {
            const result = runConformanceCheck({ capturePath: outPath, mappingPath });
            const binding = runBindingCheck({ capturePath: outPath, mappingPath });
            appendFileSync(
              CONFORMANCE_PATH,
              JSON.stringify({ ts: new Date().toISOString(), fileName: parsed.header.fileName, fileKey: fileKey || null, ...result, binding }) + "\n",
              "utf8"
            );
            conformance = summarizeConformance(result, binding);
          } catch (err) {
            console.error(`[capture-listener] conformance check failed: ${err.message}`);
            conformance = { ran: false, skipped: false, error: err.message };
          }
        }

        receipt = {
          ts: new Date().toISOString(),
          fileName: parsed.header.fileName,
          fileKey: fileKey || null,
          exportedAt: new Date(parsed.header.exportedAt).toISOString(),
          counts: parsed.header.counts,
        };
        appendFileSync(RECEIPTS_PATH, JSON.stringify(receipt) + "\n", "utf8");

        console.log(`[capture-listener] wrote ${outPath} (${parsed.header.fileName})`);
      }

      const responseBody = {
        ok: true,
        path: outPath,
        unchanged,
        receipt,
        warningCount: Array.isArray(parsed.warnings) ? parsed.warnings.length : 0,
        conformance,
      };
      if (changeRecord && changeRecord.summary) {
        responseBody.summary = changeRecord.summary;
      }
      res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify(responseBody));
    },
    (status, message) => {
      res.writeHead(status, { "Content-Type": "text/plain", ...CORS_HEADERS });
      res.end(message);
    }
  );
}

// GET /changes[?n=] — the last `n` records from changes.jsonl (default 10,
// capped at 50), newest first. Reads the whole file (it's an append-only
// log of small JSON lines, not a large binary) and parses each line
// independently so one corrupt trailing line can't sink the whole response.
const CHANGES_DEFAULT_N = 10;
const CHANGES_MAX_N = 50;

function handleGetChanges(req, res) {
  const url = new URL(req.url, "http://localhost");
  let n = Number(url.searchParams.get("n") || CHANGES_DEFAULT_N);
  if (!Number.isFinite(n) || n <= 0) n = CHANGES_DEFAULT_N;
  n = Math.min(n, CHANGES_MAX_N);

  let records = [];
  if (existsSync(CHANGES_PATH)) {
    const lines = readFileSync(CHANGES_PATH, "utf8").split("\n").filter((l) => l.trim());
    records = lines
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null; // skip a corrupt/partial line rather than failing the whole response
        }
      })
      .filter((r) => r !== null);
  }
  const latest = records.slice(-n).reverse();

  res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify(latest));
}

// GET /warnings — the most recently synced capture's warnings[] (v2's
// structural-warning bucket). [] when no capture has synced yet, or when the
// latest capture was v1 (no warnings field).
function handleGetWarnings(req, res) {
  let warnings = [];
  if (existsSync(WARNINGS_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(WARNINGS_PATH, "utf8"));
      if (Array.isArray(parsed)) warnings = parsed;
    } catch {
      // corrupt file — fall back to []
    }
  }
  res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify(warnings));
}

// The todo queue is the operator's Figma plugin's pull channel: pipeline
// producers (conformance lanes, manual curl for now) POST items here, the
// in-Figma plugin GETs them, and acks the ones it consumed. Read failures
// (missing file, corrupt JSON) fall back to an empty queue rather than 500ing
// — a plugin poll shouldn't break because the file hasn't been seeded yet.
function readTodoQueue() {
  if (!existsSync(TODO_QUEUE_PATH)) return { items: [] };
  try {
    const parsed = JSON.parse(readFileSync(TODO_QUEUE_PATH, "utf8"));
    return { items: Array.isArray(parsed.items) ? parsed.items : [] };
  } catch {
    return { items: [] };
  }
}

function handleGetTodos(req, res) {
  res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify(readTodoQueue()));
}

// POST /todos body = { items: [{ text, id? }] } — pipeline producers (the
// conformance lanes, later; manual curl for now) enqueue items here. Dedupe
// is by text against the current queue: a producer re-running the same lane
// shouldn't pile up duplicate todos every sync. An id is generated when the
// producer doesn't supply one; a caller-supplied id is trusted as-is (the
// seed file's todo-1..todo-10 scheme relies on this).
function handlePostTodos(req, res) {
  readBody(
    req,
    (buf) => {
      let parsed;
      try {
        parsed = JSON.parse(buf.toString("utf8"));
      } catch {
        res.writeHead(400, { "Content-Type": "text/plain", ...CORS_HEADERS });
        res.end("invalid JSON body");
        return;
      }
      if (!parsed || !Array.isArray(parsed.items)) {
        res.writeHead(400, { "Content-Type": "text/plain", ...CORS_HEADERS });
        res.end("invalid body: items must be an array");
        return;
      }
      const queue = readTodoQueue();
      const existingTexts = new Set(queue.items.map((i) => i.text));
      for (const item of parsed.items) {
        if (!item || typeof item.text !== "string" || !item.text) continue;
        if (existingTexts.has(item.text)) continue;
        const id = typeof item.id === "string" && item.id ? item.id : randomUUID();
        queue.items.push({ id, text: item.text });
        existingTexts.add(item.text);
      }
      writeAtomic(TODO_QUEUE_PATH, JSON.stringify(queue, null, 2) + "\n");
      res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify(queue));
    },
    (status, message) => {
      res.writeHead(status, { "Content-Type": "text/plain", ...CORS_HEADERS });
      res.end(message);
    }
  );
}

// POST /todos/ack body = { ids: [...], done?: [...] } — the plugin acks the
// items it has pulled and removes them from the queue. `done` is optional
// and purely a receipt for future two-way sync (which ids the plugin
// actually marked complete, vs. just dequeued) — it never gates the removal.
function handleAckTodos(req, res) {
  readBody(
    req,
    (buf) => {
      let parsed;
      try {
        parsed = JSON.parse(buf.toString("utf8"));
      } catch {
        res.writeHead(400, { "Content-Type": "text/plain", ...CORS_HEADERS });
        res.end("invalid JSON body");
        return;
      }
      if (!parsed || !Array.isArray(parsed.ids)) {
        res.writeHead(400, { "Content-Type": "text/plain", ...CORS_HEADERS });
        res.end("invalid body: ids must be an array");
        return;
      }
      const ackIds = new Set(parsed.ids);
      const queue = readTodoQueue();
      queue.items = queue.items.filter((item) => !ackIds.has(item.id));
      writeAtomic(TODO_QUEUE_PATH, JSON.stringify(queue, null, 2) + "\n");

      if (Array.isArray(parsed.done)) {
        const receipt = { ts: new Date().toISOString(), lane: "todos", ids: parsed.ids, done: parsed.done };
        appendFileSync(RECEIPTS_PATH, JSON.stringify(receipt) + "\n", "utf8");
      }

      res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify(queue));
    },
    (status, message) => {
      res.writeHead(status, { "Content-Type": "text/plain", ...CORS_HEADERS });
      res.end(message);
    }
  );
}

// POST /todos/push body = { items: [{ id, text, status }] } — the operator's
// todo plugin's outbound mirror: it pushes its FULL current list on every
// change, not incremental deltas, so this replaces todo-state.json wholesale
// (unlike /todos, which is the pipeline's inbound enqueue channel into a
// separate file, todo-queue.json). `status` is trusted as-is — the listener
// mirrors the plugin's state machine, it doesn't validate it, so a future
// status the plugin adds never requires a listener change. `text` is
// markdown-capable per the plugin's data model; the listener stores it
// verbatim, no markdown parsing happens here.
function handlePushTodos(req, res) {
  readBody(
    req,
    (buf) => {
      let parsed;
      try {
        parsed = JSON.parse(buf.toString("utf8"));
      } catch {
        res.writeHead(400, { "Content-Type": "text/plain", ...CORS_HEADERS });
        res.end("invalid JSON body");
        return;
      }
      if (!parsed || !Array.isArray(parsed.items)) {
        res.writeHead(400, { "Content-Type": "text/plain", ...CORS_HEADERS });
        res.end("invalid body: items must be an array");
        return;
      }
      for (const item of parsed.items) {
        if (!item || typeof item.id !== "string" || !item.id || typeof item.text !== "string" || typeof item.status !== "string" || !item.status) {
          res.writeHead(400, { "Content-Type": "text/plain", ...CORS_HEADERS });
          res.end("invalid body: every item needs id, text, status");
          return;
        }
      }
      const state = { items: parsed.items };
      writeAtomic(TODO_STATE_PATH, JSON.stringify(state, null, 2) + "\n");

      const receipt = { ts: new Date().toISOString(), lane: "todos", action: "push", count: parsed.items.length };
      appendFileSync(RECEIPTS_PATH, JSON.stringify(receipt) + "\n", "utf8");

      res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify(state));
    },
    (status, message) => {
      res.writeHead(status, { "Content-Type": "text/plain", ...CORS_HEADERS });
      res.end(message);
    }
  );
}

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    // Preflight for the plugin's cross-origin POST from ui.html. No auth
    // check needed here (see CORS_HEADERS comment) — just answer it so the
    // browser lets the real request through.
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain", ...CORS_HEADERS });
    res.end("ok");
    return;
  }
  if (req.method === "POST" && req.url === "/capture") {
    handleCapture(req, res);
    return;
  }
  if (req.method === "GET" && (req.url === "/changes" || req.url.startsWith("/changes?"))) {
    handleGetChanges(req, res);
    return;
  }
  if (req.method === "GET" && req.url === "/warnings") {
    handleGetWarnings(req, res);
    return;
  }
  if (req.method === "GET" && req.url === "/todos") {
    handleGetTodos(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/todos/ack") {
    handleAckTodos(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/todos/push") {
    handlePushTodos(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/todos") {
    handlePostTodos(req, res);
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain", ...CORS_HEADERS });
  res.end("not found");
});

if (isDirectRun) {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[capture-listener] listening on http://127.0.0.1:${PORT}  (POST /capture, GET /health, GET/POST /todos)`);
    console.log(`[capture-listener] writing to ${CAPTURES_DIR}`);
  });

  const shutdown = () => {
    console.log("[capture-listener] shutting down");
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
