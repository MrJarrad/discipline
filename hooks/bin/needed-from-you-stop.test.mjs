// DISC-179(1): a status reply / new ask must end with the script's full Needed-from-you block.
// Run: node --test hooks/bin/needed-from-you-stop.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { check, lastTurn } from "./needed-from-you-stop.mjs";
import { writeMarker } from "../scripts/lib/row-marker.mjs";

const hook = fileURLToPath(new URL("./needed-from-you-stop.mjs", import.meta.url));
const FM = (px, kind) => `---\nname: x\nkind: ${kind}\nprefix: ${px}\n---\n`;
function vault() {
  const v = mkdtempSync(join(tmpdir(), "nfys-"));
  const put = (p, t) => { mkdirSync(join(v, p, ".."), { recursive: true }); writeFileSync(join(v, p), t); };
  put("projects/portfolio/portfolio-queue.md", FM("PF", "queue") + "| # | Needed | Where | Why | Recommended |\n| - | - | - | - | - |\n| PF-5 | look at footer | | | |\n| PF-6 | pick hero | | | |\n");
  put("projects/portfolio/portfolio-backlog.md", FM("PF", "backlog") + "## Open\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n| PF-8 | idea | d | waiting on operator |\n\n## Done\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n");
  return v;
}
const FULL = "Status: lane landed.\n\n## Needed from you\n\n### PF — portfolio\n\n1. **Footer** PF-5 look.\n2. **Hero** PF-6 pick.\n3. **Idea** PF-8.\n";
const T = "2026-10-16T10:00:00.000Z";

test("a status reply with the full block passes; one omitting an open row is blocked naming it", () => {
  const v = vault();
  assert.equal(check({ text: FULL, userTs: T, vault: v }), null);
  const partial = FULL.replace("2. **Hero** PF-6 pick.\n", "");
  assert.match(check({ text: partial, userTs: T, vault: v }), /omits open row\(s\) PF-6/);
});
test("the block must be the last section and carry script headings", () => {
  const v = vault();
  assert.match(check({ text: FULL + "\n## Later\nmore", userTs: T, vault: v }), /last section/);
  assert.match(check({ text: "## Needed from you\n\nPF-5 PF-6 PF-8", userTs: T, vault: v }), /no `### <PFX>/);
});
test("a new ask (row-add marker after the user's message) with no block is blocked; a stale marker is not", () => {
  const v = vault();
  const dir = mkdtempSync(join(tmpdir(), "mk-"));
  process.env.DISCIPLINE_MARKER_DIR = dir;
  try {
    writeMarker(v, { prefix: "PF", id: "PF-9", to: "queue", ts: "2026-10-16T10:05:00.000Z" });
    assert.match(check({ text: "I added a row.", userTs: T, vault: v }), /no `## Needed from you` block/);
    assert.equal(check({ text: "I added a row.", userTs: "2026-10-16T10:10:00.000Z", vault: v }), null, "marker predates the user's message");
    assert.match(check({ text: "x\n\n## Needed from you\n\n### HB — other\n", userTs: T, vault: v }), /added for PF this turn but the block has no section/);
  } finally { delete process.env.DISCIPLINE_MARKER_DIR; }
});
test("a plain reply, a wrapped session and a Build-in-Progress status without the block", () => {
  const v = vault();
  assert.equal(check({ text: "Done, merged.", userTs: T, vault: v }), null);
  assert.equal(check({ text: "This session is wrapped — continue in a fresh session\n\n## Build in Progress", userTs: T, vault: v }), null);
  assert.match(check({ text: "## Build in Progress\n\n- a lane\n", userTs: T, vault: v }), /no `## Needed from you` block/);
});
test("lastTurn reads the final assistant text after the last real user message, skipping tool results", () => {
  const L = (o) => JSON.stringify(o);
  const t = [L({ type: "user", timestamp: T, message: { content: "hi" } }), L({ type: "assistant", message: { content: [{ type: "text", text: "old" }] } }),
    L({ type: "user", timestamp: "2026-10-16T11:00:00.000Z", message: { content: "go" } }),
    L({ type: "assistant", message: { content: [{ type: "text", text: "mid" }, { type: "tool_use", name: "x" }] } }),
    L({ type: "user", timestamp: "2026-10-16T11:01:00.000Z", message: { content: [{ type: "tool_result", content: "r" }] } }),
    L({ type: "assistant", message: { content: [{ type: "text", text: "final" }] } })].join("\n");
  assert.deepEqual(lastTurn(t), { userTs: "2026-10-16T11:00:00.000Z", text: "final" });
});
test("CLI: blocks via JSON decision, allows when stop_hook_active or no vault", () => {
  const v = vault();
  const d = mkdtempSync(join(tmpdir(), "tr-"));
  const tr = join(d, "t.jsonl");
  writeFileSync(tr, [{ type: "user", timestamp: T, message: { content: "status?" } }, { type: "assistant", message: { content: [{ type: "text", text: "## Needed from you\n\n### PF — portfolio\n\nPF-5\n" }] } }].map((x) => JSON.stringify(x)).join("\n"));
  const run = (input, env) => spawnSync("node", [hook], { input: JSON.stringify(input), encoding: "utf8", env: { PATH: process.env.PATH, ...env } });
  const blocked = run({ transcript_path: tr }, { DISCIPLINE_VAULT_ROOT: v });
  assert.equal(JSON.parse(blocked.stdout).decision, "block");
  assert.equal(run({ transcript_path: tr, stop_hook_active: true }, { DISCIPLINE_VAULT_ROOT: v }).stdout, "");
  assert.equal(run({ transcript_path: tr }, {}).stdout, "");
});

