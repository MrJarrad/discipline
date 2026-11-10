// DISC-288: wrap and pause-resume point at the pinned-checklist reconcile (Running now) and the Done-this-session clear.
// Run: node --test hooks/scripts/disc288-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(repo, p), "utf8").replace(/\s+/g, " ");

test("wrap brings the checklist's Running now current and empties Done this session", () => {
  assert.match(flat("skills/wrap/SKILL.md"), /Bring the pinned checklist current/);
  const t = flat("skills/wrap/references/SECTIONS.md");
  assert.match(t, /queue-page-sync\.mjs/);
  assert.match(t, /"Running now" item with `get_session`/);
  assert.match(t, /delete every `clearAtWrap`\s+line so "Done this session" starts empty/);
});
test("pause-resume reconciles Running now on resume and at pause", () => {
  const t = flat("skills/pause-resume/SKILL.md");
  assert.match(t, /queue-page-sync\.mjs/);
  assert.match(t, /"Running now" .{0,80}`get_session`/);
});
test("the output style carries the same reconcile and clear it points to", () => {
  const t = flat("output-styles/discipline.md");
  assert.match(t, /queue-page-sync\.mjs/);
  assert.match(t, /empty "Done this session"/);
});
