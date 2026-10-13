/* row-alloc — the only thing that hands out a queue/backlog row number
   (backlog DISC-167: nobody types a new number, and a duplicate cannot land).

   One shared sequence per prefix: a project's queue and backlog both use
   `<PREFIX>-<n>`, so the next number is above every number used in EITHER file,
   struck rows included, and above any `Next free number: N` marker (a marker is
   a reservation). "Every file" means the local copy AND origin/main's copy —
   parallel sessions work on separate vault branches, so the local file alone
   misses what another session already took. Existing ranges are untouched.

   Concurrency: a lock in os.tmpdir() keyed by the vault's absolute path (so
   nothing needs gitignoring) is held across read -> pick -> write. A lock older
   than STALE_MS is broken (atomically: renamed to a unique name, then checked
   stale; a fresh lock taken by mistake is linked back). The lock file holds an
   owner token; release() only removes a lock that still carries its own. Two clones of the vault on different machines can
   still collide at git merge; `list-drift-check` (dup-id, across queue AND
   backlog) catches that on the next run.

   Interface:
     highestUsed(texts) -> number            ids + `Next free number` markers - 1
     remoteTexts(vault, rels, {fetch}) -> { texts, warnings }
     acquireVaultLock(vault) -> release()
     withVaultLock(vault, fn) -> fn()'s result (throws if the lock cannot be taken)
     lockPath(vault) -> string                                                  */
import { execFileSync } from "node:child_process";
import { closeSync, linkSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { tableRows } from "./queue-ids.mjs";

export const STALE_MS = 30_000;
export const WAIT_MS = 45_000; // above STALE_MS: a waiter outlasts a dead holder instead of failing first

export function highestUsed(texts) {
  let max = 0;
  for (const t of texts) {
    for (const r of tableRows(t)) {
      const n = parseInt(r.n, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    const m = /\*\*Next free number:\s*(\d+)/.exec(t);
    if (m && parseInt(m[1], 10) - 1 > max) max = parseInt(m[1], 10) - 1;
  }
  return max;
}

/* Best-effort: fetch origin main (short timeout), then read each file from
   origin/main. Offline or no origin -> a warning, local numbers only. */
export function remoteTexts(vault, rels, { fetch = true } = {}) {
  const texts = [];
  const warnings = [];
  const git = (args, timeout) => execFileSync("git", ["-C", vault, ...args], { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] });
  try {
    if (fetch) git(["fetch", "--quiet", "origin", "main"], 8000);
    git(["rev-parse", "--verify", "--quiet", "origin/main"], 3000);
  } catch (err) {
    warnings.push(`could not reach origin/main (${String(err.message).split("\n")[0]}); numbers checked against local files only — a parallel session's new rows are not visible`);
    return { texts, warnings };
  }
  for (const rel of rels) {
    try { texts.push(git(["show", `origin/main:${rel}`], 5000)); } catch { /* file not on origin/main yet */ }
  }
  return { texts, warnings };
}

export const lockPath = (vault) => join(tmpdir(), `discipline-rowid-${createHash("sha1").update(resolve(vault)).digest("hex").slice(0, 16)}.lock`);

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/* Break a stale lock so that two waiters cannot both win: rename is atomic, so
   only one waiter moves the stale file; the other's rename finds nothing (or a
   fresh lock, which the staleness check on the moved file catches and links back). */
function breakStale(path) {
  const moved = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.stale`;
  try { renameSync(path, moved); } catch { return; }
  try {
    if (Date.now() - statSync(moved).mtimeMs > STALE_MS) return;
    try { linkSync(moved, path); } catch { /* someone else holds it now; nothing more to undo */ }
  } catch { /* moved file vanished */ } finally { try { unlinkSync(moved); } catch {} }
}

/* Take the lock; returns release(). Prefer withVaultLock; lane-end holds it
   across the file writes only and releases before git. */
export function acquireVaultLock(vault) {
  const path = lockPath(vault);
  const token = `${process.pid}:${randomBytes(8).toString("hex")}`;
  const start = Date.now();
  let fd;
  for (;;) {
    try { fd = openSync(path, "wx"); writeSync(fd, token); break; } catch (err) {
      if (err.code !== "EEXIST") throw err;
      try { if (Date.now() - statSync(path).mtimeMs > STALE_MS) { breakStale(path); continue; } } catch { continue; }
      if (Date.now() - start > WAIT_MS) throw new Error(`row-alloc: could not take ${path} within ${WAIT_MS / 1000}s`);
      sleep(20 + Math.floor(Math.random() * 30));
    }
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try { closeSync(fd); } catch {}
    try { if (readFileSync(path, "utf8") === token) unlinkSync(path); } catch {}
  };
}

export function withVaultLock(vault, fn) {
  const release = acquireVaultLock(vault);
  try { return fn(); } finally { release(); }
}
