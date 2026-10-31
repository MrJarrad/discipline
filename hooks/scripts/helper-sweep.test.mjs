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

test("a wrapped parent session from an earlier day is archived", () => {
  const r = classify({ now: NOW, self: "me", sessions: [
    s("p_old", "Portfolio · 28 Oct (wrapped)", { created_at: "2026-10-28T08:00:00Z" }),
  ] });
  assert.deepEqual(ids(r.archive), ["p_old"]);
});

test("a session titled '← talk here' is never archived, whatever its age or bucket", () => {
  const r = classify({ now: NOW, self: "me", sessions: [
    s("p_talk", "Portfolio · 27 Oct (wrapped) ← talk here", { created_at: "2026-10-27T08:00:00Z" }),
  ] });
  assert.deepEqual(ids(r.archive), []);
  assert.deepEqual(ids(r.keep), ["p_talk"]);
});

test("today's wrapped parent and the sweeping session itself are left alone", () => {
  const r = classify({ now: NOW, self: "me", sessions: [
    s("p_today", "Portfolio · 31 Oct (wrapped)"),
    s("me", "Portfolio · 31 Oct ← talk here"),
  ] });
  assert.deepEqual(ids(r.archive), []);
  assert.deepEqual(ids(r.keep), ["p_today"]);
});

test("an earlier-day parent never retitled '(wrapped)' is surfaced, not archived", () => {
  const r = classify({ now: NOW, self: "me", sessions: [
    s("p_open", "Portfolio · 29 Oct", { created_at: "2026-10-29T08:00:00Z" }),
  ] });
  assert.deepEqual(ids(r.archive), []);
  assert.deepEqual(ids(r.surface), ["p_open"]);
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
  assert.deepEqual(ids(r.keep), ["h_busy", "h_running", "p_live"]);
});

test("lock 2: a helper left blocked, review-ready or failed under a wrapped parent is surfaced, never silently left", () => {
  const r = classify({ now: NOW, self: "me", sessions: [WRAPPED_P,
    h("h_blocked", "p_w", { status_bucket: "SESSION_STATUS_BUCKET_BLOCKED" }),
    h("h_ready", "p_w", { status_bucket: "SESSION_STATUS_BUCKET_REVIEW_READY" }),
    h("h_failed", "p_w", { status_bucket: "SESSION_STATUS_BUCKET_FAILED" }),
  ] });
  assert.deepEqual(ids(r.surface), ["h_blocked", "h_failed", "h_ready"]);
  assert.deepEqual(ids(r.archive), ["p_w"]);
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
  assert.ok(r.stdout.slice(arch, keep).includes("p_w"));
  assert.ok(!r.stdout.includes("x_arch"));
  assert.ok(r.stdout.slice(keep, surf).includes("h_look"));
  assert.ok(r.stdout.slice(surf).includes("h_blocked"));
});
