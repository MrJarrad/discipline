// helper-ledger — DISC-335: one table of every non-archived helper across all parents, with PR state and last summary.
// PRs are read once and matched locally on the helper's session id or lane key (review of #223, RED 2).
// Run: node --test hooks/scripts/helper-ledger.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildLedger, renderLedger, listPrs, pagesLine } from "./helper-ledger.mjs";

const NOW = "2026-11-15T09:00:00Z";
const SELF = "session_self";
const S = (id, o = {}) => ({ id, title: `Helper · task ${id} — no action needed`, session_status: "SESSION_STATUS_IDLE", updated_at: "2026-11-15T08:30:00Z", parent_session_id: "session_old", status_bucket: "SESSION_STATUS_BUCKET_COMPLETED", ...o });
const parent = (id, title) => ({ id, title, session_status: "SESSION_STATUS_IDLE", updated_at: "2026-11-14T08:30:00Z", status_bucket: "SESSION_STATUS_BUCKET_COMPLETED" });
const pr = (n, o = {}) => ({ number: n, title: "t", body: "", state: "closed", html_url: `https://github.com/mrjarrad/discipline/pull/${n}`, pull_request: { merged_at: "2026-11-14T10:00:00Z" }, ...o });
const openPr = (n, o = {}) => pr(n, { state: "open", pull_request: {}, ...o });
const run = (sessions, prs = [], extra = {}) => buildLedger({ sessions: [parent("session_old", "portfolio · 12 Nov (wrapped)"), ...sessions], self: SELF, now: NOW, prs, ...extra });
const row = (l, id) => l.rows.find((r) => r.id === id);

