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
import { pinnedChecklistIds } from "../scripts/lib/pinned-checklist.mjs";

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
  assert.deepEqual(lastTurn(t), { userTs: "2026-10-16T11:00:00.000Z", text: "final", wake: false });
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
const SHORT = (ids = "") => `Lane landed.\n\n## Needed from you\n\n${ids}Full list: [Status](${URL_})\n`;

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
  assert.match(check({ text: "## Needed from you\n\nnothing new.\n", userTs: T, vault: v }), /Status doc/);
  assert.match(check({ text: SHORT().replace(URL_, "https://claude.ai/artifact/other"), userTs: T, vault: v }), /Status doc/);
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
  assert.match(check({ text: `## Needed from you\n\nSee ${URL_} for the rest.\n`, userTs: T, vault: v }), /Status doc/);
  assert.match(check({ text: `## Needed from you\n\n[Needed from you](${URL_})\n`, userTs: T, vault: v }), /Status doc/);
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
  assert.match(check({ text: FULL, userTs: T, vault: v }), /Status doc/);
  assert.match(check({ text: FULL, userTs: T, vault: v }), /Full list:/);
});
test("s79 (a): with no pinned checklist in the vault the full block still passes", () => {
  assert.equal(check({ text: FULL, userTs: T, vault: vault() }), null);
});
test("s79 (b): a status reply is refused when this turn never wrote to the checklist doc", () => {
  const v = vaultWithChecklist();
  const t = turn(reply(SHORT()));
  const { userTs, text, docWritten } = lastTurn(t, [DOC_ID]);
  assert.equal(docWritten, false);
  assert.match(check({ text, userTs, vault: v, docWritten }), /Running now/);
});
test("s79 (b): a doc write this turn (update or batch on the doc id) lets the short form pass; a write to another doc does not", () => {
  const v = vaultWithChecklist();
  for (const name of ["mcp__1a59c906-04da-521d-bda7-7f71b9f9e01c__update", "mcp__1a59c906-04da-521d-bda7-7f71b9f9e01c__batch"]) {
    const { userTs, text, docWritten } = lastTurn(turn(wrote(name), reply(SHORT())), [DOC_ID]);
    assert.equal(docWritten, true, name);
    assert.equal(check({ text, userTs, vault: v, docWritten }), null);
  }
  const other = lastTurn(turn(wrote(undefined, { container: { kind: "doc", id: "someOtherDoc" } }), reply(SHORT())), [DOC_ID]);
  assert.equal(other.docWritten, false);
  const read = lastTurn(turn(wrote("mcp__1a59c906-04da-521d-bda7-7f71b9f9e01c__read"), reply(SHORT())), [DOC_ID]);
  assert.equal(read.docWritten, false, "a read is not an update");
});
test("s79 (b): a write from an earlier turn does not count for this one", () => {
  const earlier = [JSON.stringify({ type: "user", timestamp: T, message: { content: "first" } }), wrote(), reply("done"), JSON.stringify({ type: "user", timestamp: T, message: { content: "again" } }), reply(SHORT())].join("\n");
  assert.equal(lastTurn(earlier, [DOC_ID]).docWritten, false);
});

