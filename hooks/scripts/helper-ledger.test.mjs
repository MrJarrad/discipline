// helper-ledger — DISC-335: one table of every non-archived helper across all parents, with PR state and last summary.
// Run: node --test hooks/scripts/helper-ledger.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildLedger, renderLedger, prLookup } from "./helper-ledger.mjs";

const NOW = "2026-11-15T09:00:00Z";
const SELF = "session_self";
const S = (id, o = {}) => ({ id, title: `Helper · task ${id} — no action needed`, session_status: "SESSION_STATUS_IDLE", updated_at: "2026-11-15T08:30:00Z", parent_session_id: "session_old", status_bucket: "SESSION_STATUS_BUCKET_COMPLETED", ...o });
const parent = (id, title) => ({ id, title, session_status: "SESSION_STATUS_IDLE", updated_at: "2026-11-14T08:30:00Z", status_bucket: "SESSION_STATUS_BUCKET_COMPLETED" });
const pr = (n, o = {}) => ({ number: n, state: "closed", html_url: `https://github.com/mrjarrad/discipline/pull/${n}`, pull_request: { merged_at: "2026-11-14T10:00:00Z" }, ...o });
const result = (...items) => ({ total_count: items.length, incomplete_results: false, items });
const run = (sessions, prs = {}, extra = {}) => buildLedger({ sessions: [parent("session_old", "portfolio · 12 Nov (wrapped)"), ...sessions], self: SELF, now: NOW, lookup: (id) => prs[id] ?? result(), ...extra });
const row = (l, id) => l.rows.find((r) => r.id === id);

test("a helper from a past, wrapped parent whose PR merged and who completed is archived as landed", () => {
  const l = run([S("session_a")], { session_a: result(pr(208)) });
  assert.equal(row(l, "session_a").verdict, "archive");
  assert.match(row(l, "session_a").pr, /discipline#208 merged/);
});
test("a completed helper with no PR is NOT LANDED, carries its last summary, and is never in the archive list", () => {
  const l = run([S("session_b", { post_turn_summary: { recent_action: "Built the thing, never opened a PR" } })]);
  assert.equal(row(l, "session_b").verdict, "not-landed");
  assert.match(row(l, "session_b").summary, /never opened a PR/);
  assert.deepEqual(l.archive, []);
});
test("a parent-accepted helper with no PR becomes archivable (research-only return banked)", () => {
  const l = run([S("session_c")], {}, { accept: ["session_c"] });
  assert.equal(row(l, "session_c").verdict, "archive");
  assert.match(row(l, "session_c").reason, /accepted/);
});
test("an open PR keeps the helper, and a closed-unmerged PR is NOT LANDED", () => {
  const l = run([S("session_d"), S("session_e")], { session_d: result(pr(1, { state: "open", pull_request: {} })), session_e: result(pr(2, { pull_request: { merged_at: null } })) });
  assert.equal(row(l, "session_d").verdict, "keep");
  assert.equal(row(l, "session_e").verdict, "not-landed");
  assert.match(row(l, "session_e").reason, /closed unmerged/);
});
test("a truncated or unreadable lookup is unknown, kept, never archived (fail closed)", () => {
  const l = run([S("session_f"), S("session_g")], { session_f: { total_count: 140, incomplete_results: false, items: [] }, session_g: { error: "HTTP 403" } });
  for (const id of ["session_f", "session_g"]) assert.equal(row(l, id).verdict, "unknown");
  assert.deepEqual(l.archive, []);
});
test("a working helper is kept, an archived session and the caller's own id are left out, a parent is never a row", () => {
  const l = run([S("session_h", { status_bucket: "SESSION_STATUS_BUCKET_WORKING" }), S("session_i", { session_status: "SESSION_STATUS_ARCHIVED" }), S(SELF)], { session_h: result(pr(3)) });
  assert.deepEqual(l.rows.map((r) => r.id), ["session_h"]);
  assert.equal(row(l, "session_h").verdict, "keep");
});
test("a landed id recorded by lane-end counts as merged without a lookup", () => {
  const l = run([S("session_j")], {}, { landedIds: ["session_j"] });
  assert.equal(row(l, "session_j").verdict, "archive");
});
test("a helper under a wrapped parent is re-pointed; the row names its parent and the lane key from its tags", () => {
  const l = run([S("session_k", { tags: ["helper", "s91-PF1655"], status_bucket: "SESSION_STATUS_BUCKET_WORKING" })]);
  assert.equal(row(l, "session_k").parent, "session_old");
  assert.equal(row(l, "session_k").lane, "PF1655");
  assert.deepEqual(l.repoint.map((r) => r.id), ["session_k"]);
});
test("the render is one table plus Archive / Not landed / Re-point lists in the format the Stop hook reads, pipes escaped", () => {
  const l = run([S("session_a", { title: "Helper · a | b — no action needed" }), S("session_b")], { session_a: result(pr(208)) });
  const t = renderLedger(l, NOW);
  assert.match(t, /^\| id \| helper \| lane \| parent \| PR \| last summary \| verdict \|$/m);
  assert.match(t, /a \\\| b/);
  assert.match(t, /## Archive \(1\)\n- session_a \|/);
  assert.match(t, /## Not landed \(1\)\n- session_b \|/);
  assert.match(t, /Helpers: session_b\b/);
});
test("the same session on two overlapping pages is one row", () => {
  const l = run([S("session_a"), S("session_a")], { session_a: result(pr(208)) });
  assert.deepEqual(l.rows.map((r) => r.id), ["session_a"]);
});
test("prLookup asks for the id across all states in MrJarrad's repos, once", () => {
  const seen = [];
  prLookup((q) => { seen.push(q); return result(); })("session_x");
  assert.deepEqual(seen, ["is:pr user:MrJarrad session_x"]);
});
test("the CLI reads saved list_sessions pages, writes the ledger into the vault, and exits 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-"));
  const page = join(dir, "p.json"), prs = join(dir, "prs.json");
  writeFileSync(page, JSON.stringify({ ccr: { data: [parent("session_old", "x (wrapped)"), S("session_a")] } }));
  writeFileSync(prs, JSON.stringify({ session_a: result(pr(208)) }));
  const script = join(dirname(fileURLToPath(import.meta.url)), "helper-ledger.mjs");
  const r = spawnSync(process.execPath, [script, "--self", SELF, "--sessions", page, "--prs-file", prs, "--vault", dir, "--now", NOW], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /## Archive \(1\)/);
  assert.match(readFileSync(join(dir, "orchestrator", "helper-ledger.md"), "utf8"), /session_a/);
});
