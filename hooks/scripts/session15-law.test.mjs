// The 1.115.0 items. Run: node --test hooks/scripts/session15-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

test("s15 item 2: operator-rules checkpoint stages named paths, never git add -A", () => {
  const t = read("operator-rules.md");
  assert.doesNotMatch(t, /git add -A/);
  assert.match(t, /git add <named paths>/);
});

test("s15: version 1.119.0 in both manifests and CHANGED entries (1.115.0 through 1.119.0)", () => {
  assert.match(read(".claude-plugin/plugin.json"), /"version": "1.119.0"/);
  assert.match(read(".claude-plugin/marketplace.json"), /"version": "1.119.0"/);
  assert.match(read("CHANGED.txt"), /^1\.117\.0 — /m);
  assert.match(read("CHANGED.txt"), /^1\.116\.0 — /m);
  assert.match(read("CHANGED.txt"), /^1\.115\.0 — /m);
});

test("s15 1.117.0: CHANGED entry for lists-never-stale", () => {
  assert.match(read("CHANGED.txt"), /^1\.117\.0 — .*lists-never-stale/m);
});

test("lists-never-stale: the parent never relays an unchecked status (output style + routing)", () => {
  assert.match(read("output-styles/discipline.md"), /never relayed unchecked/);
  assert.match(read("output-styles/discipline.md"), /list-drift-check\.mjs/);
  assert.match(read("skills/routing/SKILL.md"), /Never relay a backlog or queue status unchecked.*list-drift-check\.mjs/);
});

test("lists-never-stale: lane-end row and wrap both run the drift check", () => {
  assert.match(read("skills/routing/SKILL.md"), /backlog-row flip.*drift check/);
  assert.match(read("skills/wrap/SKILL.md"), /list-drift-check\.mjs/);
  const ref = read("skills/wrap/references/REPORT-AND-LEARN.md");
  assert.match(ref, /## Lists are never stale/);
  for (const s of ["open", "waiting on operator", "in flight (<PR>)", "done (<PR> <sha>)", "moot (<reason>)"]) assert.ok(ref.includes(s), s);
});

test("1.116.0 review N1/N4: pointers match the heading; context-fill states the marker TTL", () => {
  assert.doesNotMatch(read("agents/reviewer.md"), /`wrap` § Follow-ups;/);
  assert.match(read("hooks/bin/context-fill.mjs"), /older than 10 minutes counts as manual/);
});