// Review round 1 AMBER 3: the Claude Docs connector addresses the doc by its UUID (container id), not the artifact URL's last segment.
const DOC_UUID = "97bd5a36-e22b-449d-b7ae-c73b9d2f7073";
function vaultWithUuid() {
  const v = vault();
  mkdirSync(join(v, "orchestrator"), { recursive: true });
  writeFileSync(join(v, "orchestrator/operator-queue.md"), `# Operator queue — index\n\n**Pinned checklist (operator s77, DISC-288):** Claude Doc "Needed from you" ${URL_} (doc id ${DOC_UUID}, body node 51a59e14-4a0e).\n`);
  return v;
}
test("s79 review AMBER 3: a Claude Docs update/batch naming the doc UUID counts as a write; the URL id still counts; another project id does not", () => {
  const v = vaultWithUuid();
  for (const name of ["mcp__Claude_Docs__update", "mcp__Claude_Docs__batch"]) {
    const w = wrote(name, { container: { kind: "project", id: DOC_UUID }, payload: "x" });
    const t = lastTurn(turn(w, reply(SHORT())), pinnedChecklistIds(v));
    assert.equal(t.docWritten, true, name);
    assert.equal(check({ text: t.text, userTs: t.userTs, vault: v, docWritten: t.docWritten }), null);
  }
  assert.equal(lastTurn(turn(wrote(), reply(SHORT())), pinnedChecklistIds(v)).docWritten, true, "artifact id also accepted");
  const other = lastTurn(turn(wrote("mcp__Claude_Docs__update", { container: { kind: "project", id: "00000000-0000-0000-0000-000000000000" } }), reply(SHORT())), pinnedChecklistIds(v));
  assert.equal(other.docWritten, false);
});

// DISC-305 (operator s81: "I think status is correct"): the doc is called Status, so the link line reads [Status]; the old link text still passes.
test("DISC-305: the link line may read [Status] or the legacy [Needed from you]", () => {
  const v = vaultWithChecklist();
  assert.equal(check({ text: `Lane landed.\n\n## Needed from you\n\nFull list: [Status](${URL_})\n`, userTs: T, vault: v }), null);
  assert.equal(check({ text: `Lane landed.\n\n## Needed from you\n\nFull list: [Needed from you](${URL_})\n`, userTs: T, vault: v }), null);
});
test("DISC-305: the vault paragraph may be headed Status doc as well as Pinned checklist", () => {
  const v = vault();
  mkdirSync(join(v, "orchestrator"), { recursive: true });
  writeFileSync(join(v, "orchestrator/operator-queue.md"), `# Operator queue — index\n\n**Status doc (operator s81, DISC-305):** Claude Doc "Status" ${URL_} (doc id x).\n`);
  assert.equal(check({ text: SHORT(), userTs: T, vault: v }), null);
  assert.match(check({ text: SHORT().replace(URL_, "https://claude.ai/artifact/other"), userTs: T, vault: v }), /Status doc/);
});

