// DISC-336: the parent is told which rows to start while doers are under target. Run: node --test hooks/scripts/next-row.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAPACITY } from "./lane-capacity.mjs";
import { nextRows } from "./next-row.mjs";

const script = fileURLToPath(new URL("./next-row.mjs", import.meta.url));
const FM = (px) => `---\nname: x\nkind: backlog\nprefix: ${px}\n---\n`;
const TBL = "| # | Item | Raised | Status | Notes |\n| - | --- | --- | --- | --- |\n";
function vault(pfRows = 12) {
  const v = mkdtempSync(join(tmpdir(), "nr-"));
  const put = (p, t) => { mkdirSync(join(v, p, ".."), { recursive: true }); writeFileSync(join(v, p), t); };
  const rows = Array.from({ length: pfRows }, (_, i) => `| PF-${i + 1} | row ${i + 1}. Agent. | d | open | |`).join("\n");
  put("projects/portfolio/portfolio-backlog.md", FM("PF") + `## Up next\n\n1. PF-3: first\n\n## Open\n\n${TBL}${rows}\n\n## Done archive\n\n${TBL}`);
  put("projects/jhd-discipline/jhd-discipline-backlog.md", FM("DISC") + `## Open\n\n${TBL}| DISC-1 | tool. Agent. | d | open | |\n| DISC-2 | rule. Agent. | d | open | |\n\n## Done archive\n\n${TBL}`);
  return v;
}
const lane = (id, project, state = "running", extra = {}) => ({ id, project, state, ...extra });
const doers = (n, project = "PF") => Array.from({ length: n }, (_, i) => lane(`s${project}${i}`, project));

test("portfolio's lane cap fits the 8-doer target (it was 5, the binding limit)", () => {
  assert.ok(CAPACITY.PF >= 8);
});

test("under target: the next rows are the top of the ranked list, one per missing doer, Up next first", () => {
  const n = nextRows({ vault: vault(), prefixes: ["PF", "DISC"], lanes: doers(6) });
  assert.equal(n.gap, 2);
  assert.deepEqual(n.start.map((e) => e.ids[0]), ["PF-3", "PF-1"]);
  assert.equal(n.under, true);
});

test("reviewers and lanes waiting on the operator do not count as working doers", () => {
  const lanes = [...doers(5), lane("r1", "PF", "running", { role: "reviewer" }), lane("r2", "PF", "running", { role: "reviewer" }), lane("w1", "PF", "waiting-operator")];
  const n = nextRows({ vault: vault(), prefixes: ["PF"], lanes });
  assert.equal(n.working, 5);
  assert.equal(n.waiting, 1);
  assert.equal(n.gap, 3);
});

test("at target nothing is under; a landed lane (any other state) opens a gap", () => {
  assert.equal(nextRows({ vault: vault(), prefixes: ["PF"], lanes: doers(8) }).under, false);
  const landed = [...doers(7), lane("done1", "PF", "landed")];
  assert.equal(nextRows({ vault: vault(), prefixes: ["PF"], lanes: landed }).gap, 1);
});

test("a per-project cap holds a project back and the gap fills from the next project", () => {
  const m = nextRows({ vault: vault(), prefixes: ["PF", "DISC"], lanes: doers(8), requested: 10 });
  assert.equal(m.gap, 2);
  assert.deepEqual(m.start.map((e) => e.ids[0]), ["DISC-1"]); // PF is at its cap of 8, DISC takes one lane and no more
  assert.ok(m.skippedCap.some((e) => e.project === "PF") && m.skippedCap.some((e) => e.ids[0] === "DISC-2"));
});

test("rows held by a running lane are not offered twice", () => {
  const n = nextRows({ vault: vault(), prefixes: ["PF"], lanes: [lane("a", "PF", "running", { rows: ["PF-3"] })] });
  assert.ok(!n.start.some((e) => e.ids.includes("PF-3")));
});

test("--reason clears the gap and is echoed; exit codes: 1 under target, 0 reasoned", () => {
  const lanes = join(mkdtempSync(join(tmpdir(), "nrl-")), "l.json");
  writeFileSync(lanes, JSON.stringify(doers(2)));
  const v = vault();
  const under = spawnSync(process.execPath, [script, "--vault", v, "--projects", "PF", "--lanes", lanes], { encoding: "utf8" });
  assert.equal(under.status, 1);
  assert.match(under.stdout, /UNDER TARGET by \d+: start next/);
  const ok = spawnSync(process.execPath, [script, "--vault", v, "--projects", "PF", "--lanes", lanes, "--reason", "waiting on a review slot"], { encoding: "utf8" });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /reasoned: waiting on a review slot/);
  assert.equal(spawnSync(process.execPath, [script], { encoding: "utf8" }).status, 2);
});
