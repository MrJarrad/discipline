#!/usr/bin/env node
/* figma-node — REST-lane node fetch for the capture-figma skill: read a known
   node id (or a full figma.com URL) straight from the REST API, no desktop
   app, no active-tab dependency. Complements figma-capture.mjs (whole-file
   snapshot/delta) with a single-node lane for "I already know the id."

   Usage:
     figma-node.mjs node <fileKey> <nodeId> [--raw] [--out path]
     figma-node.mjs node <figma.com URL with ?node-id=...> [--raw] [--out path]
       GET /v1/files/:key/nodes?ids=<id>. Prints pruned JSON (vector geometry
       stripped — vectorNetwork/vectorPaths/fillGeometry/strokeGeometry —
       everything else kept as-is: structure, names, boundVariables, styles,
       layout props, absoluteBoundingBox) to stdout, or to --out if given.
       --raw skips pruning and prints the full node entry.
       nodeId accepts "572:46329", "572-46329", or a figma.com URL's
       ?node-id= (dash or percent-encoded colon form).

     figma-node.mjs image <fileKey> <nodeId> [--scale 2] [--out path]
       GET /v1/images/:key?ids=<id>&format=png&scale=<scale>, then downloads
       the rendered PNG. Default --out: ~/JHD/captures/renders/<key>-<id>.png
       (dir created if missing).

     figma-node.mjs vars <fileKey>
       GET /v1/files/:key/variables/local. This endpoint is Enterprise-plan
       gated: on 403, prints the documented explanation and exits 2 rather
       than fabricating a result. Fall back to the MCP get_variable_defs lane
       (capture-figma skill) when this exits 2.

   Auth: FIGMA_TOKEN env var (sent as X-Figma-Token), same convention as
   figma-capture.mjs / capture-poll.mjs — requireToken() is imported from
   figma-capture.mjs rather than reimplemented. For interactive shell use,
   export FIGMA_TOKEN in your shell profile. For launchd-invoked runs (a cron-
   style agent, or capture-listener's plist) where the shell profile isn't
   sourced, set it durably with `launchctl setenv FIGMA_TOKEN <token>`
   (session-scoped — re-run after each login/reboot) or bake it into that
   specific plist's <key>EnvironmentVariables</key> dict, same pattern as
   com.jhd.capture-listener.plist's own CONFORMANCE_MAP_PATH entry.

   Errors: 403 (no access), 404 (not found), and 429 (rate limited) each get
   a distinct, non-generic message. 429 respects a `Retry-After` response
   header when present (single retry), falling back to a fixed 2s wait when
   the header is absent — matches figma-capture.mjs's retry count, adds
   header-aware backoff. */
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { requireToken } from "./figma-capture.mjs";

const API_BASE = "https://api.figma.com/v1";

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The fetch boundary: single retry on 429, honoring the Retry-After response
// header (seconds) when present, falling back to a fixed 2s wait when it
// isn't — never retries a second time. fetchImpl/sleepImpl are injected so
// tests mock the boundary instead of hitting the network.
export async function figmaGet(path, token, { fetchImpl = fetch, sleepImpl = defaultSleep, retried = false } = {}) {
  const res = await fetchImpl(`${API_BASE}${path}`, { headers: { "X-Figma-Token": token } });
  if (res.status === 429 && !retried) {
    const retryAfterHeader = res.headers.get("retry-after");
    const waitMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 2000;
    await sleepImpl(waitMs);
    return figmaGet(path, token, { fetchImpl, sleepImpl, retried: true });
  }
  return res;
}

export function normalizeNodeId(raw) {
  const decoded = decodeURIComponent(String(raw));
  if (/^\d+-\d+$/.test(decoded)) return decoded.replace("-", ":");
  return decoded;
}

// figma.com URLs: /design/<key>/... or /file/<key>/... (older links), with
// the node selected in ?node-id=, dash form ("572-46329") in current share
// links, occasionally percent-encoded colon form ("572%3A46329") in older ones.
function parseNodeUrl(urlStr) {
  const url = new URL(urlStr);
  const match = url.pathname.match(/\/(?:design|file|proto)\/([a-zA-Z0-9]+)/);
  if (!match) {
    throw new Error(`could not extract a file key from URL: ${urlStr}`);
  }
  const nodeIdRaw = url.searchParams.get("node-id");
  if (!nodeIdRaw) {
    throw new Error(`URL has no node-id query param: ${urlStr}`);
  }
  return { fileKey: match[1], nodeId: normalizeNodeId(nodeIdRaw) };
}

