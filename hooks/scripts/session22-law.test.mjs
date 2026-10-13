// 1.133.0 (lesson real-input-and-proxy-auth-2026-10-13).
// Run: node --test hooks/scripts/session22-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("webapp-testing: drive the operator's real gesture, not a DOM click", () => {
  const s = flat("skills/webapp-testing/SKILL.md");
  assert.match(s, /Drive the operator's real gesture.*a\.click\(\).*never hovers.*headed Chrome.*move, dwell, press/);
  const d = flat("skills/webapp-testing/references/DOS-AND-DONTS.md");
  assert.match(d, /real mouse \(move, dwell, press\) in headed Chrome/);
  assert.match(d, /Don't pass navigation, hover or transition work on a scripted `a\.click\(\)`/);
});

test("doer-rules: a brief names the operator's device and input", () => {
  assert.match(flat("doer-rules.md"), /names the operator's device and input.*"tap" was desktop Chrome/);
});

test("motion: frames cover the full transition duration, not a sample", () => {
  assert.match(flat("skills/motion/references/BUILD.md"), /every frame of the full transition duration.*11-frame sample passed a 2\.2 s hidden window/);
  assert.match(flat("skills/webapp-testing/SKILL.md"), /full transition duration, never a sample/);
});

test("diagnosing-bugs: a second failed round gets the recording first", () => {
  assert.match(flat("skills/diagnosing-bugs/SKILL.md"), /second round of any kind fails.*operator's recording.*before theorising.*exit-ghost/);
});

test("cloud-dispatch: Cloudflare auth comes from the egress proxy", () => {
  const c = flat("skills/cloud-dispatch/SKILL.md");
  assert.match(c, /CLOUDFLARE_API_TOKEN.*placeholder.*no `Authorization` header.*NODE_USE_ENV_PROXY=1/);
  assert.match(c, /env -u CLOUDFLARE_API_TOKEN NODE_USE_ENV_PROXY=1/);
  assert.match(c, /header-stripping fetch wrapper is refused/);
});

test("house rules: a malformed-response Workers Build is read from the log first", () => {
  assert.match(flat("skills/dispatch-brief/references/HOUSE-RULES.md"), /Received a malformed response from the API.*transient.*build log.*before bisecting code/);
});

test("1.133.0 is the current version and the top CHANGED entry", () => {
  for (const f of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) {
    assert.match(readFileSync(join(root, f), "utf8"), /"version": "1\.133\.0"/);
  }
  assert.match(flat("CHANGED.txt"), /^1\.133\.0 — `2026-10-13-1133-real-input`.*encoded: 1\.133\.0/);
});