// DISC-302 (operator s81: "can you make sure status in the needed from you doc get updated with responses"): a row answered this turn
// (lane-end.mjs --id) must have its Status chip changed in the doc write, not left at Ready for you.
const bash = (command) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "b", name: "Bash", input: { command } }] } });
test("DISC-302: lastTurn reports the rows answered this turn and the text of this turn's doc writes", () => {
  const t = turn(bash("node hooks/scripts/lane-end.mjs --vault /v --id PF-6 --status done"), wrote(undefined, { container: { kind: "doc", id: DOC_ID }, payload: "chars replace dropdown Done" }), reply(SHORT()));
  const r = lastTurn(t, [DOC_ID]);
  assert.deepEqual(r.answered, ["PF-6"]);
  assert.equal(r.docWrites.length, 1);
  assert.match(JSON.stringify(r.docWrites[0]), /dropdown Done/);
});
// The REAL chip change (parent s81): one update call with ops; the dropdown is a block {"type":"dropdown","enum":…,"index":N} swapped into a chars
// range (index 0 Ready for you, 1 You're on it, 2 Done, 3 Claude's on it), and the row id rides in a SIBLING op (the lead-words rewrite) of the same call.
const chipWrite = (payload) => wrote(undefined, { container: { kind: "doc", id: DOC_ID }, payload });
const chipOp = (index) => ({ op: "replace", target: { kind: "chars", range: ["mvz0r93rszj.37884", "mvz0r93rszj.37884"] }, with: { as: "markdown", blocks: { v: { type: "dropdown", enum: "bc09b9b4-c14e", index } }, from: { kind: "inline", content: "&lt;?claude block v?&gt;" } } });
const leadOp = (id) => ({ op: "replace", target: { kind: "find", text: `Look now: footer (${id}), in review…` }, with: { as: "text", from: { kind: "inline", content: `Answered (${id})` } } });
const callOf = (...ops) => wrote(undefined, { container: { kind: "doc", id: DOC_ID }, ops });
/* these tests are about the chip rule; the layout read-back (DISC-328) has its own tests below, so the read-back and the state-change fields are left out here */
const noReadBack = ({ docReadBack, stateChanges, ...r }) => r;
const answeredTurn = (...writes) => noReadBack(lastTurn(turn(bash("node lane-end.mjs --id PF-6"), ...writes, reply(SHORT())), [DOC_ID]));
test("DISC-302 (review AMBER 4, real payload): a call that sets a dropdown to index 1/2/3 and names the answered row passes; the index is read, not a label", () => {
  const v = vaultWithChecklist();
  for (const index of [1, 2, 3]) assert.equal(check({ ...answeredTurn(callOf(chipOp(index), leadOp("PF-6"))), vault: v }), null, `index ${index}`);
  assert.equal(check({ ...answeredTurn(callOf(leadOp("PF-6"), chipOp(2))), vault: v }), null, "op order does not matter");
});
test("DISC-302: no pass for a Ready index, no dropdown, no row id in the call, or another row's call", () => {
  const v = vaultWithChecklist();
  const no = (t) => assert.match(check({ ...t, vault: v }), /DISC-302.*PF-6/);
  no(answeredTurn(callOf(chipOp(0), leadOp("PF-6"))));                         // still Ready for you
  no(answeredTurn(callOf(leadOp("PF-6"))));                                    // lead words only
  no(answeredTurn(callOf(chipOp(2), leadOp("PF-9"))));                         // another row's call
  no(answeredTurn(callOf(chipOp(2))));                                         // no row id anywhere in the call
  no(answeredTurn(chipWrite("moved the item to the Done this session section"))); // the word Done, no dropdown
  no(answeredTurn(callOf(chipOp(2), leadOp("PF-9")), callOf(leadOp("PF-6"))));  // chip in one call, id in another
});
test("DISC-302: a read-side label shape in the call (a <dropdown> element) still counts when the row id is in the call", () => {
  const v = vaultWithChecklist();
  assert.equal(check({ ...answeredTurn(chipWrite("replace PF-6 with <dropdown id='.2' enum='e' index='2'>Done</dropdown>")), vault: v }), null);
});
test("DISC-302: no row answered this turn adds no chip requirement", () => {
  const v = vaultWithChecklist();
  const r = lastTurn(turn(wrote(), reply(SHORT())), [DOC_ID]);
  assert.deepEqual(r.answered, []);
  assert.equal(check({ ...noReadBack(r), vault: v }), null);
});

// s81 (operator, verbatim: "you've started status updates in the thread again"): an automated wake (GitHub event, helper message,
// background completion) with nothing the operator must act on gets no chat text at all; results go to the Status doc.
const wakeUser = (body) => JSON.stringify({ type: "user", timestamp: T, message: { content: body } });
const WAKE = `<system-reminder>\n[SYSTEM NOTIFICATION - NOT USER INPUT]\n<cross-session-message from-session="session_x">\nlane landed\n</cross-session-message>\n</system-reminder>`;
test("s81: lastTurn marks a turn started by an automated notification as a wake; a real user message is not", () => {
  assert.equal(lastTurn([wakeUser(WAKE), reply("PR merged.")].join("\n"), []).wake, true);
  assert.equal(lastTurn([wakeUser(`<wake reason="external-event"><event source="github"/></wake>`), reply("ok")].join("\n"), []).wake, true);
  assert.equal(lastTurn([wakeUser("how are we looking"), reply("fine")].join("\n"), []).wake, false);
});
test("s81: chat text on an automated wake with no new ask is refused; no text, or a wrapped one-liner, passes", () => {
  const v = vault();
  assert.match(check({ text: "The PR merged and the helper is done.", userTs: T, vault: v, wake: true }), /automated wake.*no chat text.*Status doc/i);
  assert.equal(check({ text: null, userTs: T, vault: v, wake: true }), null);
  assert.equal(check({ text: "This session is wrapped — continue in a fresh session", userTs: T, vault: v, wake: true }), null);
});
test("s81: a wake that raised a new ask (row-add marker this turn) still needs the Needed-from-you block, not silence", () => {
  const v = vaultWithChecklist();
  const dir = mkdtempSync(join(tmpdir(), "mk-"));
  process.env.DISCIPLINE_MARKER_DIR = dir;
  try {
    writeMarker(v, { prefix: "PF", id: "PF-9", to: "queue", ts: "2026-10-16T10:05:00.000Z" });
    assert.equal(check({ text: SHORT("1. **New** PF-9 look.\n\n"), userTs: T, vault: v, wake: true }), null);
  } finally { delete process.env.DISCIPLINE_MARKER_DIR; }
});
test("s81: a real user message with the same reply text is not held by the wake rule", () => {
  assert.equal(check({ text: "The PR merged and the helper is done.", userTs: T, vault: vault(), wake: false }), null);
});

