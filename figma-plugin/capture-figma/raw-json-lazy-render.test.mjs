// Tests for ui.html's stringify-once + lazy Raw JSON render fix (lag
// diagnosis finding 3: JSON.stringify(data, null, 2) on the full export
// payload used to run twice, synchronously, on every Sync — once in
// enableCopyDownload(), once in populateRawJson() — even with the Raw JSON
// <details> panel collapsed.
//
// ui.html's inline <script> has no module boundary (it's a plugin iframe
// with no bundler, DOM-coupled throughout — document.getElementById,
// customElements, HTMLElement checks at parse time) so it can't be imported
// and exercised the way schema-v2-transform.mjs's pure functions can. These
// assertions instead pin the actual shipped source, the same technique
// version-sync.test.mjs and the schema-v2-transform sync-check test already
// use for source-embedded invariants: read the real file, assert on its
// real text, not a reimplementation of its logic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readScript() {
  const html = readFileSync(join(import.meta.dirname, "ui.html"), "utf8");
  const match = /<script>([\s\S]*)<\/script>/.exec(html);
  if (!match) throw new Error("no <script> block found in ui.html");
  return match[1];
}

test("raw-json lazy render: JSON.stringify(data, null, 2) — the full-export stringify — appears exactly once", () => {
  const script = readScript();
  const occurrences = script.match(/JSON\.stringify\(data, null, 2\)/g) || [];
  assert.equal(
    occurrences.length,
    1,
    "expected exactly one full-payload stringify (in enableCopyDownload); populateRawJson must reuse lastExportJson instead"
  );
});

test("raw-json lazy render: the sole stringify lives inside enableCopyDownload", () => {
  const script = readScript();
  const fnMatch = /function enableCopyDownload\(data\) \{([\s\S]*?)\n    \}/.exec(script);
  assert.ok(fnMatch, "enableCopyDownload function not found");
  assert.match(fnMatch[1], /JSON\.stringify\(data, null, 2\)/);
});

test("raw-json lazy render: populateRawJson (the old always-stringify function) no longer exists", () => {
  const script = readScript();
  assert.equal(/function populateRawJson/.test(script), false);
});

test("raw-json lazy render: renderRawJsonIfNeeded fills rawJsonOutput from lastExportJson, not a fresh stringify", () => {
  const script = readScript();
  const fnMatch = /function renderRawJsonIfNeeded\(\) \{([\s\S]*?)\n    \}/.exec(script);
  assert.ok(fnMatch, "renderRawJsonIfNeeded function not found");
  assert.match(fnMatch[1], /rawJsonOutput\.textContent = lastExportJson/);
  assert.equal(/JSON\.stringify/.test(fnMatch[1]), false);
});

test("raw-json lazy render: export-result handler only renders the Raw JSON panel when it's already open", () => {
  const script = readScript();
  const handlerMatch = /if \(msg\.type === "export-result"\) \{([\s\S]*?)\n {6}\}/.exec(script);
  assert.ok(handlerMatch, "export-result handler not found");
  assert.match(handlerMatch[1], /if \(rawJsonDetails\.open\) renderRawJsonIfNeeded\(\);/);
});

test("raw-json lazy render: the <details> toggle listener still renders on open (Copy/Download work immediately, panel fills lazily)", () => {
  const script = readScript();
  const toggleMatch = /rawJsonDetails\.addEventListener\("toggle", \(\) => \{([\s\S]*?)\n {4}\}\);/.exec(script);
  assert.ok(toggleMatch, "rawJsonDetails toggle listener not found");
  assert.match(toggleMatch[1], /if \(rawJsonDetails\.open\) renderRawJsonIfNeeded\(\);/);
});

test("raw-json lazy render: enableCopyDownload still revokes the previous ObjectURL before creating the next one (hygiene preserved)", () => {
  const script = readScript();
  const fnMatch = /function enableCopyDownload\(data\) \{([\s\S]*?)\n    \}/.exec(script);
  assert.ok(fnMatch);
  assert.match(fnMatch[1], /URL\.revokeObjectURL\(currentDownloadUrl\)/);
  assert.match(fnMatch[1], /currentDownloadUrl = URL\.createObjectURL\(blob\)/);
});
