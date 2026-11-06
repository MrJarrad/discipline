// DISC-248 (vault PF-1125): a look/listen link goes to the easiest place to review the change.
// The rule lives once in PREVIEW-PROBE § Link checks; dispatch-brief and doer-rules point.
// Run: node --test hooks/scripts/session53-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const PROBE = "skills/present-for-review/references/PREVIEW-PROBE.md";
const RULE =
  "- **The link goes to the easiest place to review the change.** Link the page where the operator will see or hear the difference most plainly, and name that difference; a page where only a measured value moved is not that (PF-1125: a dark-mode token change linked on pages where the change is hard to see). A state a cold load cannot reach gets a flag (check above). When no live page shows the change, say so in the message and send no link (DISC-248).";
const HOMES = {
  "skills/dispatch-brief/SKILL.md": "link sent** to a page showing the change (`link-first-look-rounds`; `present-for-review` § Link checks)",
  "doer-rules.md": "link goes to the operator, at the easiest place to review the change (`present-for-review` § Link checks).",
};

test("DISC-248: the visible-change link check lives verbatim in § Link checks, counted", () => {
  const s = flat(PROBE);
  const at = s.indexOf("## Link checks");
  assert.ok(at > 0);
  assert.ok(s.indexOf(RULE) > at, "rule sits under § Link checks");
  assert.ok(s.includes("Run all five before a look link goes out"));
  assert.ok(flat("skills/present-for-review/SKILL.md").includes("run the five link checks"));
});

test("DISC-248: dispatch-brief Done-when and doer-rules look-lane done-when point, never restate", () => {
  for (const [p, POINTER] of Object.entries(HOMES)) {
    const s = flat(p);
    assert.ok(s.includes(POINTER), `${p} points at § Link checks`);
    assert.ok(!s.includes("a page where only a measured value moved is not that"), `${p} does not restate the rule`);
  }
});

test("release: 1.179.0 in both manifests and CHANGED.txt, with the encoded line", () => {
  const read = (p) => readFileSync(join(root, p), "utf8");
  for (const p of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) assert.ok(read(p).includes('"version": "1.179.0"'), p);
  const top = read("CHANGED.txt");
  assert.ok(top.startsWith("1.179.0 — "));
  assert.ok(top.split("\n\n")[0].includes("encoded: 1.179.0 — backlog DISC-258."));
});
