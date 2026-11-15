// DISC-344 (operator s95: "yes" — he starts the next orchestrator himself; supersedes DISC-320). Pins the prose that carries it:
// wrap never calls create_session for the next orchestrator (each child deepened the lineage; s95 hit depth 8 of 8 and every helper
// and send_later was refused) and ends with a one-line "start a new session" handoff. No hook or skill asks for /reload-plugins
// (the Claude app has none; DISC-341/342).
// Run: node --test hooks/scripts/disc344-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const checks = () => flat("skills/wrap/references/CLOSING-CHECKS.md");
const step = () => { const c = checks(); const i = c.indexOf("6b. "); assert.ok(i >= 0, "6b missing"); return c.slice(i, c.indexOf("6a. ", i)); };

test("AC-1: wrap does not start the next orchestrator as a child session", () => {
  const s = step();
  assert.match(s, /Hand off to the operator/);
  assert.match(s, /never calls `create_session` for the next orchestrator/);
  assert.doesNotMatch(s, /`source_url`|permission_mode|Detach to top level|opens "This is the next orchestrator session/);
  assert.doesNotMatch(flat("skills/wrap/SKILL.md"), /starts the next orchestrator session/);
});

test("AC-1: the wrap ends with the one-line start-a-new-session handoff, after the retitle and sweep", () => {
  const c = checks();
  assert.match(step(), /Start a new session to continue — this one is wrapped\./);
  assert.ok(c.indexOf("6. Retitle the session") < c.indexOf("6b. "));
  assert.ok(c.indexOf("6b. ") < c.indexOf("7. From here"));
});

test("AC-1: the chain-depth cause is recorded, and a depth refusal elsewhere means asking the operator to start a top-level session", () => {
  const s = step();
  assert.match(s, /lineage depth 8 of 8/);
  assert.match(s, /refuses `create_session`[^.]*ask the operator to start a top-level session/);
});

test("AC-1: the cockpit wrap block records that the operator starts the next session; a re-wrap does not repeat it", () => {
  assert.match(step(), /`Next session: operator starts it \(from <wrapped session id>\)`/);
});

test("AC-3: no hook or skill asks the operator for /reload-plugins", () => {
  for (const f of ["hooks/bin/plugin-freshness.mjs", "hooks/scripts/session-resume.mjs"]) {
    assert.doesNotMatch(readFileSync(join(root, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, ""), /Ask the operator for \/reload-plugins|then \/reload-plugins|or \/reload-plugins/, f);
  }
  assert.match(flat("skills/routing/references/HARD-RULES.md"), /the next fresh session picks it up/);
});
