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
                      required — same shape code.js's buildExport() produces).
                      Writes atomically (temp file + rename) to
                      ~/JHD/captures/live/<file-name-kebab>-variables-styles.json
                      (stable path — always overwritten, the diffable
                      artifact) and appends one receipt line to
                      ~/JHD/captures/live/receipts.jsonl:
                        { ts, fileName, counts }
     GET  /health     -> 200 "ok"

   Bind: 127.0.0.1 only, never 0.0.0.0 — this is a localhost-only bridge, no
   auth needed because nothing outside the machine can reach it. Bodies over
   ~50MB or non-JSON bodies are rejected with 4xx and never written.        */
import { createServer } from "node:http";
import { mkdirSync, renameSync, appendFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.CAPTURE_LISTENER_PORT || 4411);
const MAX_BODY_BYTES = 50 * 1024 * 1024; // ~50MB
const CAPTURES_DIR = join(homedir(), "JHD", "captures", "live");
const RECEIPTS_PATH = join(CAPTURES_DIR, "receipts.jsonl");

mkdirSync(CAPTURES_DIR, { recursive: true });

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
function validateExportShape(body) {
  if (!body || typeof body !== "object") return "body is not a JSON object";
  const header = body.header;
  if (!header || typeof header !== "object") return "missing header";
  if (typeof header.fileName !== "string" || !header.fileName) return "missing header.fileName";
  if (typeof header.pluginVersion !== "string") return "missing header.pluginVersion";
  if (typeof header.exportedAt !== "number") return "missing header.exportedAt";
  if (!header.counts || typeof header.counts !== "object") return "missing header.counts";
  return null;
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
      const outPath = join(CAPTURES_DIR, `${fileSlug}-variables-styles.json`);
      writeAtomic(outPath, JSON.stringify(parsed, null, 2) + "\n");

      const receipt = {
        ts: new Date().toISOString(),
        fileName: parsed.header.fileName,
        counts: parsed.header.counts,
      };
      appendFileSync(RECEIPTS_PATH, JSON.stringify(receipt) + "\n", "utf8");

      console.log(`[capture-listener] wrote ${outPath} (${parsed.header.fileName})`);
      res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ ok: true, path: outPath, receipt }));
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
