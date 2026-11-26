// Helper lifecycle (HARD-RULES 19: DISC-291 rules 1 and 2, DISC-335 the ledger), proven through helper-sweep.mjs and
// helper-ledger.mjs. Edge cases live in their own tests; this file holds one case per clause of the rule.
// Run: node --test hooks/scripts/helper-lifecycle-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classify, cockpitHelperIds, helpersLine } from "./helper-sweep.mjs";
import { buildLedger } from "./helper-ledger.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NOW = "2026-11-15T09:00:00Z";
const helper = (id, o = {}) => ({ id, title: `Helper · task ${id} — no action needed`, session_status: "SESSION_STATUS_IDLE", updated_at: "2026-11-15T08:30:00Z", parent_session_id: "session_p", status_bucket: "SESSION_STATUS_BUCKET_COMPLETED", ...o });
const parent = (title) => ({ id: "session_p", title, session_status: "SESSION_STATUS_IDLE", updated_at: NOW, status_bucket: "SESSION_STATUS_BUCKET_WORKING" });
const ids = (list) => list.map((x) => x.id);

test("the rule names its scripts", () => {
  const h = readFileSync(join(root, "skills/routing/references/HARD-RULES.md"), "utf8");
  for (const s of ["**The helper ledger is the sweep", "**Rule 1: a helper whose work has landed ends archived", "**Rule 2: a helper still holding open work", "helper-ledger.mjs", "helper-sweep.mjs"]) assert.ok(h.includes(s), s);
  assert.ok(readFileSync(join(root, "skills/wrap/references/CLOSING-CHECKS.md"), "utf8").includes("`Helpers:` line"));
});

test("rule 1: under a live parent a landed helper is archived, and so is a completed one quiet past 12 hours; a fresh one is kept", () => {
  const sessions = [parent("portfolio · 15 Nov ← talk here"), helper("session_merged"), helper("session_quiet", { updated_at: "2026-11-14T08:00:00Z" }), helper("session_fresh")];
  const out = classify({ sessions, self: "session_me", now: NOW, merged: ["session_merged"] });
  assert.deepEqual(ids(out.archive).sort(), ["session_merged", "session_quiet"]);
  assert.deepEqual(ids(out.keep), ["session_fresh"]);
});

test("rule 1: a helper with an open PR or an unanswered operator ask is never archived; under a wrapped parent it is a Re-point row", () => {
  const sessions = [parent("portfolio · 14 Nov (wrapped)"), helper("session_pr"), helper("session_ask")];
  const out = classify({ sessions, self: "session_me", now: NOW, keep: ["session_pr"], waiting: ["session_ask"] });
  assert.deepEqual(out.archive, []);
  assert.deepEqual(ids(out.repoint).sort(), ["session_ask", "session_pr"]);
  assert.match(out.repoint[0].message, /session_me is your parent now/);
});

test("rule 2: the Helpers: line carries ids, and the next parent reads ids from the last five lines", () => {
  assert.equal(helpersLine({ keep: [{ id: "session_a" }], surface: [{ id: "session_b" }] }), "Helpers: session_a, session_b");
  const cockpit = ["Helpers: session_old", ...["a", "b", "c", "d", "e"].map((x) => `wrap ${x} · Helpers: session_${x}`)].join("\n");
  assert.deepEqual(cockpitHelperIds(cockpit), ["session_a", "session_b", "session_c", "session_d", "session_e"]);
});

test("DISC-335: a completed helper with no PR found is Not landed until the parent accepts it; --waiting keeps it", () => {
  const run = (extra) => buildLedger({ sessions: [parent("p · 14 Nov (wrapped)"), helper("session_a")], self: "session_me", now: NOW, prs: [], ...extra }).rows.find((r) => r.id === "session_a");
  assert.equal(run({}).verdict, "not-landed");
  assert.match(run({}).pr, /PR not found/);
  assert.equal(run({ accept: ["session_a"] }).verdict, "archive");
  assert.equal(run({ waiting: ["session_a"] }).verdict, "keep");
});

test("rule 1 through the CLI: --waiting names whole ids, so only the helper named is spared", () => {
  const f = join(mkdtempSync(join(tmpdir(), "helper-law-")), "sessions.json");
  writeFileSync(f, JSON.stringify({ data: [parent("portfolio · 14 Nov (wrapped)"), helper("session_ask"), helper("session_ask2")] }));
  const sweep = (...extra) => spawnSync(process.execPath, [join(root, "hooks/scripts/helper-sweep.mjs"), "--self", "session_me", "--now", NOW, "--sessions", f, ...extra], { encoding: "utf8" }).stdout;
  assert.match(sweep(), /## Archive \(2\)/);
  // The flag is parsed into a list of whole ids. Left as raw text it would be matched by substring, and
  // session_ask would be spared by a --waiting that only names session_ask2.
  const one = sweep("--waiting", "session_ask2");
  assert.match(one, /## Archive \(1\)\n- session_ask \|/);
  assert.match(one, /## Re-point \(1\)\n- session_ask2 \|/);
  const both = sweep("--waiting", "session_ask,session_ask2");
  assert.match(both, /## Archive \(0\)/);
  assert.match(both, /## Re-point \(2\)/);
});
