// Tests for the UI half of jump-to-node (operator request 2026-08-02): every
// "where it shows up" entry becomes clickable (selects + scrolls the node in
// canvas) and gets a copy-deep-link affordance. ui.html's inline <script> is
// DOM-coupled and has no module boundary, so these pin the real shipped
// markup/source the same way sync-result-placement.test.mjs does — read the
// file, assert on its actual text, never a reimplementation. The pure
// resolution logic (resolveJumpTarget etc.) lives in code.js and is unit-
// tested directly in jump-to-node.test.mjs; this file is the DOM-wiring half
// that can't run without a real `document`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readUi() {
  return readFileSync(join(import.meta.dirname, "ui.html"), "utf8");
}

function readScript() {
  const match = /<script>([\s\S]*)<\/script>/.exec(readUi());
  if (!match) throw new Error("no <script> block found in ui.html");
  return match[1];
}

function readCss() {
  return /<style>([\s\S]*)<\/style>/.exec(readUi())[1];
}

test("jump-to-node: each occurrence <li> is built through buildOccurrenceListItem, not a bare textContent assignment", () => {
  const script = readScript();
  const loopMatch = /for \(const entry of entries\.slice\(0, WARNING_SAMPLE_LIMIT\)\) \{([\s\S]*?)\n {10}\}/.exec(script);
  assert.ok(loopMatch, "the WARNING_SAMPLE_LIMIT occurrence loop was not found");
  assert.match(loopMatch[1], /buildOccurrenceListItem\(entry\)/);
});

test("jump-to-node: clicking the jump button posts {type:\"jump-to-node\", nodeId} to code.js", () => {
  const script = readScript();
  const fnMatch = /function requestJumpToNode\(nodeId\) \{([\s\S]*?)\n {4}\}/.exec(script);
  assert.ok(fnMatch, "requestJumpToNode not found");
  assert.match(fnMatch[1], /pluginMessage:\s*\{\s*type:\s*"jump-to-node",\s*nodeId:\s*nodeId\s*\}/);
});

test("jump-to-node: the jump button disables itself (never a dead click) when an occurrence has no nodeId", () => {
  const script = readScript();
  const fnMatch = /function buildOccurrenceListItem\(entry\) \{([\s\S]*?)\n {4}\}/.exec(script);
  assert.ok(fnMatch, "buildOccurrenceListItem not found");
  const body = fnMatch[1];
  assert.match(body, /if \(entry\.nodeId\) \{/);
  assert.match(body, /jump\.disabled = true/);
});

test("jump-to-node: the copy-deep-link button disables itself with a tooltip when there's no live fileKey", () => {
  const script = readScript();
  const fnMatch = /function buildOccurrenceListItem\(entry\) \{([\s\S]*?)\n {4}\}/.exec(script);
  const body = fnMatch[1];
  assert.match(body, /const deepLink = buildNodeDeepLink\(currentFileKey, entry\.nodeId\)/);
  assert.match(body, /copy\.disabled = true/);
  assert.match(body, /copy\.title = /);
});

test("jump-to-node: the deep-link URL is Figma's own design/?node-id= shape, hyphenating the colon-separated node id", () => {
  const script = readScript();
  const fnMatch = /function buildNodeDeepLink\(fileKey, nodeId\) \{([\s\S]*?)\n {4}\}/.exec(script);
  assert.ok(fnMatch, "buildNodeDeepLink not found");
  assert.match(fnMatch[1], /https:\/\/www\.figma\.com\/design\//);
  assert.match(fnMatch[1], /node-id=/);
  assert.match(fnMatch[1], /figmaNodeUrlId\(nodeId\)/);

  const idFnMatch = /function figmaNodeUrlId\(nodeId\) \{([\s\S]*?)\n {4}\}/.exec(script);
  assert.ok(idFnMatch, "figmaNodeUrlId not found");
  assert.match(idFnMatch[1], /replace\(\/:\/g, "-"\)/);
});

test("jump-to-node: buildNodeDeepLink returns null (no broken link) when fileKey or nodeId is missing", () => {
  const script = readScript();
  const fnMatch = /function buildNodeDeepLink\(fileKey, nodeId\) \{([\s\S]*?)\n {4}\}/.exec(script);
  assert.match(fnMatch[1], /if \(!fileKey \|\| !nodeId\) return null;/);
});

test("jump-to-node: currentFileKey is refreshed from the LIVE header on every renderCounts call, defaulting to null (never stale across a restore)", () => {
  const script = readScript();
  const fnMatch = /function renderCounts\(data\) \{([\s\S]*?)const varEntries/.exec(script);
  assert.ok(fnMatch, "renderCounts's header-read prologue not found");
  assert.match(fnMatch[1], /currentFileKey = header\.fileKey \|\| null;/);
});

test("jump-to-node: a jump-to-node-result message renders through the shared setJumpStatus, never a raw error/stack", () => {
  const script = readScript();
  const handlerMatch = /if \(msg\.type === "jump-to-node-result"\) \{([\s\S]*?)\n {4}\}/.exec(script);
  assert.ok(handlerMatch, "jump-to-node-result handler not found");
  assert.match(handlerMatch[1], /setJumpStatus\(msg\.message, !msg\.ok\)/);
});

test("jump-to-node: the copy affordance reuses the SAME clipboard helper as the main Copy button — no second clipboard implementation", () => {
  const script = readScript();
  const copyBtnMatch = /copyBtn\.addEventListener\("click", \(\) => \{([\s\S]*?)\n {4}\}\);/.exec(script);
  assert.ok(copyBtnMatch, "copyBtn click handler not found");
  assert.match(copyBtnMatch[1], /copyTextToClipboard\(lastExportJson\)/);

  const occurrenceCopyMatch = /function buildOccurrenceListItem\(entry\) \{([\s\S]*?)\n {4}\}/.exec(script);
  assert.match(occurrenceCopyMatch[1], /copyTextToClipboard\(deepLink\)/);

  // Only one function definition of the clipboard-write logic itself.
  const definitions = script.match(/function copyTextToClipboard\(/g) || [];
  assert.equal(definitions.length, 1, "clipboard-write logic must not be duplicated");
});

test("jump-to-node: entries become obviously clickable — cursor:pointer and a hover rule reusing the existing 120ms-ease transition idiom, never a layout-affecting property", () => {
  const css = readCss();
  const jumpRule = /\.warn-sample-jump \{([\s\S]*?)\}/.exec(css);
  assert.ok(jumpRule, ".warn-sample-jump rule not found");
  assert.match(jumpRule[1], /cursor:\s*pointer/);
  assert.match(jumpRule[1], /transition:\s*background-color 120ms ease/, "must match the .btn hover idiom's own timing");

  const hoverRule = /\.warn-sample-jump:hover:not\(:disabled\) \{([\s\S]*?)\}/.exec(css);
  assert.ok(hoverRule, "hover rule not found");
  // GPU-safe / non-layout-affecting: no width/height/margin/padding/top/left
  // change on hover, only background-color/color.
  assert.equal(/\b(width|height|margin|padding|top|left|right|bottom)\s*:/.test(hoverRule[1]), false);
});

test("jump-to-node: the copy button also disables via CSS opacity, never leaves a clickable-looking but dead control", () => {
  const css = readCss();
  const disabledRule = /\.warn-sample-copy:disabled \{([\s\S]*?)\}/.exec(css);
  assert.ok(disabledRule, ".warn-sample-copy:disabled rule not found");
  assert.match(disabledRule[1], /cursor:\s*default/);
});
