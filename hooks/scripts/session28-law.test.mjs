// 1.142.0: DISC-181 records deferred from 1.141.0 + 2026-10-16-overlay-glow-on-a-live-page. Run: node --test hooks/scripts/session28-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("agent-automation: doer-rules and HOUSE-RULES scope automation to what the lane launched", () => {
  assert.match(flat("doer-rules.md"), /Automation touches only what the lane launched.*never an unscoped `tell application.*never a prefix; a quit step names one app/);
  assert.match(flat("skills/dispatch-brief/references/HOUSE-RULES.md"), /Desktop automation.*bundle id.*never a prefix pattern/);
});
test("red build / unexplained failure / comment cites node", () => {
  assert.match(flat("doer-rules.md"), /red build or an unexplained failure.*goes back to the parent.*never re-pushed to retrigger.*cites the node, else the operator row/);
});
test("redirect on one channel: HARD-RULES 20 and the routing pointer", () => {
  assert.match(flat("skills/routing/references/HARD-RULES.md"), /Redirect a running lane on one channel.*resumes that agent.*never dispatch a second lane.*`TaskStop` the old one first/);
  assert.match(flat("skills/routing/SKILL.md"), /`SendMessage` redirect resumes that agent: no second lane/);
});
test("first slice of a new product is opus", () => {
  assert.match(flat("skills/model-routing/SKILL.md"), /First slice of a new product or tool.*`opus`.*novel architecture, no contract to point at.*later slices return to `sonnet`/);
});
test("canvas chrome tier and relayed-feedback rules", () => {
  assert.match(flat("skills/design-system/references/components.md"), /Chrome drawn in the Canvas board document.*resolves the board window's tier.*Pin the tier/);
  assert.match(flat("skills/dispatch-brief/references/BRIEF-CRAFT.md"), /Relayed operator feedback is banked as its final state with the whole sequence verbatim.*stop and report/);
});
test("cloud preview placeholder and shared DS root", () => {
  assert.match(flat("skills/present-for-review/references/PREVIEW-PROBE.md"), /push-time placeholder.*Version ID:/);
  assert.match(flat("skills/cloud-dispatch/references/ENVIRONMENT-FACTS.md"), /shared DS root.*own DS worktree.*rev-parse HEAD.*detached at `origin\/main`/);
});
test("look-yes merge runs every test that renders the touched component", () => {
  assert.match(flat("skills/routing/references/HARD-RULES.md"), /git grep -l <ComponentName> -- '\*\.test\.\*'.*not a hand-picked directory/);
});
test("measure the operator's reference before matching it", () => {
  assert.match(flat("skills/dispatch-brief/references/BRIEF-CRAFT.md"), /measured first.*number goes in the brief.*2-3 static sketches/);
  assert.match(flat("skills/grilling/SKILL.md"), /A target named by reference.*measure that reference/);
});
test("undraft ruling names what it supersedes", () => {
  assert.match(flat("skills/routing/references/HARD-RULES.md"), /Agents may mark a reviewed draft PR ready.*passing gate run and a reviewer verdict with no red finding.*supersedes "never the helper"/);
  assert.match(flat("skills/release-deploy/references/RELEASE-PATH.md"), /2026-10-15-agents-may-undraft-reviewed-prs/);
});
test("application UI uses the panel kit", () => {
  assert.match(flat("skills/design-system/SKILL.md"), /Application UI uses the panel kit.*panel-kit\.css.*Action\/Badge/);
  assert.match(flat("skills/design-system/references/components.md"), /CV prefix.*row-add\.mjs/);
});
test("session titles", () => {
  assert.match(flat("output-styles/discipline.md"), /← talk here.*Helper · <task in plain words> — no action needed.*\(wrapped\)/);
  assert.match(flat("skills/wrap/references/CLOSING-CHECKS.md"), /drop "← talk here"/);
});
test("overlay glow: five rules in TECHNICAL-DESIGN, strength rule in motion", () => {
  const t = flat("skills/design-craft/references/TECHNICAL-DESIGN.md");
  assert.match(t, /Parse a computed colour by its form.*`color\(srgb/);
  assert.match(t, /Re-read a target's surface on every re-measure/);
  assert.match(t, /non-isolated ancestors.*left\/top.*registered custom property/);
  assert.match(t, /samples the painted rect.*getBoundingClientRect/);
  assert.match(t, /Read token ramps whole.*sort -u/);
  assert.match(flat("skills/motion/references/BUILD.md"), /registered custom property inside its mask, never opacity/);
});
