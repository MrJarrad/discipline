// Parent lessons s77 and s78 (vault fleet/lessons/2026-11-10-s77-parent-lessons.md, s78-parent-lessons.md) and
// DISC-289, DISC-290, DISC-292: one assertion per encoded rule. Run: node --test hooks/scripts/session77-78-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const has = (p, s) => assert.ok(flat(p).includes(s), `${p} lacks: ${s}`);
const HARD = "skills/routing/references/HARD-RULES.md";
const HOUSE = "skills/dispatch-brief/references/HOUSE-RULES.md";

test("s77 1: a helper brief ends at the PR rung; the parent merges", () => {
  has(HARD, "a helper brief ends at \"PR open, review-ready\" and never asks for a merge; the parent merges reviewed PRs itself");
  has(HARD, "DON'T: message a helper \"now merge it\"");
});
test("s77 2: archive from the creating session at lane close; try the call before calling it impossible", () => {
  has("skills/cloud-dispatch/references/HELPER-SESSIONS.md", "Archive from the session that created the helper, at its lane close, and try the call before saying it cannot be done");
});
test("s77 3: scripts run from the newest plugin copy, or the version is named", () => {
  has(HARD, "in a cloud session run list and gate scripts from the newest plugin copy on disk, or name the version that ran");
});
test("s77 4: list-drift-check runs locally before every vault push that touches a list", () => {
  has("skills/vault-write/references/WRITING.md", "Run `list-drift-check.mjs` locally before every vault push that touches a list");
});
test("s78 1: session start banks the checklist doc's unread answers before the first status", () => {
  has(HARD, "before the first status, read the pinned checklist doc's comment threads addressed to Claude, answered or not, since the last wrap, and bank each");
});
test("s78 2 and DISC-289: a wrap PR carries no review/ Mac job without a verdict; the gate treats queue/mac as not notes-only", () => {
  has("skills/cloud-dispatch/references/MAC-JOBS.md", "A wrap PR carries no `queue/mac/` job without a reviewer verdict on that PR");
  has("skills/wrap/references/CLOSING-CHECKS.md", "A wrap PR that adds a `queue/mac/` job is merged only with a reviewer verdict on that PR");
  has("hooks/scripts/merge-after-review.mjs", "!/^queue\\/mac\\//.test(p)");
});
test("s78 3: every preview round pushes a new preview/* ref; build status from the builds API", () => {
  has("skills/present-for-review/references/PREVIEW-PROBE.md", "push every new preview round to a new `preview/*` ref and read build status from the Cloudflare builds API");
  has(HOUSE, "every new preview round pushes to a new `preview/*` ref");
});
test("s78 4: a list built from the backlog is drift-checked and grepped for dropped/parked before it is shown", () => {
  has(HARD, "`list-drift-check.mjs --repo <paths>` with the product repo attached for each row's cited PRs, and grep the decisions for \"dropped\" and \"parked\"");
});
test("s78 5: helper returns only for a final result, red CI, a review comment or a real change", () => {
  has(HOUSE, "send the parent a message only for a final result, red CI, a review comment or a real change; never per poll or per Cloudflare-bot edit");
});
test("DISC-290: wrap clears ticked Waiting on you items whose row is closed, as it clears Done", () => {
  has("skills/wrap/references/SECTIONS.md", "`clearAtWrap` also holds ticked \"Waiting on you\" items whose row is closed (DISC-290)");
  has("hooks/scripts/queue-page-sync.mjs", "if (ticked && !open.has(id)) plan.clearAtWrap.push(line.trim());");
});
test("DISC-292: only a write form on the cockpit counts as a cockpit write", () => {
  has("hooks/bin/helper-sweep-stop.mjs", "&& writesCockpit(inp.command))");
});
