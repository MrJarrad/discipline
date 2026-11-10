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
  assert.match(flat("skills/wrap/SKILL.md"), /the pinned-checklist sync \(\[SECTIONS\.md\]/);
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

test("A: the style's status paragraph is one rule — new asks plus the checklist link, the queue in full on the checklist", () => {
  const t = flat("output-styles/discipline.md");
  assert.doesNotMatch(t, /the operator queue, in full, for this session's projects\.\*\* \*\*Status stays out/);
  assert.match(t, /\*\*Every status reply ends with "Needed from you" — this turn's new asks plus one link line to the pinned checklist/);
});
test("B: wrap and pause-resume no longer say the reply prints the rows in full", () => {
  assert.doesNotMatch(flat("skills/wrap/SKILL.md"), /wrap reply prints the rows in full/);
  assert.match(flat("skills/wrap/SKILL.md"), /wrap reply carries new asks and the checklist link \(`needed-from-you\.mjs --projects <prefixes> --short --new <ids>`\)/);
  assert.doesNotMatch(flat("skills/pause-resume/SKILL.md"), /prints the rows, in full, in the pause reply/);
  assert.doesNotMatch(flat("skills/present-for-review/SKILL.md"), /queue in full\*\* — the session's projects' open rows/);
});
test("N2: pause-resume brings Running now current in the Pause steps, not on the Resume line", () => {
  const t = readFileSync(join(repo, "skills/pause-resume/SKILL.md"), "utf8");
  const pause = t.slice(t.indexOf("## Pause"), t.indexOf("## Resume")).replace(/\s+/g, " ");
  const resume = t.slice(t.indexOf("## Resume"), t.indexOf("## Not wrap")).replace(/\s+/g, " ");
  assert.match(pause, /"Running now" .{0,120}`get_session`/);
  assert.doesNotMatch(resume, /at pause/);
});
test("N3: wrap keeps one handover file per touched project and never one rewrite for several", () => {
  assert.match(flat("skills/wrap/SKILL.md"), /one file per touched project/);
  assert.match(flat("skills/wrap/references/SECTIONS.md"), /cockpit patch \+ project files \(not one rewrite\)/);
});