// s81 / DISC-302: the CLI must pass the wake flag and the answered rows through to check().
test("CLI: an automated wake with reply text is blocked; an answered row with a stale chip is blocked by the hook itself", () => {
  const v = vaultWithChecklist();
  const d = mkdtempSync(join(tmpdir(), "tr-"));
  const run = (lines) => { const tr = join(d, "t.jsonl"); writeFileSync(tr, lines.join("\n")); return spawnSync("node", [hook], { input: JSON.stringify({ transcript_path: tr, session_id: "s" }), encoding: "utf8", env: { PATH: process.env.PATH, DISCIPLINE_VAULT_ROOT: v } }); };
  const w = run([wakeUser(WAKE), reply("The PR merged.")]);
  assert.match(JSON.parse(w.stdout).reason, /automated wake/);
  const stale = run([JSON.stringify({ type: "user", timestamp: T, message: { content: "done" } }), bash("node lane-end.mjs --id PF-6"), wrote(undefined, { container: { kind: "doc", id: DOC_ID }, payload: "moved to Done section" }), ...fullRead("rb", IN_LAYOUT()), reply(SHORT())]);
  assert.match(JSON.parse(stale.stdout).reason, /DISC-302/);
});

test("s81 (review AMBER 2): a real operator message is never a wake, even if it quotes wrapper text or carries a notification block beside its own words", () => {
  const wk = (content) => lastTurn([JSON.stringify({ type: "user", timestamp: T, message: { content } }), reply("ok")].join("\n"), []).wake;
  assert.equal(wk(WAKE), true);
  assert.equal(wk(`<wake reason="external-event"><event source="github"/></wake>`), true);
  assert.equal(wk(`<task-notification><status>done</status></task-notification>`), true);
  assert.equal(wk(`why did you write <wake reason="x"> in the doc?`), false);
  assert.equal(wk(`${WAKE}\nand also please check the footer`), false);
  assert.equal(wk([{ type: "text", text: "check the footer" }, { type: "text", text: WAKE }]), false);
  assert.equal(wk([{ type: "text", text: WAKE }, { type: "text", text: `<task-notification><status>done</status></task-notification>` }]), true);
});