test("hooks.json wires the Stop event to this script", () => {
  const h = JSON.parse(readFileSync(new URL("../hooks.json", import.meta.url), "utf8")).hooks;
  assert.ok(h.Stop.flatMap((g) => g.hooks).some((x) => x.command.includes("needed-from-you-stop.mjs")));
});

test("a row ID matches on a word boundary: PF-14 does not satisfy PF-145", () => {
  const v = vault();
  const q = join(v, "projects/portfolio/portfolio-queue.md");
  writeFileSync(q, readFileSync(q, "utf8") + "| PF-145 | later ask | | | |\n");
  const text = "## Needed from you\n\n### PF — portfolio\n\nPF-5 PF-6 PF-8 PF-14\n";
  assert.match(check({ text, userTs: T, vault: v }), /omits open row\(s\) PF-145/);
});
test("a heading inside a fenced code block does not make a status reply", () => {
  const v = vault();
  assert.equal(check({ text: "Example:\n\n```\n## Needed from you\n```\n\nDone.", userTs: T, vault: v }), null);
});
test("a marker from another session does not force a block; the same session's does", () => {
  const v = vault();
  process.env.DISCIPLINE_MARKER_DIR = mkdtempSync(join(tmpdir(), "mk-"));
  try {
    writeMarker(v, { prefix: "PF", id: "PF-9", to: "queue", ts: "2026-10-16T10:05:00.000Z", session: "other" });
    assert.equal(check({ text: "I added a row.", userTs: T, vault: v, sessionId: "mine" }), null);
    assert.match(check({ text: "I added a row.", userTs: T, vault: v, sessionId: "other" }), /no `## Needed from you` block/);
  } finally { delete process.env.DISCIPLINE_MARKER_DIR; }
});

// DISC-288: status out of the thread — the short form (new asks + one link line to the pinned checklist).
const URL_ = "https://claude.ai/artifact/KjmpGR4zjVKB6WVfy8QsNa";
function vaultWithChecklist() {
  const v = vault();
  mkdirSync(join(v, "orchestrator"), { recursive: true });
  writeFileSync(join(v, "orchestrator/operator-queue.md"), `# Operator queue — index\n\n**Pinned checklist (operator s77, DISC-288):** Claude Doc "Needed from you" ${URL_} (doc id x).\n`);
  return v;
}
const SHORT = (ids = "") => `Lane landed.\n\n## Needed from you\n\n${ids}Full list: [Needed from you](${URL_})\n`;