const VECTOR_GEOMETRY_KEYS = new Set(["vectorNetwork", "vectorPaths", "fillGeometry", "strokeGeometry"]);

// Strips vector geometry only — everything else (structure, names,
// boundVariables, styles, layout props, absoluteBoundingBox) is passed
// through untouched. raw=true is a no-op passthrough for --raw.
export function pruneNode(value, raw) {
  if (raw) return value;
  return stripVectorGeometry(value);
}

function stripVectorGeometry(value) {
  if (Array.isArray(value)) return value.map(stripVectorGeometry);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (VECTOR_GEOMETRY_KEYS.has(key)) continue;
      out[key] = stripVectorGeometry(v);
    }
    return out;
  }
  return value;
}

export function parseNodeRef(args) {
  if (args.length === 1 && /^https?:\/\//.test(args[0])) {
    return parseNodeUrl(args[0]);
  }
  if (args.length >= 2 && args[0] && args[1]) {
    return { fileKey: args[0], nodeId: normalizeNodeId(args[1]) };
  }
  throw new Error("expected <fileKey> <nodeId>, or a figma.com URL with ?node-id=");
}

export class FigmaApiError extends Error {
  constructor(message, { status, statusText, retryAfter } = {}) {
    super(message);
    this.name = "FigmaApiError";
    this.status = status;
    this.statusText = statusText;
    this.retryAfter = retryAfter;
  }
}

// Turns a non-ok Figma REST response into a FigmaApiError with a message
// specific to the status — never a bare "request failed".
async function assertOk(res, context) {
  if (res.ok) return;
  const retryAfterHeader = res.headers.get("retry-after");
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
  let message;
  if (res.status === 403) {
    message = `${context}: 403 Forbidden — this token doesn't have access to this file/node.`;
  } else if (res.status === 404) {
    message = `${context}: 404 Not Found — check the file key and node id.`;
  } else if (res.status === 429) {
    message = `${context}: 429 rate limited${retryAfter ? ` — retry after ${retryAfter}s` : ""}.`;
  } else {
    message = `${context}: ${res.status} ${res.statusText}`;
  }
  throw new FigmaApiError(message, { status: res.status, statusText: res.statusText, retryAfter });
}

export async function fetchNode(fileKey, nodeId, token, { fetchImpl, sleepImpl, raw = false } = {}) {
  const res = await figmaGet(`/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`, token, { fetchImpl, sleepImpl });
  await assertOk(res, "node fetch");
  const body = await res.json();
  const entry = body.nodes?.[nodeId];
  if (!entry) {
    throw new FigmaApiError(`node fetch: no entry for ${nodeId} in the response (check the id is correct for this file)`, {
      status: 404,
    });
  }
  return pruneNode(entry, raw);
}

export async function fetchImageUrl(fileKey, nodeId, token, { fetchImpl, sleepImpl, scale = 2 } = {}) {
  const res = await figmaGet(
    `/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=${scale}`,
    token,
    { fetchImpl, sleepImpl }
  );
  await assertOk(res, "image render");
  const body = await res.json();
  if (body.err) {
    throw new FigmaApiError(`image render: ${body.err}`, { status: 502 });
  }
  const url = body.images?.[nodeId];
  if (!url) {
    throw new FigmaApiError(`image render: no image URL returned for node ${nodeId}`, { status: 502 });
  }
  return url;
}

