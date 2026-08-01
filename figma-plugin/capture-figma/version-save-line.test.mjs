// Tests for the pre-sync version-save line's placement (operator verdict
// 2026-08-01, Addendum 6 item 1: "capture-figma pre-sync <ts>" must get the
// SAME treatment as the timings line — its own full-width line, small-gray
// monospace-ish styling, positioned below its section's controls — instead
// of being crammed into the snapshot row's status-detail slot next to
// "Snapshot saved". The snapshot row's status detail goes back to short
// states only.
//
// Same read-the-real-file technique as sync-result-placement.test.mjs — no
// module boundary in ui.html's inline <script>.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readUi() {
  return readFileSync(join(import.meta.dirname, "ui.html"), "utf8");
}

function readSnapshotSection() {
  const html = readUi();
  const match = /<section class="row" id="snapshot-row"[\s\S]*?<\/section>/.exec(html);
  if (!match) throw new Error("snapshot-row section not found in ui.html");
  return match[0];
}

function readScript() {
  const match = /<script>([\s\S]*)<\/script>/.exec(readUi());
  if (!match) throw new Error("no <script> block found in ui.html");
  return match[1];
}

test("version-save line: a dedicated #snapshot-version element exists in the snapshot section", () => {
  assert.match(readSnapshotSection(), /id="snapshot-version"/);
});

test("version-save line: it renders AFTER the snapshot section's button row", () => {
  const section = readSnapshotSection();
  const btnRowEnd = section.indexOf('id="snapshot-btn"');
  const versionAt = section.indexOf('id="snapshot-version"');
  assert.ok(btnRowEnd !== -1, "snapshot button not found");
  assert.ok(
    versionAt > btnRowEnd,
    "#snapshot-version must come after the snapshot button, not before it"
  );
});

test("version-save line: it shares the timing line's small-gray monospace treatment, not a bespoke rule", () => {
  const css = /<style>([\s\S]*)<\/style>/.exec(readUi())[1];
  const timingRule = /\.sync-timing \{([\s\S]*?)\}/.exec(css);
  const versionRule = /\.snapshot-version \{([\s\S]*?)\}/.exec(css);
  assert.ok(timingRule, ".sync-timing rule not found");
  assert.ok(versionRule, ".snapshot-version rule not found");
  const norm = (s) => s.trim().split(/\s*;\s*/).filter(Boolean).sort();
  assert.deepEqual(
    norm(versionRule[1]),
    norm(timingRule[1]),
    ".snapshot-version must declare the exact same properties as .sync-timing"
  );
});

test("version-save line: its spacing comes from the token scale, never a raw px literal", () => {
  const css = /<style>([\s\S]*)<\/style>/.exec(readUi())[1];
  const rule = /\.snapshot-version \{([\s\S]*?)\}/.exec(css);
  assert.ok(rule, ".snapshot-version rule not found");
  const rawPx = rule[1].match(/:\s*-?\d+px/g) || [];
  // font-size:10px matches the timing line's own literal (an intentional
  // shared constant, not a spacing token) — only reject a literal on a
  // margin/padding declaration.
  const spacingRaw = rawPx.filter((v) => !/font-size/.test(rule[1].split(v)[0].split(";").pop()));
  assert.deepEqual(spacingRaw, [], "spacing values must reference a --space-* token, not a raw px literal");
});

test("version-save line: a successful pre-sync save writes the title into setSnapshotVersion, not into the status detail", () => {
  const script = readScript();
  const match = /if \(version\.ok\) \{([\s\S]*?)\n {4}\} else if \(!version\.skipped\)/.exec(script) ||
    /msg\.state === "saved"[\s\S]*?\n {6}\}/.exec(script);
  // Find the "saved" branch of handleSnapshotStatus, which is what actually
  // renders the postMessage into the DOM.
  const savedBranch = /\} else if \(msg\.state === "saved"\) \{([\s\S]*?)\n {6}\} else if/.exec(script);
  assert.ok(savedBranch, "'saved' branch of handleSnapshotStatus not found");
  assert.match(savedBranch[1], /setSnapshotVersion\(/, "the saved branch must call setSnapshotVersion(...)");
  assert.doesNotMatch(
    savedBranch[1],
    /setSnapshotRow\("purple",\s*"Snapshot saved",\s*msg\.title/,
    "the version title must not be threaded into setSnapshotRow's short detail slot"
  );
});

test("version-save line: every other snapshot state clears the version line so it doesn't carry stale text", () => {
  const script = readScript();
  const fn = /function handleSnapshotStatus\(msg\) \{([\s\S]*?)\n {4}\}\n/.exec(script);
  assert.ok(fn, "handleSnapshotStatus not found");
  const body = fn[1];
  // Every branch other than "saved" must clear the version line — count the
  // non-"saved" state branches and confirm setSnapshotVersion("") appears at
  // least that many times (once per branch), so no branch silently leaves a
  // previous save's title on screen.
  const nonSavedBranches = (body.match(/msg\.state === "(unavailable|ready|error)"/g) || []).length;
  assert.ok(nonSavedBranches >= 3, "expected unavailable/ready/error branches in handleSnapshotStatus");
  const clears = (body.match(/setSnapshotVersion\(""\)/g) || []).length;
  assert.ok(clears >= nonSavedBranches, `expected setSnapshotVersion("") on every non-saved branch, found ${clears} for ${nonSavedBranches} branches`);
});