test("DISC-288: with the pinned checklist in the vault, the short form passes without reprinting old rows", () => {
  const v = vaultWithChecklist();
  assert.equal(check({ text: SHORT(), userTs: T, vault: v }), null);
});
test("DISC-288: a short block must still name every row added this turn, and be the last section", () => {
  const v = vaultWithChecklist();
  const dir = mkdtempSync(join(tmpdir(), "mk-"));
  process.env.DISCIPLINE_MARKER_DIR = dir;
  try {
    writeMarker(v, { prefix: "PF", id: "PF-9", to: "queue", ts: "2026-10-16T10:05:00.000Z" });
    assert.match(check({ text: SHORT(), userTs: T, vault: v }), /omits row\(s\) added this turn: PF-9/);
    assert.equal(check({ text: SHORT("1. **New** PF-9 look.\n\n"), userTs: T, vault: v }), null);
  } finally { delete process.env.DISCIPLINE_MARKER_DIR; }
  assert.match(check({ text: SHORT() + "\n## Later\nmore", userTs: T, vault: v }), /last section/);
});
test("DISC-288 (s79): with the pinned checklist configured, no link line, or a link to another page, is refused (no full-block fallback)", () => {
  const v = vaultWithChecklist();
  assert.match(check({ text: "## Needed from you\n\nnothing new.\n", userTs: T, vault: v }), /pinned checklist/);
  assert.match(check({ text: SHORT().replace(URL_, "https://claude.ai/artifact/other"), userTs: T, vault: v }), /pinned checklist/);
});
test("DISC-288: a vault with no pinned-checklist paragraph never accepts the short form", () => {
  assert.match(check({ text: SHORT(), userTs: T, vault: vault() }), /no `### <PFX>/);
});
test("DISC-288: a reply with a Build in Progress heading is still a status reply and needs the block", () => {
  const v = vaultWithChecklist();
  assert.match(check({ text: "## Build in Progress\n\n- a lane\n", userTs: T, vault: v }), /no `## Needed from you` block/);
});
test("DISC-288 N1: only the exact link line takes the short form; the URL elsewhere in the block does not", () => {
  const v = vaultWithChecklist();
  assert.match(check({ text: `## Needed from you\n\nSee ${URL_} for the rest.\n`, userTs: T, vault: v }), /pinned checklist/);
  assert.match(check({ text: `## Needed from you\n\n[Needed from you](${URL_})\n`, userTs: T, vault: v }), /pinned checklist/);
  assert.equal(check({ text: SHORT(), userTs: T, vault: v }), null);
});

// s79 (operator, doc comment 2026-11-12: "it's not been what the last couple of session automatically did"):
// DISC-288 enforced by tool. With the pinned checklist configured, (a) a status reply that reprints the queue inline
// instead of the doc link is refused, (b) a status reply is refused when the doc was not written to this turn.
const DOC_ID = "KjmpGR4zjVKB6WVfy8QsNa";
const wrote = (name = "mcp__1a59c906-04da-521d-bda7-7f71b9f9e01c__update", input = { container: { kind: "doc", id: DOC_ID }, payload: "Running now" }) =>
  JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "d", name, input }] } });
const turn = (...lines) => [JSON.stringify({ type: "user", timestamp: T, message: { content: "how are we looking" } }), ...lines].join("\n");
const reply = (text) => JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text }] } });

test("s79 (a): with the pinned checklist configured, a full inline block with no doc link is refused", () => {
  const v = vaultWithChecklist();
  assert.match(check({ text: FULL, userTs: T, vault: v }), /pinned checklist/);
  assert.match(check({ text: FULL, userTs: T, vault: v }), /Full list:/);
});
test("s79 (a): with no pinned checklist in the vault the full block still passes", () => {
  assert.equal(check({ text: FULL, userTs: T, vault: vault() }), null);
});
test("s79 (b): a status reply is refused when this turn never wrote to the checklist doc", () => {
  const v = vaultWithChecklist();
  const t = turn(reply(SHORT()));
  const { userTs, text, docWritten } = lastTurn(t, URL_);
  assert.equal(docWritten, false);
  assert.match(check({ text, userTs, vault: v, docWritten }), /Running now/);
});
test("s79 (b): a doc write this turn (update or batch on the doc id) lets the short form pass; a write to another doc does not", () => {
  const v = vaultWithChecklist();
  for (const name of ["mcp__1a59c906-04da-521d-bda7-7f71b9f9e01c__update", "mcp__1a59c906-04da-521d-bda7-7f71b9f9e01c__batch"]) {
    const { userTs, text, docWritten } = lastTurn(turn(wrote(name), reply(SHORT())), URL_);
    assert.equal(docWritten, true, name);
    assert.equal(check({ text, userTs, vault: v, docWritten }), null);
  }
  const other = lastTurn(turn(wrote(undefined, { container: { kind: "doc", id: "someOtherDoc" } }), reply(SHORT())), URL_);
  assert.equal(other.docWritten, false);
  const read = lastTurn(turn(wrote("mcp__1a59c906-04da-521d-bda7-7f71b9f9e01c__read"), reply(SHORT())), URL_);
  assert.equal(read.docWritten, false, "a read is not an update");
});
test("s79 (b): a write from an earlier turn does not count for this one", () => {
  const earlier = [JSON.stringify({ type: "user", timestamp: T, message: { content: "first" } }), wrote(), reply("done"), JSON.stringify({ type: "user", timestamp: T, message: { content: "again" } }), reply(SHORT())].join("\n");
  assert.equal(lastTurn(earlier, URL_).docWritten, false);
});
