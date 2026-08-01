// Tests for the sync result line's placement (operator verdict 2026-08-01,
// Addendum 2 item 2: "N item(s) sent to listener — N warning(s)" must sit
// BELOW the sync section's buttons, not inline beside the status word).
//
// ui.html's inline <script> is DOM-coupled and has no module boundary, so
// these pin the real shipped markup/source the same way
// raw-json-lazy-render.test.mjs does — read the file, assert on its actual
// text, never a reimplementation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readUi() {
  return readFileSync(join(import.meta.dirname, "ui.html"), "utf8");
}

function readSyncSection() {
  const html = readUi();
  const match = /<section class="row" id="sync-row"[\s\S]*?<\/section>/.exec(html);
  if (!match) throw new Error("sync-row section not found in ui.html");
  return match[0];
}

function readScript() {
  const match = /<script>([\s\S]*)<\/script>/.exec(readUi());
  if (!match) throw new Error("no <script> block found in ui.html");
  return match[1];
}

test("sync result line: a dedicated #sync-result element exists in the sync section", () => {
  assert.match(readSyncSection(), /id="sync-result"/);
});

test("sync result line: it renders AFTER the sync section's button row", () => {
  const section = readSyncSection();
  const btnRowEnd = section.indexOf('id="download-btn"');
  const resultAt = section.indexOf('id="sync-result"');
  assert.ok(btnRowEnd !== -1, "sync button row not found");
  assert.ok(
    resultAt > btnRowEnd,
    "#sync-result must come after the sync buttons, not before them"
  );
});

test("sync result line: the synced status writes buildSyncedDetail() into it, not into the top status detail", () => {
  const script = readScript();
  const match = /if \(msg\.state === "synced"\) \{([\s\S]*?)\n {6}\} else if/.exec(script);
  assert.ok(match, "synced branch of handleSyncStatus not found");
  assert.match(match[1], /setSyncResult\(buildSyncedDetail\(/);
});

test("sync result line: a new sync clears the previous result before running", () => {
  const script = readScript();
  const match = /if \(msg\.state === "syncing"\) \{([\s\S]*?)\n {6}\} else if/.exec(script);
  assert.ok(match, "syncing branch of handleSyncStatus not found");
  assert.match(match[1], /setSyncResult\(""\)/);
});

test("sync result line: its spacing comes from the token scale, never a raw px literal", () => {
  const css = /<style>([\s\S]*)<\/style>/.exec(readUi())[1];
  const rule = /\.sync-result \{([\s\S]*?)\}/.exec(css);
  assert.ok(rule, ".sync-result rule not found");
  const declarations = rule[1];
  const rawPx = declarations.match(/:\s*-?\d+px/g) || [];
  assert.deepEqual(rawPx, [], "spacing/size values must reference a --space-* token");
});
