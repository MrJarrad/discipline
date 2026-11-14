// DISC-320 (operator s85): wrap starts the next orchestrator session, nested, and the operator detaches it.
// Pins the prose that carries it; the prose is the mechanism (no script builds the call).
// Run: node --test hooks/scripts/disc320-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const checks = () => flat("skills/wrap/references/CLOSING-CHECKS.md");

test("disc320: the wrap skill's last step names the next-session start and keeps the stand-down", () => {
  const w = flat("skills/wrap/SKILL.md");
  assert.match(w, /starts the next orchestrator session/);
  assert.match(w, /wrapped — inactive/);
});

test("disc320: the start comes after the retitle and helper sweep, before the session goes quiet", () => {
  const c = checks();
  const at = (s) => { const i = c.indexOf(s); assert.ok(i >= 0, `missing: ${s}`); return i; };
  assert.ok(at("6. Retitle the session") < at("6b. Start the next session"));
  assert.ok(at("6b. Start the next session") < at("7. From here"));
});

test("disc320: create_session carries the title pattern, the vault as source, inherited environment, auto permission", () => {
  const c = checks();
  assert.match(c, /`create_session`/);
  assert.match(c, /`<projects> · <D Mon> ← talk here`/);
  assert.match(c, /`source_url` the vault repo/);
  assert.match(c, /`environment_id` omitted/);
  assert.match(c, /`permission_mode: "auto"`/);
});

test("disc320: the prompt resumes an orchestrator, not a helper", () => {
  const c = checks();
  assert.match(c, /opens "This is the next orchestrator session, started by <wrapped session id> at wrap\."/);
  assert.match(c, /no `~\/\.claude\/helper-session` step/);
});

test("disc320: a re-wrap never starts a second next session", () => {
  assert.match(checks(), /if the cockpit wrap block already names a `Next session:` id, skip this step/);
});

test("disc320: the operator gets one step, the sidebar detach, and the detach result is not claimed", () => {
  const c = checks();
  assert.match(c, /one step left for you: right-click it in the sidebar and choose Detach to top level/);
  assert.match(c, /whether a detached session still receives helper messages is unverified/);
});

test("disc320: the new session is a parent, so the archive rule still protects it", () => {
  assert.match(flat("skills/routing/references/HARD-RULES.md"), /wrapped, "← talk here" or otherwise, is a parent, lands in no list, and is never passed to `archive_session` by any session/);
});