// DISC-309 (operator s82, verbatim: "why is this still apearing?"): a reply names only rows that did not exist before this turn.
// A row with no row-add marker this turn existed already, so it is on the Status doc and must not be printed again.
test("DISC-309: the short block refuses a printed row ID that was not added this turn, naming it", () => {
  const v = vaultWithChecklist();
  process.env.DISCIPLINE_MARKER_DIR = mkdtempSync(join(tmpdir(), "mk-"));
  try {
    writeMarker(v, { prefix: "DISC", id: "DISC-308", to: "queue", ts: "2026-10-16T10:05:00.000Z" });
    const again = SHORT("1. **Footer round** PF-5 look again.\n2. **New** DISC-308 decide.\n\n");
    assert.match(check({ text: again, userTs: T, vault: v }), /DISC-309[^]*PF-5[^]*already on the Status doc/);
    assert.doesNotMatch(check({ text: again, userTs: T, vault: v }), /DISC-308/);
  } finally { delete process.env.DISCIPLINE_MARKER_DIR; }
});
test("DISC-309: a reply that names no row IDs passes, so the 'still open' reminder line is allowed", () => {
  const v = vaultWithChecklist();
  assert.equal(check({ text: SHORT("Your decisions are still open on the doc.\n\n"), userTs: T, vault: v }), null);
});

// DISC-324 (operator s87, verbatim: "i need to you ensure the status doc is always up to date and need this to go across sessions"):
// a turn that changed queue, backlog or merge state must also write the Status doc in that turn. stateChanges is what lastTurn read from the turn's tool calls.
test("DISC-324: a state change with no Status doc write this turn is refused, whatever the reply says", () => {
  const v = vaultWithChecklist();
  assert.match(check({ text: "Merged.", userTs: T, vault: v, docWritten: false, stateChanges: ["merge"] }), /DISC-324[^]*merge[^]*Status doc/);
});
test("DISC-324: the same state change passes once the doc was written this turn, or when the vault has no Status doc", () => {
  const v = vaultWithChecklist();
  assert.equal(check({ text: "Merged.", userTs: T, vault: v, docWritten: true, stateChanges: ["merge"] }), null);
  assert.equal(check({ text: "Merged.", userTs: T, vault: vault(), stateChanges: ["merge"] }), null);
});
test("DISC-324: a textless wake that changed state is refused, and the reason asks for no chat text; a wake with no state change is untouched", () => {
  const v = vaultWithChecklist();
  const r = check({ text: null, userTs: T, vault: v, docWritten: false, wake: true, stateChanges: ["merge"] });
  assert.match(r, /DISC-324/);
  assert.match(r, /no chat text/);
  assert.equal(check({ text: null, userTs: T, vault: v, docWritten: false, wake: true, stateChanges: [] }), null);
});
test("DISC-324: lastTurn reads state changes from this turn's tool calls only (row-add, lane-end, go-live-tick --apply, a merge, a queue or backlog edit)", () => {
  const use = (name, input) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "x", name, input }] } });
  const bash = (command) => use("Bash", { command });
  const t = (...l) => lastTurn(turn(...l, reply("ok")), [DOC_ID]).stateChanges;
  assert.deepEqual(t(bash("node hooks/scripts/row-add.mjs --vault v --prefix PF --to queue --text x")), ["row-add"]);
  assert.deepEqual(t(bash("node hooks/scripts/lane-end.mjs --vault v --id PF-5")), ["lane-end"]);
  assert.deepEqual(t(bash("node hooks/scripts/go-live-tick.mjs --vault v --rows PF-5 --apply")), ["go-live-tick"]);
  assert.deepEqual(t(use("mcp__github__merge_pull_request", { owner: "mrjarrad", repo: "jhd-vault", pullNumber: 4 })), ["merge"]);
  assert.deepEqual(t(use("Edit", { file_path: "/v/projects/portfolio/portfolio-queue.md" })), ["queue-or-backlog-edit"]);
  assert.deepEqual(t(use("mcp__github__create_or_update_file", { path: "projects/jhd-discipline/jhd-discipline-backlog.md" })), ["queue-or-backlog-edit"]);
  assert.deepEqual(t(bash("node hooks/scripts/go-live-tick.mjs --vault v --rows PF-5"), bash("grep -n PF-5 projects/portfolio/portfolio-queue.md"), use("Edit", { file_path: "/v/projects/portfolio/notes.md" })), [], "dry run, read and unrelated edit are not state changes");
  const earlier = [JSON.stringify({ type: "user", timestamp: T, message: { content: "first" } }), use("mcp__github__merge_pull_request", {}), reply("done"), JSON.stringify({ type: "user", timestamp: T, message: { content: "again" } }), reply("ok")].join("\n");
  assert.deepEqual(lastTurn(earlier, [DOC_ID]).stateChanges, []);
});
test("DISC-324 CLI: a textless wake turn that merged a PR without writing the Status doc is blocked", () => {
  const v = vaultWithChecklist();
  const d = mkdtempSync(join(tmpdir(), "tr-"));
  const tr = join(d, "t.jsonl");
  const wake = "<system-reminder>\nnotification\n</system-reminder>";
  writeFileSync(tr, [{ type: "user", timestamp: T, message: { content: wake } }, { type: "assistant", message: { content: [{ type: "tool_use", id: "m", name: "mcp__github__merge_pull_request", input: { pullNumber: 4 } }] } }].map((x) => JSON.stringify(x)).join("\n"));
  const out = spawnSync("node", [hook], { input: JSON.stringify({ transcript_path: tr }), encoding: "utf8", env: { PATH: process.env.PATH, DISCIPLINE_VAULT_ROOT: v } });
  assert.match(JSON.parse(out.stdout).reason, /DISC-324[^]*no chat text/);
});
// DISC-324 round 2 (review amber): a Bash command that only NAMES a state script is not a state change; an actual `node … <script>` invocation is.
test("DISC-324: a Bash call that only names row-add, lane-end or go-live-tick (grep, sed -n, git diff, --dry-run) is not a state change; a real invocation anywhere in a compound command is", () => {
  const bash = (command) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "x", name: "Bash", input: { command } }] } });
  const t = (command) => lastTurn(turn(bash(command), reply("ok")), [DOC_ID]).stateChanges;
  for (const c of ["grep -rn row-add.mjs hooks/", "sed -n 1,40p hooks/scripts/lane-end.mjs", "git diff -- hooks/scripts/row-add.mjs", "cat hooks/scripts/go-live-tick.mjs --apply",
    "node hooks/scripts/row-add.mjs --vault v --prefix PF --to queue --text x --dry-run", "node hooks/scripts/lane-end.mjs --vault v --id PF-5 --dry-run", "node hooks/scripts/go-live-tick.mjs --vault v --rows PF-5 --apply --dry-run"])
    assert.deepEqual(t(c), [], c);
  assert.deepEqual(t("cd /v && node /p/hooks/scripts/lane-end.mjs --vault v --id PF-5 | tail -3"), ["lane-end"]);
  assert.deepEqual(t("git pull -q; DISCIPLINE_X=1 node hooks/scripts/row-add.mjs --vault v --prefix PF --to backlog --text x"), ["row-add"]);
});

