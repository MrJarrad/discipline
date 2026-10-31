// DISC-211: helper-sweep sorts un-archived sessions into archive / keep / surface.
// Fixtures follow the real list_sessions shape (id, title, parent_session_id,
// status_bucket, created_at, updated_at). Run: node --test hooks/scripts/helper-sweep.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "./helper-sweep.mjs";

const NOW = "2026-10-31T14:00:00Z";
const s = (id, title, extra = {}) => ({ id, title, status_bucket: "SESSION_STATUS_BUCKET_COMPLETED",
  created_at: "2026-10-31T09:00:00Z", updated_at: "2026-10-31T13:00:00Z", ...extra });
const ids = (rows) => rows.map((r) => r.id).sort();

// Operator 2026-10-31, verbatim: "it's important the we don't archive the parent sessions though,
// i'm a bit nervous about that". A helper is a session with parent_session_id AND a title starting
// "Helper ·"; every other session is a parent and lands in no list at all.
const none = (r, id) => ["archive", "keep", "surface"].every((k) => !ids(r[k]).includes(id));

test("a wrapped parent session from an earlier day is never archived, and is in no list", () => {
  const r = classify({ now: NOW, self: "me", sessions: [
    s("p_old", "Portfolio · 28 Oct (wrapped)", { created_at: "2026-10-28T08:00:00Z" }),
  ] });
  assert.deepEqual(ids(r.archive), []);
  assert.ok(none(r, "p_old"));
});

test("no parent session lands in any list: '← talk here', today's, an unwrapped earlier one, or the sweeper itself", () => {
  const r = classify({ now: NOW, self: "me", sessions: [
    s("p_talk", "Portfolio · 27 Oct (wrapped) ← talk here", { created_at: "2026-10-27T08:00:00Z" }),
    s("p_today", "Portfolio · 31 Oct (wrapped)"),
    s("p_open", "Portfolio · 29 Oct", { created_at: "2026-10-29T08:00:00Z" }),
    s("me", "Helper · this sweep — no action needed", { parent_session_id: "p_today" }),
  ] });
  for (const id of ["p_talk", "p_today", "p_open", "me"]) assert.ok(none(r, id), id);
});

test("a child session whose title does not start 'Helper ·' counts as a parent and is never archived", () => {
  const r = classify({ now: NOW, self: "me", sessions: [
    s("p_w", "Portfolio · 30 Oct (wrapped)", { created_at: "2026-10-30T08:00:00Z" }),
    s("c_orch", "Portfolio · 31 Oct (wrapped)", { parent_session_id: "p_w" }),
  ] });
  assert.ok(none(r, "c_orch"));
});

const LIVE = s("p_live", "Portfolio · 31 Oct ← talk here");
const WRAPPED_P = s("p_w", "Portfolio · 30 Oct (wrapped)", { created_at: "2026-10-30T08:00:00Z" });
const h = (id, parent, extra = {}) => s(id, `Helper · ${id} — no action needed`, { parent_session_id: parent, ...extra });

test("lock 1: a helper whose PR still waits on a look or review stays, even under a wrapped parent", () => {
  const r = classify({ now: NOW, self: "me", keep: ["h_look"], sessions: [WRAPPED_P, h("h_look", "p_w")] });
  assert.deepEqual(ids(r.keep), ["h_look"]);
  assert.ok(!ids(r.archive).includes("h_look"));
});

test("lock 1: a completed helper whose parent wrapped (another session took over) is archived", () => {
  const r = classify({ now: NOW, self: "me", sessions: [WRAPPED_P, h("h_done", "p_w")] });
  assert.ok(ids(r.archive).includes("h_done"));
});

test("a completed helper whose parent is already archived (absent from the list) is archived", () => {
  const r = classify({ now: NOW, self: "me", sessions: [h("h_orphan", "p_gone")] });
  assert.deepEqual(ids(r.archive), ["h_orphan"]);
});

test("a live parent's helper stays with that parent, unless its PR is merged and it is completed", () => {
  const r = classify({ now: NOW, self: "me", merged: ["h_merged", "h_busy"], sessions: [LIVE,
    h("h_running", "p_live", { status_bucket: "SESSION_STATUS_BUCKET_WORKING" }),
    h("h_merged", "p_live"),
    h("h_busy", "p_live", { status_bucket: "SESSION_STATUS_BUCKET_WORKING" }),
  ] });
  assert.deepEqual(ids(r.archive), ["h_merged"]);
  assert.deepEqual(ids(r.keep), ["h_busy", "h_running"]);
});