test("a PR whose body carries the id inside a markdown link is found (the case search cannot match), merged and completed: archive", () => {
  const l = run([S("session_a")], [pr(208, { body: "see [session](https://claude.ai/code/session_a)" })]);
  assert.equal(row(l, "session_a").verdict, "archive");
  assert.match(row(l, "session_a").pr, /discipline#208 merged \(by id\)/);
});
test("a PR that names the helper's lane key in its title is matched by lane key", () => {
  const l = run([S("session_b", { tags: ["helper", "s91-PF1655"] })], [openPr(646, { title: "PF-1655 page script size" })]);
  assert.match(row(l, "session_b").pr, /#646 open \(by lane key in title\)/);
  assert.equal(row(l, "session_b").verdict, "keep");
});
test("a merged PR that only cites the lane key in its body never lands the helper: NOT LANDED until the parent accepts", () => {
  const l = run([S("session_z", { tags: ["helper", "s91-PF1398"] })], [pr(1182, { title: "vault notes", body: "mentions PF-1398 in passing" })]);
  assert.equal(row(l, "session_z").verdict, "not-landed");
  assert.match(row(l, "session_z").reason, /cites its lane key/);
  assert.match(row(l, "session_z").pr, /by lane key in body/);
  assert.equal(row(run([S("session_z", { tags: ["helper", "s91-PF1398"] })], [pr(1182, { title: "PF-1398 contrast", body: "" })]), "session_z").verdict, "archive");
});
test("no matching PR reads 'PR not found', is NOT LANDED, and carries the last summary; never in the archive list", () => {
  const l = run([S("session_c", { post_turn_summary: { recent_action: "Built the thing, never opened a PR" } })], [openPr(1, { title: "other", body: "other" })]);
  assert.equal(row(l, "session_c").verdict, "not-landed");
  assert.match(row(l, "session_c").pr, /PR not found/);
  assert.doesNotMatch(row(l, "session_c").pr, /^no PR/);
  assert.match(row(l, "session_c").summary, /never opened a PR/);
  assert.deepEqual(l.archive, []);
});
test("a parent-accepted helper with no PR found becomes archivable", () => {
  const l = run([S("session_d")], [], { accept: ["session_d"] });
  assert.equal(row(l, "session_d").verdict, "archive");
});
test("an open PR beats --accept and merged, and a closed-unmerged PR is NOT LANDED", () => {
  const l = run([S("session_e"), S("session_f")], [openPr(1, { body: "session_e" }), pr(9, { body: "session_e" }), pr(2, { body: "session_f", pull_request: { merged_at: null } })], { accept: ["session_e", "session_f"] });
  assert.equal(row(l, "session_e").verdict, "keep");
  assert.equal(row(l, "session_f").verdict, "archive"); /* accepted: the parent banked it */
  const l2 = run([S("session_f")], [pr(2, { body: "session_f", pull_request: { merged_at: null } })]);
  assert.equal(row(l2, "session_f").verdict, "not-landed");
  assert.match(row(l2, "session_f").reason, /closed unmerged/);
});
test("a PR listing that could not be read whole makes every helper unknown, kept, never archived (fail closed)", () => {
  const l = run([S("session_g"), S("session_h")], null, { accept: ["session_g"] });
  for (const id of ["session_g", "session_h"]) assert.equal(row(l, id).verdict, "unknown");
  assert.deepEqual(l.archive, []);
});
test("--waiting keeps a completed helper with a merged PR (the operator answer is still pending)", () => {
  const l = run([S("session_w")], [pr(5, { body: "session_w" })], { waiting: ["session_w"] });
  assert.equal(row(l, "session_w").verdict, "keep");
  assert.match(row(l, "session_w").reason, /operator answer/);
  assert.deepEqual(l.archive, []);
});
test("a working helper is kept; an archived session and the caller's own id are left out; a parent is never a row", () => {
  const l = run([S("session_i", { status_bucket: "SESSION_STATUS_BUCKET_WORKING" }), S("session_j", { session_status: "SESSION_STATUS_ARCHIVED" }), S(SELF)], [pr(3, { body: "session_i" })]);
  assert.deepEqual(l.rows.map((r) => r.id), ["session_i"]);
  assert.equal(row(l, "session_i").verdict, "keep");
});
test("a landed id recorded by lane-end counts as merged without a PR match", () => {
  assert.equal(row(run([S("session_k")], [], { landedIds: ["session_k"] }), "session_k").verdict, "archive");
});
test("a helper under a wrapped parent is re-pointed; the row names its parent and the lane tag", () => {
  const l = run([S("session_l", { tags: ["helper", "s91-PF1655"], status_bucket: "SESSION_STATUS_BUCKET_WORKING" })]);
  assert.equal(row(l, "session_l").parent, "session_old");
  assert.equal(row(l, "session_l").lane, "PF1655");
  assert.deepEqual(l.repoint.map((r) => r.id), ["session_l"]);
});
test("the same session on two overlapping pages is one row", () => {
  assert.deepEqual(run([S("session_a"), S("session_a")], [pr(208, { body: "session_a" })]).rows.map((r) => r.id), ["session_a"]);
});
test("the render: one table, a scope line saying only `Helper ·` sessions are covered, the lists the Stop hook reads, pipes escaped", () => {
  const l = run([S("session_a", { title: "Helper · a | b — no action needed" }), S("session_b")], [pr(208, { body: "session_a" })], { pages: [{ count: 3, has_more: false }] });
  const t = renderLedger(l, NOW);
  assert.match(t, /^\| id \| helper \| lane \| parent \| PR \| last summary \| verdict \|$/m);
  assert.match(t, /Covers sessions titled `Helper ·` that have a parent/);
  assert.match(t, /a \\\| b/);
  assert.match(t, /## Archive \(1\)\n- session_a \|/);
  assert.match(t, /## Not landed \(1\)\n- session_b \|/);
  assert.match(t, /Helpers: session_b\b/);
});
test("the pages line says INCOMPLETE until a saved page reports has_more false", () => {
  assert.match(pagesLine([{ count: 100, has_more: true }, { count: 100, has_more: true }]), /INCOMPLETE/);
  assert.match(pagesLine([{ count: 100, has_more: true }, { count: 40, has_more: false }]), /list is complete/);
  assert.match(pagesLine([{ count: 100, has_more: true }, { count: 40, has_more: false }]), /2 saved, 140 sessions/);
});
test("listPrs pages one search until total_count is reached, and refuses a result it cannot read whole", () => {
  const page = (items, total) => ({ total_count: total, incomplete_results: false, items });
  const seen = [];
  const search = (q, p) => { seen.push([q, p]); return p === 1 ? page([pr(1), pr(2)], 3) : page([pr(3)], 3); };
  assert.deepEqual(listPrs(search, "2026-11-01").map((x) => x.number), [1, 2, 3]);
  assert.deepEqual(seen, [["is:pr user:MrJarrad created:>=2026-11-01", 1], ["is:pr user:MrJarrad created:>=2026-11-01", 2]]);
  assert.equal(listPrs(() => page([], 5), "2026-11-01"), null);
  assert.equal(listPrs(() => ({ ...page([pr(1)], 1), incomplete_results: true }), "2026-11-01"), null);
  assert.equal(listPrs(() => { throw new Error("HTTP 403"); }, "2026-11-01"), null);
});
test("the CLI reads saved list_sessions pages, matches PRs from --prs-file, writes the ledger into the vault, and exits 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-"));
  const page = join(dir, "p.json"), prs = join(dir, "prs.json");
  writeFileSync(page, JSON.stringify({ ccr: { data: [parent("session_old", "x (wrapped)"), S("session_a")], has_more: false } }));
  writeFileSync(prs, JSON.stringify({ total_count: 1, items: [pr(208, { body: "[s](https://claude.ai/code/session_a)" })] }));
  const script = join(dirname(fileURLToPath(import.meta.url)), "helper-ledger.mjs");
  const r = spawnSync(process.execPath, [script, "--self", SELF, "--sessions", page, "--prs-file", prs, "--vault", dir, "--now", NOW], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /## Archive \(1\)/);
  assert.match(r.stdout, /list is complete/);
  assert.match(readFileSync(join(dir, "orchestrator", "helper-ledger.md"), "utf8"), /session_a/);
});