// DISC-328 (operator s88: "I still don't feel like we're cleanly, consistently and dependably using the status doc."): a turn that wrote the Status doc
// must leave it in the agreed layout. The hook cannot call the connector, so it runs the layout plan on the last doc read AFTER the turn's last write.
import { layoutDoc } from "../scripts/fixtures/status-doc-live.mjs";
const READ = "mcp__1a59c906-04da-521d-bda7-7f71b9f9e01c__read";
const doc = (id) => ({ id, chip: 0, text: `(${id}) Look at it. Waiting on you.` });
const IN_LAYOUT = () => layoutDoc({ base: "https://x", upNext: { Portfolio: ["Nothing."] }, sections: { "Ready for you": { Portfolio: [doc("PF-5"), doc("PF-6"), doc("PF-8")].map((d) => ({ ...d, id: `i${d.id.replace("-", "")}` })) } } });
const OUT_OF_LAYOUT = () => IN_LAYOUT().replace(/<dropdown id='diPF5'[^>]*>Ready for you<\/dropdown>/, "");
const readCall = (id) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id, name: READ, input: { ref: { object: "node", id: "doc" }, container: { kind: "doc", id: DOC_ID }, payload: { kind: "view" } } }] } });
const readResult = (id, data) => JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: JSON.stringify({ verdict: "allow", rev: 9, data }) }] } });
const fullRead = (id, xml) => [readCall(id), readResult(id, { rev: 9, xml, complete: true })];
const gapsRead = (id) => [readCall(id), readResult(id, { rev: 10, xml: "<doc node='n' rev='10' sinceRev='9'><gap blocks='43'/></doc>", complete: true })];

