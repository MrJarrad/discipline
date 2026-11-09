// Parent lessons s61–s68 (vault fleet/lessons/2026-11-0{7,8,9}-s6x-parent-lessons.md), one assertion per encoded rule.
// Run: node --test hooks/scripts/session61-68-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const has = (p, s) => assert.ok(flat(p).includes(s), `${p} lacks: ${s}`);
const HS = "skills/cloud-dispatch/references/HELPER-SESSIONS.md";
const WR = "skills/vault-write/references/WRITING.md";

test("s61 1: every helper passes permission_mode auto, and a hook denies create_session without one", () => {
  has(HS, 'Pass `permission_mode: "auto"` on every helper');
  const hooks = JSON.parse(readFileSync(join(root, "hooks/hooks.json"), "utf8")).hooks.PreToolUse;
  assert.ok(hooks.some((h) => h.matcher === "mcp__claude-code-remote__create_session" && h.hooks.some((x) => x.command.includes("helper-create-gate.mjs"))));
});

test("s61 3 / s63 1: briefs on vault main; never ask a helper to merge against its brief", () => {
  has(HS, "**A brief kept as a vault file is merged to vault main before dispatch**");
  has(HS, "**Never ask a helper to merge when its brief forbids merging**");
});

test("s63 4 / s64 3 / s65 3: read the source before relaying a negative; bullets name the last report", () => {
  has(HS, "**Read the source before relaying a negative**");
  has(HS, "Each `## Build in Progress` bullet names when the helper last reported; past 30 minutes of silence, `get_session` and nudge");
});

test("s64 4 / s67 3: a go or correction that may have crossed is resent verbatim", () => {
  has(HS, "resend it verbatim in one line, with the decision it belongs to; never assume it landed");
});

test("s64 2 / s67 4: a cloud parent compares the loaded plugin with the release", () => {
  has("skills/pause-resume/SKILL.md", "A cloud parent passes `--released <version>` read from discipline main's `.claude-plugin/plugin.json`");
});

test("s62 1, 5 / s67 5 / s68 2, 3: third-party and capability claims are checked at the source", () => {
  has("output-styles/discipline.md", "A claim about a third-party tool, our access to it, or what a product can do, in his text or a brief, is checked at the source first");
});

test("s62 2 / s63 3 / s68 1: vault PR order", () => {
  has(WR, "**Merge a vault PR only after its checks complete**");
  has(WR, "**Never reset a branch while one of its PRs is open**");
  has(WR, "**While a reviewed vault PR is open, new notes go on a branch that touches none of its files, or wait for its merge**");
});

test("s66 5: history files keep what was true then", () => {
  has(WR, "**History files keep what was true then**");
});

test("s67 2: on a row-number collision the branch that merges second renumbers", () => {
  has(WR, "**On a row-number collision, the branch that merges second renumbers**");
});

test("s65 1, 4: a fixed look link cites before/after by URL and the widths measured", () => {
  has("skills/present-for-review/references/PREVIEW-PROBE.md", '**A "fixed" look link cites its before and after by URL, and the widths measured**');
  has("skills/present-for-review/references/PREVIEW-PROBE.md", "A local production-build number counts only with that build's own startup line shown.");
});

test("s66 2: a symptom without its trigger gets one question first", () => {
  has("skills/issue-triage/references/TRIAGE-PROCEDURE.md", "**A symptom named without its trigger**");
});

test("s67 6: a login-needing Mac job waits for the operator's sign-in", () => {
  has("skills/cloud-dispatch/references/MAC-JOBS.md", "**A job that needs the operator's login is queued only after he signs in and confirms**");
});

test("s68 5: a branch switch runs on its own line", () => {
  has("doer-rules.md", "**A branch switch (`checkout -B`, `switch`) runs on its own line**");
});