test("lock 2: a helper left blocked, review-ready or failed under a wrapped parent is surfaced, never silently left", () => {
  const r = classify({ now: NOW, self: "me", sessions: [WRAPPED_P,
    h("h_blocked", "p_w", { status_bucket: "SESSION_STATUS_BUCKET_BLOCKED" }),
    h("h_ready", "p_w", { status_bucket: "SESSION_STATUS_BUCKET_REVIEW_READY" }),
    h("h_failed", "p_w", { status_bucket: "SESSION_STATUS_BUCKET_FAILED" }),
  ] });
  assert.deepEqual(ids(r.surface), ["h_blocked", "h_failed", "h_ready"]);
  assert.deepEqual(ids(r.archive), []);
});

test("lock 2: a 'working' helper under a wrapped parent is surfaced once it has gone quiet past STALE_HOURS (12)", async () => {
  const { STALE_HOURS } = await import("./helper-sweep.mjs");
  assert.equal(STALE_HOURS, 12);
  const r = classify({ now: NOW, self: "me", sessions: [WRAPPED_P,
    h("h_quiet", "p_w", { status_bucket: "SESSION_STATUS_BUCKET_WORKING", updated_at: "2026-10-31T01:59:00Z" }),
    h("h_recent", "p_w", { status_bucket: "SESSION_STATUS_BUCKET_WORKING", updated_at: "2026-10-31T02:01:00Z" }),
  ] });
  assert.deepEqual(ids(r.surface), ["h_quiet"]);
  assert.deepEqual(ids(r.keep), ["h_recent"]);
});

test("CLI: reads raw list_sessions pages, merges them, skips archived sessions, prints the three lists", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { spawnSync } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "helper-sweep-"));
  const p1 = join(dir, "p1.json"), p2 = join(dir, "p2.json");
  writeFileSync(p1, JSON.stringify({ ccr: { data: [WRAPPED_P, s("x_arch", "Old · 1 Oct (wrapped)", { created_at: "2026-10-01T00:00:00Z", session_status: "SESSION_STATUS_ARCHIVED" })] } }));
  writeFileSync(p2, JSON.stringify({ data: [h("h_look", "p_w"), h("h_blocked", "p_w", { status_bucket: "SESSION_STATUS_BUCKET_BLOCKED" })] }));
  const r = spawnSync(process.execPath, [new URL("./helper-sweep.mjs", import.meta.url).pathname,
    "--self", "me", "--now", NOW, "--sessions", p1, "--sessions", p2, "--keep", "h_look"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const [arch, keep, surf] = ["## Archive", "## Keep", "## Surface"].map((hd) => r.stdout.indexOf(hd));
  assert.ok(arch >= 0 && keep > arch && surf > keep, r.stdout);
  assert.ok(!r.stdout.includes("p_w |"));
  assert.ok(r.stdout.slice(arch, keep).includes("(0)"));
  assert.ok(!r.stdout.includes("x_arch"));
  assert.ok(r.stdout.slice(keep, surf).includes("h_look"));
  assert.ok(r.stdout.slice(surf).includes("h_blocked"));
});

// Review r1 on #124 (amber + three notes).
test("r1 amber: a parent listed with session_status ARCHIVED is not live, so its completed helper is archived", () => {
  const r = classify({ now: NOW, self: "me", sessions: [
    s("p_arch", "Portfolio · 29 Oct", { created_at: "2026-10-29T08:00:00Z", session_status: "SESSION_STATUS_ARCHIVED" }),
    h("h_under_arch", "p_arch"),
  ] });
  assert.deepEqual(ids(r.archive), ["h_under_arch"]);
});

test("r1 note: '(wrapped)' counts only as the title's end marker, so a live parent with it mid-title keeps its helpers", () => {
  const r = classify({ now: NOW, self: "me", sessions: [
    s("p_mid", "Notes on the (wrapped) gallery · 31 Oct ← talk here"),
    h("h_mid", "p_mid"),
  ] });
  assert.deepEqual(ids(r.keep), ["h_mid"]);
  assert.deepEqual(ids(r.archive), []);
});

test("r1 note: a working helper with no updated_at under a wrapped parent is surfaced, not kept forever", () => {
  const r = classify({ now: NOW, self: "me", sessions: [WRAPPED_P,
    h("h_noupd", "p_w", { status_bucket: "SESSION_STATUS_BUCKET_WORKING", updated_at: undefined }),
  ] });
  assert.deepEqual(ids(r.surface), ["h_noupd"]);
});

test("r1 note: --keep or --merged with no value prints the usage line and exits 2", async () => {
  const { spawnSync } = await import("node:child_process");
  const bin = new URL("./helper-sweep.mjs", import.meta.url).pathname;
  for (const flag of ["--keep", "--merged"]) {
    const r = spawnSync(process.execPath, [bin, "--self", "me", "--sessions", "x.json", flag], { encoding: "utf8" });
    assert.equal(r.status, 2, flag);
    assert.match(r.stderr, /^usage: helper-sweep\.mjs/, flag);
  }
});
