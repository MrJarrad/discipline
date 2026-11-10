// DISC-288: the pinned checklist mirrors the queue files; this script says what a session must change on it.
// Run: node --test hooks/scripts/queue-page-sync.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { syncPlan } from "./queue-page-sync.mjs";

const script = fileURLToPath(new URL("./queue-page-sync.mjs", import.meta.url));
const FM = (px, kind) => `---\nname: x\nkind: ${kind}\nprefix: ${px}\n---\n`;
function vault() {
  const v = mkdtempSync(join(tmpdir(), "qps-"));
  const put = (p, t) => { mkdirSync(join(v, p, ".."), { recursive: true }); writeFileSync(join(v, p), t); };
  put("projects/portfolio/portfolio-queue.md", FM("PF", "queue") + "| # | Needed | Where | Why | Recommended |\n| - | - | - | - | - |\n| PF-5 | look at footer | | | |\n| PF-6 | pick hero | | | |\n| ~~PF-7~~ | struck | | | |\n");
  put("projects/portfolio/portfolio-backlog.md", FM("PF", "backlog") + "## Open\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n| PF-8 | idea | d | waiting on operator |\n\n## Done\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n");
  return v;
}
const DOC = `# Needed from you

## Waiting on you

- [ ] **PF-5** look at footer
- [x] **PF-6** pick hero
- [ ] **PF-4** old row, since answered

## Running now

- [ ] D2 status out of the thread (session_019vvsKxkt4YUc2iRJhzm8jJ)
- [ ] A lane with no helper named

## Done this session

- [x] **PF-3** earlier
`;

test("open queue and waiting-backlog rows become checklist lines, row id first in bold; struck rows do not", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"] });
  assert.deepEqual(p.items, ["- [ ] **PF-5** look at footer", "- [ ] **PF-6** pick hero", "- [ ] **PF-8** idea"]);
});
test("against the live doc: missing open rows to add, landed rows to tick, his ticks to bank as answers", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: DOC });
  assert.deepEqual(p.toAdd, ["- [ ] **PF-8** idea"]);
  assert.deepEqual(p.toTick, ["PF-4"], "unticked on the page but no longer open in the queue");
  assert.deepEqual(p.answered, ["PF-6"], "ticked on the page while the queue row is still open");
});
test("every Running now item is listed for a helper check; a named session id is carried, none is flagged", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: DOC });
  assert.deepEqual(p.running, [
    { text: "D2 status out of the thread (session_019vvsKxkt4YUc2iRJhzm8jJ)", sessions: ["session_019vvsKxkt4YUc2iRJhzm8jJ"] },
    { text: "A lane with no helper named", sessions: [] },
  ]);
});
test("DISC-288 (operator s77: \"clear it at each sessions end\"): every Done this session item is listed so wrap can empty the section", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: DOC });
  assert.deepEqual(p.clearAtWrap, ["- [x] **PF-3** earlier"]);
});
test("CLI prints the plan as JSON and refuses an unknown project", () => {
  const v = vault(); const f = join(v, "doc.md"); writeFileSync(f, DOC);
  const ok = spawnSync("node", [script, "--vault", v, "--projects", "PF", "--doc", f], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(JSON.parse(ok.stdout).toTick, ["PF-4"]);
  assert.equal(spawnSync("node", [script, "--vault", v, "--projects", "ZZ"], { encoding: "utf8" }).status, 1);
});

test("DISC-290 (operator s78: \"can we clear done at the end of each session too\"): a ticked Waiting on you item whose row is closed is cleared at wrap; a ticked one still open is banked first", () => {
  const doc = DOC.replace("- [ ] **PF-4** old row, since answered", "- [x] **PF-4** old row, since answered");
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: doc });
  assert.deepEqual(p.clearAtWrap, ["- [x] **PF-4** old row, since answered", "- [x] **PF-3** earlier"]);
  assert.deepEqual(p.answered, ["PF-6"], "PF-6 is ticked but its row is open: bank it, never clear it unbanked");
  assert.ok(!p.clearAtWrap.some((l) => l.includes("PF-6")));
});
