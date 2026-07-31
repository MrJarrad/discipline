// Guards code.js's PLUGIN_VERSION constant against drift from
// .claude-plugin/plugin.json's "version" — the repo's single real version
// marker. There is no build step for this plugin (manifest.json points
// directly at code.js, no bundler), so PLUGIN_VERSION is a hand-maintained
// constant that must be bumped in the SAME commit as every plugin.json
// version bump. This test is the mechanical drift guard: it fails CI the
// moment the two disagree, instead of relying on a human remembering both
// edits (header.pluginVersion previously drifted this way — 1.14.0 in
// code.js while plugin.json was already at 1.15.0).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("version-sync: code.js's PLUGIN_VERSION matches .claude-plugin/plugin.json's version", () => {
  const codeJs = readFileSync(join(import.meta.dirname, "code.js"), "utf8");
  const pluginJson = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "..", ".claude-plugin", "plugin.json"), "utf8")
  );

  const match = /const PLUGIN_VERSION = "([^"]+)"/.exec(codeJs);
  assert.ok(match, "code.js must declare a PLUGIN_VERSION string constant");
  assert.equal(match[1], pluginJson.version);
});