// The render URL is a pre-signed S3 link — no Figma auth header needed or
// accepted here, a separate fetch from figmaGet's API-authenticated calls.
export async function downloadImage(url, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new FigmaApiError(`image download: ${res.status} ${res.statusText}`, { status: res.status });
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Reads width/height straight from the PNG signature + IHDR chunk — no
// image-decoding dependency needed for just the dimensions.
export function pngDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  const isPng = buffer[0] === 0x89 && buffer.toString("ascii", 1, 4) === "PNG";
  if (!isPng) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export function defaultImagePath(fileKey, nodeId) {
  return join(homedir(), "JHD", "captures", "renders", `${fileKey}-${nodeId.replace(":", "-")}.png`);
}

// Distinct from FigmaApiError: a 403 on this endpoint means the token/plan
// doesn't have Enterprise access, not "retry" or "check your token" — the
// vars command must report this explanation and exit 2, never fabricate a
// variables payload to paper over it.
export class EnterpriseGatedError extends Error {
  constructor(fileKey) {
    super(
      `GET /v1/files/${fileKey}/variables/local returned 403 — this endpoint is Enterprise-plan gated. ` +
        `This token/file does not have Enterprise access to Local Variables via REST. ` +
        `Fall back to the desktop MCP get_variable_defs lane (see the capture-figma skill) instead.`
    );
    this.name = "EnterpriseGatedError";
  }
}

export async function fetchVariables(fileKey, token, { fetchImpl, sleepImpl } = {}) {
  const res = await figmaGet(`/files/${fileKey}/variables/local`, token, { fetchImpl, sleepImpl });
  if (res.status === 403) {
    throw new EnterpriseGatedError(fileKey);
  }
  await assertOk(res, "variables fetch");
  return res.json();
}

// --- CLI ---------------------------------------------------------------------

// Splits argv into positional args + named flags in one pass — no index
// arithmetic at call sites (an earlier version's indexOf-based slicing had an
// off-by-one when a value-flag was absent: indexOf returns -1, and -1 + 1
// re-lands on index 0, silently eating the first positional arg).
export function parseCliArgs(args, { valueFlags = [], boolFlags = [] } = {}) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (boolFlags.includes(a)) {
      flags[a] = true;
    } else if (valueFlags.includes(a)) {
      flags[a] = args[i + 1];
      i++;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

async function cmdNode(rest) {
  const { positional, flags } = parseCliArgs(rest, { valueFlags: ["--out"], boolFlags: ["--raw"] });
  const raw = Boolean(flags["--raw"]);
  const outPath = flags["--out"];

  let fileKey, nodeId;
  try {
    ({ fileKey, nodeId } = parseNodeRef(positional));
  } catch (err) {
    console.error(`usage: figma-node.mjs node <fileKey> <nodeId> [--raw] [--out path]\n${err.message}`);
    process.exit(1);
  }

  const token = requireToken();
  let result;
  try {
    result = await fetchNode(fileKey, nodeId, token, { raw });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const json = JSON.stringify(result, null, 2) + "\n";
  if (outPath) {
    writeFileSync(outPath, json, "utf8");
    console.log(`wrote ${outPath}`);
  } else {
    process.stdout.write(json);
  }
}

async function cmdImage(rest) {
  const { positional, flags } = parseCliArgs(rest, { valueFlags: ["--scale", "--out"] });
  const scale = flags["--scale"] !== undefined ? Number(flags["--scale"]) : 2;
  const outPath = flags["--out"];

  let fileKey, nodeId;
  try {
    ({ fileKey, nodeId } = parseNodeRef(positional));
  } catch (err) {
    console.error(`usage: figma-node.mjs image <fileKey> <nodeId> [--scale 2] [--out path]\n${err.message}`);
    process.exit(1);
  }

  const token = requireToken();
  let buffer;
  try {
    const url = await fetchImageUrl(fileKey, nodeId, token, { scale });
    buffer = await downloadImage(url);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const finalPath = outPath ?? defaultImagePath(fileKey, nodeId);
  mkdirSync(dirname(finalPath), { recursive: true });
  writeFileSync(finalPath, buffer);
  const dims = pngDimensions(buffer);
  console.log(`wrote ${finalPath} (${buffer.length} bytes${dims ? `, ${dims.width}x${dims.height}` : ""})`);
}

async function cmdVars(rest) {
  const [fileKey] = rest;
  if (!fileKey) {
    console.error("usage: figma-node.mjs vars <fileKey>");
    process.exit(1);
  }

  const token = requireToken();
  let body;
  try {
    body = await fetchVariables(fileKey, token);
  } catch (err) {
    console.error(err.message);
    process.exit(err instanceof EnterpriseGatedError ? 2 : 1);
  }
  console.log(JSON.stringify(body, null, 2));
}

// Guard so this block only runs when figma-node.mjs is invoked directly, not
// when its exports are imported for tests — matches figma-capture.mjs.
const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  const [, , command, ...rest] = process.argv;
  if (command === "node") {
    await cmdNode(rest);
  } else if (command === "image") {
    await cmdImage(rest);
  } else if (command === "vars") {
    await cmdVars(rest);
  } else {
    console.error("usage: figma-node.mjs <node|image|vars> ...");
    process.exit(1);
  }
}
