// Tests for the automatic version-history save that runs at the start of a
// Sync (operator verdict 2026-08-01, Addendum 2 item 4: "the Figma-authored
// version posted to version history before each sync"). Sync itself stays
// manual-only — this is a step INSIDE the manual action.
//
// savePreSyncVersion() takes the Figma API surface as an argument (the only
// external boundary here), so it can be extracted by its markers and driven
// against a fake — no `figma` global needed. Same extraction technique as
// resize-dedup.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readCode() {
  return readFileSync(join(import.meta.dirname, "code.js"), "utf8");
}

function loadSavePreSyncVersion() {
  const match = /=== PRE-SYNC VERSION[\s\S]*?===\n([\s\S]*?)\n\/\/ === END PRE-SYNC VERSION ===/.exec(readCode());
  if (!match) throw new Error("PRE-SYNC VERSION markers not found in code.js");
  return new Function(`${match[1]}\nreturn savePreSyncVersion;`)();
}

const savePreSyncVersion = loadSavePreSyncVersion();
const AT = "2026-08-01T10:20:30.000Z";

test("pre-sync version: saves a version titled with the capture-figma prefix and the sync timestamp", async () => {
  const titles = [];
  const api = {
    saveVersionHistoryAsync: async (title) => {
      titles.push(title);
      return { id: "v-42" };
    },
  };
  const result = await savePreSyncVersion(api, AT);
  assert.deepEqual(titles, ["capture-figma pre-sync " + AT]);
  assert.equal(result.ok, true);
  assert.equal(result.versionId, "v-42");
  assert.equal(result.note, null);
});

test("pre-sync version: a thrown API error is reported, never rethrown (the sync must still run)", async () => {
  const api = {
    saveVersionHistoryAsync: async () => {
      throw new Error("saving is disabled in this file");
    },
  };
  const result = await savePreSyncVersion(api, AT);
  assert.equal(result.ok, false);
  assert.equal(result.skipped, false);
  assert.match(result.note, /saving is disabled in this file/);
});

test("pre-sync version: an editor without the API is reported as skipped, not as a failure to hide", async () => {
  const result = await savePreSyncVersion({}, AT);
  assert.equal(result.ok, false);
  assert.equal(result.skipped, true);
  assert.match(result.note, /version history/i);
});

test("pre-sync version: runSync saves the version BEFORE running the export", () => {
  const source = readCode();
  const fn = /async function runSync\(\) \{([\s\S]*?)\n\}/.exec(source);
  assert.ok(fn, "runSync not found");
  const body = fn[1];
  const saveAt = body.indexOf("savePreSyncVersion(");
  const exportAt = body.indexOf("runSyncExport(");
  assert.ok(saveAt !== -1, "runSync must save a pre-sync version");
  assert.ok(exportAt !== -1, "runSync must still run the export");
  assert.ok(saveAt < exportAt, "the version save must happen before the export");
});

test("pre-sync version: the outcome is threaded into the synced status detail", () => {
  const source = readCode();
  const fn = /async function runSyncExport\(([\s\S]*?)\n\}/.exec(source);
  assert.ok(fn, "runSyncExport not found");
  assert.match(fn[1], /versionNote/);
});

test("pre-sync version: the manual Save snapshot button still exists as its own action", () => {
  const source = readCode();
  assert.match(source, /msg\.type === "save-snapshot"/);
  assert.match(source, /async function saveSnapshot\(\)/);
});
