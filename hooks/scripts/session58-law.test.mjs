// s58 backlog clearing: the rule sentences DISC-249, DISC-244 and DISC-246 add, pinned where they live.
// Run: node --test hooks/scripts/session58-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const HS = "skills/cloud-dispatch/references/HELPER-SESSIONS.md";

// DISC-249 (s54, HT-57/58): "why am i needing to grant permissions all of a sudden". A helper that finds
// mid-lane it needs another repo and calls add_repo itself is refused as a self-granted permission, so the ask
// lands on the operator. The brief lists every repo with its access; the helper attaches them all first.
test("DISC-249: the brief lists every repo with its access, the helper attaches them all first, anything else is next: parent", () => {
  const h = flat(HS);
  assert.ok(h.includes("**The brief lists every repo the lane touches, each with its access level** (`read` or `push`)"));
  assert.ok(h.includes("attaches every listed repo with `add_repo` as its first step, before any work"));
  assert.ok(h.includes("A repo the brief did not list is `next: parent`, never a question to the operator"));
  assert.ok(flat("doer-rules.md").includes("A repo the brief did not list: `next: parent`, never an `add_repo` of your own and never a question to the operator (DISC-249)."));
});

// DISC-244 (HB-223, 2026-11-02): the before/after delta for moving a panel onto a shared kit measured sizes
// only; the look round caught a square switch track (a Tailwind-only --radius-full absent in a non-Tailwind
// consumer), lost dividers and shadow. A kit swap's delta lists every property the kit draws and checks every var().
test("DISC-244: a kit-swap delta lists every visual property the kit draws and checks every var() resolves in the consumer", () => {
  const a = flat("skills/audit-build/SKILL.md");
  assert.ok(a.includes("## Swapping a panel onto a shared kit"));
  assert.ok(a.includes("lists every visual property the kit draws (radius, border, shadow, colour, font, motion), not sizes alone"));
  assert.ok(a.includes("every `var()` the kit reads resolves in the consumer"));
  assert.ok(a.includes("HB-223"));
});

// DISC-246 (s50/s51, DS #152, pf #423, #442): reviewer verdicts the merge-review-gate did not accept were
// re-posted before merges. The reviewer's § Verdict ended on "merge condition met / not met" while the gate
// reads a `merge: yes|no` line; and a bulleted `- merge: yes` was refused.
import { reviewVerdict } from "./merge-after-review.mjs";

test("DISC-246: the verdict block reviewer.md § Verdict asks for is the one reviewVerdict accepts", () => {
  const r = flat("agents/reviewer.md");
  assert.ok(r.includes("end on the verdict line **`merge: yes — n red, n amber.`** (or `merge: no — …`)"));
  assert.ok(!r.includes("merge condition met / not met"), "the old bottom line, which the gate cannot read, is gone");
  const post = (body) => [{ author: { login: "MrJarrad" }, at: "2026-11-02T10:00:00Z", body }];
  const head = "c7868b2aaaa";
  // a post built exactly as § Verdict says
  assert.equal(reviewVerdict(post("## Review — round 1 of 2, tier LIGHT — head c7868b2\n\nfindings…\n\n**merge: yes — 0 red, 2 amber.**"), head, ["MrJarrad"]).verdict, "yes");
  assert.equal(reviewVerdict(post("## Review — round 1 of 2 — head c7868b2\n\n**merge: no — 1 red, 0 amber.**"), head, ["MrJarrad"]).verdict, "no");
  // a markdown list marker or quote before the verdict line is still the verdict line
  assert.equal(reviewVerdict(post("## Review — head c7868b2\n\n- merge: yes"), head, ["MrJarrad"]).verdict, "yes");
  assert.equal(reviewVerdict(post("## Review — head c7868b2\n\n> **merge: no**"), head, ["MrJarrad"]).verdict, "no");
  // still refused: no verdict line, or a wrong-head post
  assert.equal(reviewVerdict(post("## Review — head c7868b2\n\n0 red, 2 amber — merge condition met."), head, ["MrJarrad"]), null);
  assert.equal(reviewVerdict(post("## Review — head deadbee\n\nmerge: yes"), head, ["MrJarrad"]), null);
});
