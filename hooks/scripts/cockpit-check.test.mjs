// 1.162.0: DISC-224 — the cockpit holds one wrap block, carries the queue as paths and counts
// (never rows), and names the helpers the next start sweeps. Run at wrap (CLOSING-CHECKS).
// Run: node --test hooks/scripts/cockpit-check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const bin = join(dirname(fileURLToPath(import.meta.url)), "cockpit-check.mjs");
const wrap = (n) => [
  `## Wrapped 2026-10-31 (cloud session ${n}) — portfolio`,
  "- **PORTFOLIO** → [[portfolio-handover]]: merged pf #408.",
  "- Helpers: session_aaa, session_bbb",
  "- Operator queue: PF 12 open → [[portfolio-queue]]",
  "",
].join("\n");
const vault = (cockpit) => {
  const d = mkdtempSync(join(tmpdir(), "cockpit-"));
  mkdirSync(join(d, "orchestrator"));
  writeFileSync(join(d, "orchestrator", "cockpit.md"), cockpit);
  return d;
};
const run = (d) => spawnSync(process.execPath, [bin, "--vault", d], { encoding: "utf8" });

test("one wrap block with a Helpers line and queue counts passes", () => {
  const r = run(vault(`**Archive:** [[cockpit-archive-2026-10]]\n\n${wrap(44)}`));
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("a second wrap block fails: older wraps move to the archive", () => {
  const r = run(vault(`${wrap(44)}\n${wrap(43)}`));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /2 `## Wrapped` blocks/);
});

test("a queue row in the cockpit fails: rows live in the queue files", () => {
  const r = run(vault(`${wrap(44)}\n## Needed from you\n\n| # | Needed |\n|---|---|\n| PF-982 | Look at the header |\n`));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /queue row PF-982/);
});

test("a wrap block with no Helpers line fails: the next start has nothing to sweep", () => {
  const r = run(vault(wrap(44).replace("- Helpers: session_aaa, session_bbb\n", "")));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Helpers:/);
});

test("a cockpit over the size cap fails, naming its size", () => {
  const r = run(vault(`${wrap(44)}\n${"- note line that runs on\n".repeat(400)}`));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /chars; the cap is 6000/);
});

test("the check writes nothing", () => {
  const d = vault(wrap(44));
  run(d);
  assert.equal(spawnSync("ls", [join(d, "orchestrator")], { encoding: "utf8" }).stdout.trim(), "cockpit.md");
});
