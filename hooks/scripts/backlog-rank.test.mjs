// DISC-336 (ruling 2026-11-15-s91-autonomous-backlog-throughput): classify every open backlog row and rank the agent-doable ones.
// Run: node --test hooks/scripts/backlog-rank.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rankBacklogs, targetDoers, DEFAULT_TARGET } from "./lib/backlog-rank.mjs";

const FM = (px) => `---\nname: x\nkind: backlog\nprefix: ${px}\n---\n`;
const TBL = "| # | Item | Raised | Status | Notes |\n| - | --- | --- | --- | --- |\n";
const backlog = (px, upNext, open, done = "") =>
  FM(px) + `## Up next\n\n${upNext}\n\n## Open\n\n${TBL}${open}\n\n## Done archive\n\n${TBL}${done}\n`;
const GOLIVE = "## 1. Bugs\n\n- [x] PF-9 · already done\n- [ ] PF-5 · a go-live agent row\n- [ ] PF-3 · a go-live mac row\n\n## 5. After\n\n- [ ] PF-8 · after launch\n";

function vault({ goLive = GOLIVE } = {}) {
  const v = mkdtempSync(join(tmpdir(), "br-"));
  const put = (p, t) => { mkdirSync(join(v, p, ".."), { recursive: true }); writeFileSync(join(v, p), t); };
  put("projects/portfolio/portfolio-backlog.md", backlog("PF", "1. PF-7: an up-next row\n2. PF-5: also on go-live",
    [
      "| PF-1 | no label at all | d | open | |",
      "| PF-2 | operator label. Operator. | d | open | |",
      "| PF-3 | webkit check. Mac. | d | open | |",
      "| PF-4 | blocked by PF-1 until it lands. Agent. | d | open | |",
      "| PF-5 | go-live agent row. Agent. | d | open | |",
      "| PF-6 | plain tail row. Agent. | d | open | |",
      "| PF-7 | up-next row. Agent. | d | open | |",
      "| PF-8 | after launch. Agent. | d | open | |",
      "| PF-10 | in flight. Agent. | d | in flight (#9) | |",
      "| PF-11 | he must answer. Agent. | d | waiting on operator | |",
      "| ~~PF-12~~ | struck. Agent. | d | open | |",
      "| PF-13 | second mac. Mac. | d | open | |",
      "| PF-14 | hook family, with PF-6. Agent. | d | open | |",
      "| PF-15 | waits on PF-99 which is closed. Agent. | d | open | |",
    ].join("\n"), "| PF-99 | closed. Agent. | d | done (#1 abc) | |"));
  put("projects/portfolio/portfolio-go-live.md", goLive);
  put("projects/jhd-discipline/jhd-discipline-backlog.md", backlog("DISC", "1. DISC-1: the discipline row", "| DISC-1 | tool. Agent. | d | open | |"));
  return v;
}
const ids = (xs) => xs.map((e) => e.ids.join("+"));

test("a row is classed by its status and its trailing owner label; an unlabelled row is unknown, never cloud-now", () => {
  const r = rankBacklogs(vault(), ["PF", "DISC"]);
  const cls = Object.fromEntries(r.rows.map((x) => [x.id, x.class]));
  assert.equal(cls["PF-1"], "unknown");
  assert.equal(cls["PF-2"], "operator");
  assert.equal(cls["PF-3"], "mac");
  assert.equal(cls["PF-5"], "cloud-now");
  assert.equal(cls["PF-10"], "busy");
  assert.equal(cls["PF-11"], "operator"); // waiting on operator beats an Agent. label
  assert.equal(cls["PF-12"], undefined); // struck
  assert.equal(cls["PF-99"], undefined); // Done
});

test("a row blocked by an id that is still open is blocked-by; a closed blocker does not block", () => {
  const cls = Object.fromEntries(rankBacklogs(vault(), ["PF"]).rows.map((x) => [x.id, x.class]));
  assert.equal(cls["PF-4"], "blocked-by");
  assert.equal(cls["PF-15"], "cloud-now");
});

test("ranked list: unticked go-live lines in file order, then Up next order, then the rest by row number; Mac rows are one entry", () => {
  const r = rankBacklogs(vault(), ["PF", "DISC"]);
  assert.deepEqual(ids(r.ranked), ["PF-5", "PF-3+PF-13", "PF-7", "DISC-1", "PF-6+PF-14", "PF-15"]);
  const mac = r.ranked.find((e) => e.kind === "mac-job");
  assert.deepEqual(mac.ids, ["PF-3", "PF-13"]); // one Mac job, placed at its best member's rank (PF-3 is go-live line 2)
});

test("excluded from the ranked list: operator, blocked-by, unknown, busy; unknown rows are listed under their own heading", () => {
  const r = rankBacklogs(vault(), ["PF", "DISC"]);
  const flat = r.ranked.flatMap((e) => e.ids);
  for (const id of ["PF-1", "PF-2", "PF-4", "PF-10", "PF-11"]) assert.ok(!flat.includes(id), id);
  assert.deepEqual(r.unknown.map((x) => x.id), ["PF-1"]);
});

test("a go-live row after launch (group 5) is blocked-by while any group 1-4 line is unticked, and free once they are all ticked", () => {
  const cls = (v) => Object.fromEntries(rankBacklogs(v, ["PF"]).rows.map((x) => [x.id, x.class]));
  assert.equal(cls(vault())["PF-8"], "blocked-by");
  assert.equal(cls(vault({ goLive: "## 1. Bugs\n\n- [x] PF-5 · done\n\n## 5. After\n\n- [ ] PF-8 · after launch\n" }))["PF-8"], "cloud-now");
});

test("a 'with <row>' hint bundles two cloud-now rows into one helper entry", () => {
  const e = rankBacklogs(vault(), ["PF"]).ranked.find((x) => x.ids.includes("PF-14"));
  assert.deepEqual(e.ids, ["PF-6", "PF-14"]);
  assert.equal(e.kind, "helper");
});

test("a project without a go-live file ranks from Up next alone", () => {
  const r = rankBacklogs(vault(), ["DISC"]);
  assert.deepEqual(ids(r.ranked), ["DISC-1"]);
});

test("a row already held by a running lane is not offered again", () => {
  const r = rankBacklogs(vault(), ["PF"], { held: ["PF-5"] });
  assert.ok(!r.ranked.flatMap((e) => e.ids).includes("PF-5"));
});

test("target: 8 doers by default; the local nproc/2 ceiling lowers it, a create_session surface is not nproc-bound", () => {
  assert.equal(DEFAULT_TARGET, 8);
  assert.equal(targetDoers({ nproc: 4, local: true }).target, 2);
  assert.equal(targetDoers({ nproc: 4 }).target, 8);
  assert.equal(targetDoers({ nproc: 64, local: true }).target, 8);
});
