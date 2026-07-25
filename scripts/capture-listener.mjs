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

   Dedup + change log: every POST is hashed (sha256 of a stable-key-sorted
   stringify of the body, excluding header.exportedAt so identical file
   state hashes identical regardless of when it was exported). The hash and
   a copy of the full previous export are kept in a per-file sidecar under
   <CAPTURES_DIR>/.state/. A POST whose hash matches the stored hash is a
   no-op sync (nothing changed since last time): the artifact file is not
   rewritten, and the receipt line gets `unchanged: true`. A POST whose hash
   differs is diffed against the sidecar's previous export — variables
   (keyed by collection/name, compared per mode, added/removed) and styles
   (keyed by type/name, compared per property, added/removed) — and one
   record is appended to ~/JHD/captures/live/changes.jsonl:
     { ts, fileName, fileKey, changed: { variables, variablesAdded,
       variablesRemoved, styles }, counts }
   The first-ever sync for a file (no sidecar yet) logs { initial: true }
   with no diff, since there's nothing to compare against.

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
import { join } from "node:path";

const PORT = Number(process.env.CAPTURE_LISTENER_PORT || 4411);
const MAX_BODY_BYTES = 50 * 1024 * 1024; // ~50MB
const CAPTURES_DIR = join(homedir(), "JHD", "captures", "live");
const RECEIPTS_PATH = join(CAPTURES_DIR, "receipts.jsonl");
const CHANGES_PATH = join(CAPTURES_DIR, "changes.jsonl");
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

// Variables are keyed by collection name + variable name; each variable's
// value is compared per mode (the mode-vector model — a variable's value is
// a map of mode name -> value, and modes can be added/removed/changed
// independently of the variable itself). An alias ("→ collection/name") is
// just a string value here, so a changed alias target is caught by the same
// per-mode value comparison as any other changed value.
function diffVariables(oldCollections, newCollections) {
  const toMap = (collections) => {
    const map = new Map();
    for (const col of collections || []) {
      for (const v of col.variables || []) {
        map.set(`${col.name} ${v.name}`, v.valuesByMode || {});
      }
    }
    return map;
  };
  const oldMap = toMap(oldCollections);
  const newMap = toMap(newCollections);
  const variables = [];
  const variablesAdded = [];
  const variablesRemoved = [];

  for (const [key, newValues] of newMap) {
    const path = key.replace(" ", "/");
    if (!oldMap.has(key)) {
      variablesAdded.push(path);
      continue;
    }
    const oldValues = oldMap.get(key);
    const modes = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
    for (const mode of modes) {
      if (!jsonEq(oldValues[mode], newValues[mode])) {
        variables.push({ path, mode, old: oldValues[mode], new: newValues[mode] });
      }
    }
  }
  for (const key of oldMap.keys()) {
    if (!newMap.has(key)) variablesRemoved.push(key.replace(" ", "/"));
  }
  return { variables, variablesAdded, variablesRemoved };
}

// Styles are keyed by type (text/paint/effect/grid) + name. `properties` is
// an object for text styles (compared key by key) or an array of paint/
// effect/grid layers for the rest (compared as one unit — layers are
// order-sensitive and don't have a stable per-item key to diff finer than
// that). A style with no counterpart on the other side is one record with
// property "(style)" and old or new set to null.
function diffStyles(oldStyles, newStyles) {
  const styles = [];
  const types = new Set([...Object.keys(oldStyles || {}), ...Object.keys(newStyles || {})]);
  for (const type of types) {
    if (type === "total" || type === "emptyDescriptions") continue; // styleCounts fields, not a style bucket
    const oldMap = new Map((oldStyles?.[type] || []).map((s) => [s.name, s]));
    const newMap = new Map((newStyles?.[type] || []).map((s) => [s.name, s]));

    for (const [name, newStyle] of newMap) {
      if (!oldMap.has(name)) {
        styles.push({ type, name, property: "(style)", old: null, new: newStyle.properties });
        continue;
      }
      const oldProps = oldMap.get(name).properties;
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
    for (const [name, oldStyle] of oldMap) {
      if (!newMap.has(name)) {
        styles.push({ type, name, property: "(style)", old: oldStyle.properties, new: null });
      }
    }
  }
  return styles;
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
          const { variables, variablesAdded, variablesRemoved } = diffVariables(
            prevState.export.collections,
            parsed.collections
          );
          const styles = diffStyles(prevState.export.styles, parsed.styles);
          changeRecord.changed = { variables, variablesAdded, variablesRemoved, styles };
          changeRecord.counts = {
            variablesChanged: variables.length,
            variablesAdded: variablesAdded.length,
            variablesRemoved: variablesRemoved.length,
            stylesChanged: styles.length,
          };
        }
        appendFileSync(CHANGES_PATH, JSON.stringify(changeRecord) + "\n", "utf8");

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
