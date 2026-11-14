// archive-prep — DISC-325: the open-PR lookups the archive guard needs, run by a script so the parent does not hand-sequence them.
// Run: node --test hooks/scripts/archive-prep.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { prep, queriesFor } from "./archive-prep.mjs";

const found = (n) => ({ total_count: 1, incomplete_results: false, items: [{ number: n, state: "open", html_url: `https://github.com/mrjarrad/discipline/pull/${n}` }] });
const none = { total_count: 0, incomplete_results: false, items: [] };

test("queries: the session id, then head:<branch> for each branch, all open PRs", () => {
  assert.deepEqual(queriesFor("session_x", ["a/b", "c"]), ["is:pr is:open session_x", "is:pr is:open head:a/b", "is:pr is:open head:c"]);
});
test("a clear helper: ok, every query listed with its raw result", () => {
  const r = prep("session_x", ["b1"], () => none);
  assert.equal(r.ok, true);
  assert.deepEqual(r.lookups.map((l) => l.query), ["is:pr is:open session_x", "is:pr is:open head:b1"]);
  assert.deepEqual(r.open, []);
});
test("an open PR found by the session id is named and the verdict is not ok", () => {
  const r = prep("session_x", [], (q) => (q.endsWith("session_x") ? found(7) : none));
  assert.equal(r.ok, false);
  assert.deepEqual(r.open, ["mrjarrad/discipline#7"]);
});
test("an open PR found only by branch is named and the verdict is not ok", () => {
  const r = prep("session_x", ["b1"], (q) => (q.includes("head:b1") ? found(9) : none));
  assert.equal(r.ok, false);
  assert.deepEqual(r.open, ["mrjarrad/discipline#9"]);
});
test("a truncated or incomplete result is not ok (fail closed)", () => {
  assert.equal(prep("session_x", [], () => ({ ...none, total_count: 140 })).ok, false);
  assert.equal(prep("session_x", [], () => ({ ...none, incomplete_results: true })).ok, false);
});
test("a search that throws or returns something unreadable is not ok", () => {
  assert.equal(prep("session_x", [], () => { throw new Error("HTTP 403"); }).ok, false);
  assert.equal(prep("session_x", [], () => "nope").ok, false);
});
test("a branch name is passed as data: queries are exact strings, never a shell line", () => {
  assert.deepEqual(queriesFor("session_x", ["a;rm -rf x"]), ["is:pr is:open session_x", "is:pr is:open head:a;rm -rf x"]);
});
