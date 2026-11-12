// DISC-295 (ruling 2026-11-12-orchestrator-takes-charge-of-the-backlog): a parent keeps each project at lane capacity
// from the backlog. Run: node --test hooks/scripts/lane-capacity.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAPACITY, laneCapacity } from "./lane-capacity.mjs";

const script = fileURLToPath(new URL("./lane-capacity.mjs", import.meta.url));
const FM = (px) => `---\nname: x\nkind: backlog\nprefix: ${px}\n---\n`;
const BACKLOG = (px, open, done = "") => FM(px) + `## Open\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n${open}\n\n## Done\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n${done}\n`;

function vault() {
  const v = mkdtempSync(join(tmpdir(), "lc-"));
  const put = (p, t) => { mkdirSync(join(v, p, ".."), { recursive: true }); writeFileSync(join(v, p), t); };
  put("projects/portfolio/portfolio-backlog.md", BACKLOG("PF",
    ["| PF-1 | build the footer. Agent. | d | open |", "| PF-2 | grid audit. Agent. | d | open |", "| PF-3 | pick the hero colour. Operator. | d | open |",
      "| PF-4 | unlabelled item | d | open |", "| PF-5 | agent but on a PR. Agent. | d | in flight (#9) |", "| ~~PF-6~~ | struck. Agent. | d | open |",
      "| PF-7 | waits on him. Agent. | d | waiting on operator |"].join("\n"),
    "| PF-8 | done. Agent. | d | open |"));
  put("projects/jhd-discipline/jhd-discipline-backlog.md", BACKLOG("DISC", "| DISC-1 | tool. Agent. | d | open |\n| DISC-2 | rule. Agent. | d | open |"));
  put("projects/handoff-toolkit/handoff-toolkit-backlog.md", BACKLOG("HT", "| HT-1 | only operator. Operator. | d | open |"));
  return v;
}
const lane = (id, project, state = "running") => ({ id, project, state });

test("capacity is portfolio 5, discipline 1, handoff-toolkit 1", () => {
  assert.deepEqual({ PF: CAPACITY.PF, DISC: CAPACITY.DISC, HT: CAPACITY.HT }, { PF: 5, DISC: 1, HT: 1 });
});

test("portfolio with 2 running lanes and 2 open agent rows is under capacity and names both rows to dispatch", () => {
  const r = laneCapacity(vault(), ["PF"], [lane("session_a", "PF"), lane("session_b", "PF")]);
  assert.equal(r.ok, true);
  const pf = r.projects.PF;
  assert.equal(pf.running, 2); assert.equal(pf.gap, 3);
  assert.deepEqual(pf.dispatch.map((x) => x.id), ["PF-1", "PF-2"]); // Operator, unlabelled, in-flight, struck, waiting and Done rows are not agent-ownable
  assert.equal(r.under, true);
});

test("a lane waiting on the operator's look does not count toward capacity", () => {
  const r = laneCapacity(vault(), ["DISC"], [lane("session_a", "DISC", "waiting-operator")]);
  assert.equal(r.projects.DISC.running, 0);
  assert.equal(r.projects.DISC.waiting, 1);
  assert.equal(r.under, true);
});

test("a project at capacity, or with no open agent row, is not under capacity", () => {
  assert.equal(laneCapacity(vault(), ["DISC"], [lane("session_a", "DISC")]).under, false);
  assert.equal(laneCapacity(vault(), ["HT"], []).under, false);
});

test("lanes of another project never count, and a lane in a state that is not running or waiting is ignored", () => {
  const r = laneCapacity(vault(), ["DISC"], [lane("session_a", "PF"), lane("session_b", "DISC", "completed")]);
  assert.equal(r.projects.DISC.running, 0);
});

test("a stated reason per gap clears the project; the reason is echoed", () => {
  const r = laneCapacity(vault(), ["PF"], [], { PF: "all open rows edit one file; a second lane would conflict" });
  assert.equal(r.under, false);
  assert.match(r.projects.PF.reason, /one file/);
});

test("an unknown prefix, or one with no capacity set, is a refusal", () => {
  assert.equal(laneCapacity(vault(), ["ZZ"], []).ok, false);
  assert.equal(laneCapacity(vault(), ["CV"], []).ok, false);
});

test("the CLI prints UNDER CAPACITY and the rows and exits 1; at capacity it exits 0", () => {
  const v = vault();
  const f = join(mkdtempSync(join(tmpdir(), "lcf-")), "lanes.json");
  writeFileSync(f, JSON.stringify([lane("session_a", "PF")]));
  const under = spawnSync(process.execPath, [script, "--vault", v, "--projects", "PF,DISC", "--lanes", f], { encoding: "utf8" });
  assert.equal(under.status, 1);
  assert.match(under.stdout, /UNDER CAPACITY/);
  assert.match(under.stdout, /PF-1/);
  assert.match(under.stdout, /DISC-1/);
  const ok = spawnSync(process.execPath, [script, "--vault", v, "--projects", "DISC", "--lanes", f, "--reason", "DISC=owner of the live release"], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.doesNotMatch(ok.stdout, /UNDER CAPACITY/);
});
