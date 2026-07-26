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

   Dedup + change log: every POST is hashed (sha256 of a stable-key-sorted
   stringify of the body, excluding header.exportedAt so identical file
   state hashes identical regardless of when it was exported). The hash and
   a copy of the full previous export are kept in a per-file sidecar under
   <CAPTURES_DIR>/.state/. A POST whose hash matches the stored hash is a
   no-op sync (nothing changed since last time): the artifact file is not
   rewritten, and the receipt line gets `unchanged: true`. A POST whose hash
   differs is diffed against the sidecar's previous export — variables
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
   entry appearing only on the old side is `layer_binding_removed`. Records
   land in `changed.layerBindings` as
   { set, variant, layer, property, from, to, type }.

   `summary` totals the per-bucket added/modified/removed arrays into one
   cross-bucket count (styles has no separate added/removed array, so it
   only contributes to `modified` — see diffStyles' header comment).
   The first-ever sync for a file (no sidecar yet) logs { initial: true }
   with no diff (and no `summary`), since there's nothing to compare against.

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
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { runConformanceCheck } from "./conformance-check.mjs";

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

mkdirSync(CAPTURES_DIR, { recursive: true });
mkdirSync(STATE_DIR, { recursive: true });

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
  return null;
}

// Deterministic stringify: object keys sorted at every level, arrays kept in
// their given order (order is meaningful — it's the plugin's own collection/
// variable iteration order, which is stable sync-to-sync for the same file
// state). Used only to derive the dedup hash, never for the written artifact.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

// Hash the full export excluding header.exportedAt, so two syncs of
// identical file state hash identical regardless of when they were sent.
function exportHash(fullExport) {
  const clone = JSON.parse(JSON.stringify(fullExport));
  if (clone.header) delete clone.header.exportedAt;
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
      else continue; // raw->raw: not a binding-chain event, unspecified — skip
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

function writeAtomic(path, contents) {
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

      let receipt;
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
        console.log(`[capture-listener] unchanged, skipped write (${parsed.header.fileName})`);
      } else {
        writeAtomic(outPath, JSON.stringify(parsed, null, 2) + "\n");
        writeAtomic(sidecarPath, JSON.stringify({ hash, export: parsed }) + "\n");

        const changeRecord = { ts: new Date().toISOString(), fileName: parsed.header.fileName, fileKey: fileKey || null };
        if (prevState === null) {
          changeRecord.initial = true;
        } else {
          const { variables, variablesAdded, variablesRemoved, variablesRenamed, aliasRepoints } = diffVariables(
            prevState.export.collections,
            parsed.collections
          );
          const { styles, stylesRenamed } = diffStyles(prevState.export.styles, parsed.styles);
          const { components, componentsAdded, componentsRemoved, componentsRenamed, layerBindings } = diffComponents(
            prevState.export.components,
            parsed.components
          );
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
        // logs and skips the append.
        if (process.env.CONFORMANCE_MAP_PATH) {
          try {
            const result = runConformanceCheck({ capturePath: outPath, mappingPath: process.env.CONFORMANCE_MAP_PATH });
            appendFileSync(
              CONFORMANCE_PATH,
              JSON.stringify({ ts: new Date().toISOString(), fileName: parsed.header.fileName, fileKey: fileKey || null, ...result }) + "\n",
              "utf8"
            );
          } catch (err) {
            console.error(`[capture-listener] conformance check failed: ${err.message}`);
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

      res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ ok: true, path: outPath, unchanged, receipt }));
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
  res.writeHead(404, { "Content-Type": "text/plain", ...CORS_HEADERS });
  res.end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[capture-listener] listening on http://127.0.0.1:${PORT}  (POST /capture, GET /health)`);
  console.log(`[capture-listener] writing to ${CAPTURES_DIR}`);
});

function shutdown() {
  console.log("[capture-listener] shutting down");
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