test("DISC-328 c: lastTurn reports the last full doc read after the turn's last doc write; a read before the write does not count", () => {
  const after = lastTurn(turn(wrote(), ...fullRead("r1", IN_LAYOUT()), reply("ok")), [DOC_ID]);
  assert.equal(after.docReadBack.xml, IN_LAYOUT());
  const before = lastTurn(turn(...fullRead("r1", IN_LAYOUT()), wrote(), reply("ok")), [DOC_ID]);
  assert.equal(before.docReadBack.xml, null, "the write came after the read, so the doc was not read back");
});
test("DISC-328 c: a sinceRev read that holds only gaps means unchanged since the last full read; a partial one cannot be judged", () => {
  const full = turn(...fullRead("r1", IN_LAYOUT()), wrote(), ...gapsRead("r2"), reply("ok"));
  assert.equal(lastTurn(full, [DOC_ID]).docReadBack.xml, IN_LAYOUT());
  const partial = turn(wrote(), readCall("r3"), readResult("r3", { rev: 11, xml: "<doc node='n' rev='11' sinceRev='9'><paragraph id='x'><text id='t'>hi</text></paragraph></doc>", complete: true }), reply("ok"));
  assert.equal(lastTurn(partial, [DOC_ID]).docReadBack.partial, true);
});
test("DISC-328 c: a turn that wrote the doc and never read it back is refused; one whose read-back is out of layout is refused naming the row; one in layout passes", () => {
  const v = vaultWithChecklist();
  const c = (...lines) => { const t = lastTurn(turn(wrote(), ...lines, reply("Merged.")), [DOC_ID]); return check({ text: t.text, userTs: t.userTs, vault: v, docWritten: t.docWritten, docReadBack: t.docReadBack }); };
  assert.match(c(), /DISC-328[^]*never read it back/);
  assert.match(c(...fullRead("r1", OUT_OF_LAYOUT())), /DISC-328[^]*out of layout[^]*PF-5/);
  assert.equal(c(...fullRead("r1", IN_LAYOUT())), null);
});
test("DISC-328 c: with no read-back field at all (older caller) or an unparsable read, the check allows", () => {
  const v = vaultWithChecklist();
  assert.equal(check({ text: "Merged.", userTs: T, vault: v, docWritten: true }), null);
  assert.equal(check({ text: "Merged.", userTs: T, vault: v, docWritten: true, docReadBack: { xml: "not xml at all" } }), null);
});

// DISC-328 lock row (operator s88, verbatim: "the idea is to use the status doc as much as possible for tasks, so the thread can clean for discussion or new things/conversation").
// A turn that only changed task state and raised no new ask gets no status reply in the thread; a plain answer to the operator is never held.
test("DISC-328 thread: a status-shaped reply after a state-only turn with no new row is held; a plain reply is not, and neither is a status reply when no task state changed", () => {
  const v = vaultWithChecklist();
  const status = `Merged.\n\n## Needed from you\n\nFull list: [Status](${URL_})\n`;
  assert.match(check({ text: status, userTs: T, vault: v, docWritten: true, stateChanges: ["merge"] }), /DISC-328[^]*thread/);
  assert.equal(check({ text: "That is merged; want the next lane to be the footer?", userTs: T, vault: v, docWritten: true, stateChanges: ["merge"] }), null, "discussion is the thread's job");
  assert.equal(check({ text: status, userTs: T, vault: v, docWritten: true, stateChanges: [] }), null, "no task-state change this turn: the operator asked for the queue");
});
