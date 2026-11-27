// Status doc rules (HARD-RULES § The Status doc), proven through the Stop hook that enforces them:
// DISC-324 the doc is written in any turn that changes queue, backlog or merge state; DISC-309 a reply never
// reprints a row that existed before the turn; DISC-346 a doc comment is answered by rewriting the item, not by a
// thread reply alone. Edge cases live in hooks/bin/needed-from-you-stop.test.mjs; this file holds one case per rule.
// Run: node --test hooks/scripts/status-doc-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { check, lastTurn } from "../bin/needed-from-you-stop.mjs";
import { writeMarker } from "./lib/row-marker.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const hook = join(root, "hooks/bin/needed-from-you-stop.mjs");
const DOC = "KjmpGR4zjVKB6WVfy8QsNa";
const T = "2026-11-23T10:00:00.000Z";
const FM = "---\nname: x\nkind: queue\nprefix: PF\n---\n";
function vault() {
  const v = mkdtempSync(join(tmpdir(), "status-law-"));
  mkdirSync(join(v, "projects/portfolio"), { recursive: true });
  mkdirSync(join(v, "coordinator"), { recursive: true });
  writeFileSync(join(v, "projects/portfolio/portfolio-queue.md"), FM + "| # | Needed | Where | Why | Recommended |\n| - | - | - | - | - |\n| PF-5 | look at footer | | | |\n");
  writeFileSync(join(v, "coordinator/operator-queue.md"), `# Operator queue\n\n**Status doc:** Claude Doc https://claude.ai/artifact/${DOC} (doc id x).\n`);
  return v;
}
const line = (o) => JSON.stringify(o);
const user = (content) => line({ type: "user", timestamp: T, message: { content } });
const tool = (name, input) => line({ type: "assistant", message: { content: [{ type: "tool_use", id: "t", name, input }] } });
const say = (text) => line({ type: "assistant", message: { content: [{ type: "text", text }] } });
const docUpdate = tool("mcp__docs__update", { container: { kind: "doc", id: DOC }, payload: "item rewritten" });

test("the rule names the hook that enforces it", () => {
  const h = readFileSync(join(root, "skills/routing/references/HARD-RULES.md"), "utf8");
  for (const rule of ["**The Status doc stays current, in every session**", "**Every update rewrites its Status doc item, the same turn**"]) assert.ok(h.includes(rule), rule);
  const wired = JSON.parse(readFileSync(join(root, "hooks/hooks.json"), "utf8")).hooks.Stop.flatMap((g) => g.hooks.map((x) => x.command));
  assert.ok(wired.some((c) => c.includes("needed-from-you-stop.mjs")));
});

test("DISC-324: a turn that merged a PR without writing the Status doc is refused by the Stop hook; the reason asks for the doc, not chat", () => {
  const v = vault();
  const tr = join(mkdtempSync(join(tmpdir(), "tr-")), "t.jsonl");
  writeFileSync(tr, [user("<system-reminder>\nnotification\n</system-reminder>"), tool("mcp__github__merge_pull_request", { pullNumber: 4 })].join("\n"));
  const out = spawnSync("node", [hook], { input: JSON.stringify({ transcript_path: tr }), encoding: "utf8", env: { PATH: process.env.PATH, DISCIPLINE_VAULT_ROOT: v } });
  const r = JSON.parse(out.stdout);
  assert.equal(r.decision, "block");
  assert.match(r.reason, /Status doc/);
  assert.match(r.reason, /no chat text/);
});

test("DISC-324: the same state change passes once the doc is written that turn", () => {
  const t = lastTurn([user("merge it"), tool("mcp__github__merge_pull_request", { pullNumber: 4 }), docUpdate, say("Merged.")].join("\n"), [DOC]);
  assert.deepEqual(t.stateChanges, ["merge"]);
  assert.equal(t.docWritten, true);
  assert.equal(check({ ...t, vault: vault(), docReadBack: undefined }), null);
});

test("DISC-309: a reply that reprints a row which existed before the turn is refused, naming it; a row added this turn is not", () => {
  const v = vault();
  process.env.DISCIPLINE_MARKER_DIR = mkdtempSync(join(tmpdir(), "mk-"));
  try {
    writeMarker(v, { prefix: "PF", id: "PF-9", to: "queue", ts: "2026-11-23T10:05:00.000Z" });
    const text = `Done.\n\n## Needed from you\n\n1. **Footer** PF-5 again.\n2. **New** PF-9 decide.\n\nFull list: [Status](https://claude.ai/artifact/${DOC})\n`;
    const r = check({ text, userTs: T, vault: v, docWritten: true });
    assert.match(r, /PF-5/);
    assert.doesNotMatch(r, /PF-9/);
  } finally { delete process.env.DISCIPLINE_MARKER_DIR; }
});

test("DISC-346: a doc comment answered only by a thread reply is refused; rewriting the item passes", () => {
  const v = vault();
  const comment = user(`[Artifact comment sent to Claude] Artifact: https://claude.ai/artifact/${DOC} ;thread=abc yes, option B`);
  const threadReply = tool("mcp__docs__create", { object: "utterance", payload: { value: { parent: { object: "utterance", id: "abc" }, body: "Done." } } });
  const only = lastTurn([comment, threadReply, say("Replied.")].join("\n"), [DOC]);
  assert.equal(only.docWritten, false);
  assert.match(check({ ...only, vault: v }), /DISC-346/);
  const rewritten = lastTurn([comment, threadReply, docUpdate, say("Replied.")].join("\n"), [DOC]);
  assert.equal(check({ ...rewritten, vault: v, docReadBack: undefined }), null);
});
