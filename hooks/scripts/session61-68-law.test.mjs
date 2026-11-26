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
const WR = "skills/vault-write/references/WRITING.md";

test("s64 2 / s67 4: a cloud parent compares the loaded plugin with the release", () => {
  has("skills/pause-resume/SKILL.md", "A cloud parent passes `--released <version>` read from discipline main's `.claude-plugin/plugin.json`");
});

test("s62 1, 5 / s67 5 / s68 2, 3: third-party and capability claims are checked at the source", () => {
  has("skills/routing/references/OPERATOR-REPLIES.md", "A claim about a third-party tool, our access to it, or what a product can do, in his text or a brief, is checked at the source first");
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

test("s65 2: a reviewer: line with text after the session id counts; the text is a label", () => {
  has("agents/reviewer.md", "a `reviewer:` line must start with a session id (text after is a label) or the verdict is not counted (`merge-after-review.mjs`).");
});

test("s66 2: a symptom without its trigger gets one question first", () => {
  has("skills/issue-triage/references/TRIAGE-PROCEDURE.md", "**A symptom named without its trigger**");
});

test("s68 5: a branch switch runs on its own line", () => {
  has("doer-rules.md", "**A branch switch (`checkout -B`, `switch`) runs on its own line**");
});
