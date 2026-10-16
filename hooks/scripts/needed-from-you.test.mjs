// needed-from-you — backlog 166 (operator 2026-10-12): a session's "Needed from you"
// shows only its own projects' rows, never an answered one, never another project's.
// Run: node --test hooks/scripts/needed-from-you.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { neededFromYou, render } from "./needed-from-you.mjs";

const script = fileURLToPath(new URL("./needed-from-you.mjs", import.meta.url));
const FM = (px, kind) => `---\nname: x\nkind: ${kind}\nprefix: ${px}\n---\n`;
const QUEUE = (px, rows) => FM(px, "queue") + `| # | Needed | Where | Why | Recommended |\n| - | - | - | - | - |\n${rows}\n`;
const BACKLOG = (px, open, done = "") => FM(px, "backlog") + `## Open\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n${open}\n\n## Done\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n${done}\n`;

function vault() {
  const v = mkdtempSync(join(tmpdir(), "nfy-"));
  const put = (p, t) => { mkdirSync(join(v, p, ".."), { recursive: true }); writeFileSync(join(v, p), t); };
  // the SAME number 5 in all three projects: the collision the operator saw
  put("projects/portfolio/portfolio-queue.md", QUEUE("PF", "| PF-5 | pf look at the footer | | | |\n| PF-6 | ~~pf answered~~ Operator: yes | | | |\n| ~~PF-7~~ | pf struck id | | | |"));
  put("projects/portfolio/portfolio-backlog.md", BACKLOG("PF", "| PF-5 | pf waiting item | d | waiting on operator |\n| PF-8 | pf plain open | d | open |\n| ~~PF-9~~ | pf struck waiting | d | waiting on operator |", "| PF-3 | pf done | d | moot (gone) |"));
  put("projects/hoverboard/hoverboard-queue.md", QUEUE("HB", "| HB-5 | hb secret row | | | |"));
  put("projects/hoverboard/hoverboard-backlog.md", BACKLOG("HB", "| HB-5 | hb waiting | d | waiting on operator |"));
  put("projects/jhd-design-system/jhd-design-system-queue.md", QUEUE("DS", "| DS-5 | ds secret row | | | |"));
  put("projects/jhd-design-system/jhd-design-system-backlog.md", BACKLOG("DS", ""));
  return v;
}

test("outcome 1: only the session's projects' rows appear, even when every project has a row 5", () => {
  const r = neededFromYou(vault(), ["PF", "HB"]);
  assert.equal(r.ok, true, r.reason);
  const out = render(r);
  assert.match(out, /PF-5 \| pf look at the footer/);
  assert.match(out, /HB-5 \| hb secret row/);
  assert.doesNotMatch(out, /ds secret row|DS-5/, "a project not in the session is never printed");
  assert.deepEqual(r.projects.map((p) => p.prefix), ["PF", "HB"]);
});

test("outcome 1: a single-project session prints that project alone", () => {
  const out = render(neededFromYou(vault(), ["DS"]));
  assert.match(out, /ds secret row/);
  assert.doesNotMatch(out, /PF-|HB-|footer|hb /);
});

test("outcome 3: struck and answered rows are never reprinted (queue struck cell, struck ID, struck/done backlog rows)", () => {
  const out = render(neededFromYou(vault(), ["PF"]));
  assert.doesNotMatch(out, /pf answered|pf struck id|pf struck waiting|pf done/);
  assert.match(out, /PF-5 \| pf waiting item \| d \| waiting on operator/, "backlog rows waiting on the operator are printed");
  assert.doesNotMatch(out, /pf plain open/, "an open backlog row is not the operator's");
});

test("a project with nothing needed says so; the list is empty rather than borrowed from elsewhere", () => {
  const v = mkdtempSync(join(tmpdir(), "nfy-"));
  mkdirSync(join(v, "projects", "x"), { recursive: true });
  writeFileSync(join(v, "projects", "x", "x-queue.md"), QUEUE("XX", "| ~~XX-1~~ | ~~done~~ | | | |"));
  assert.match(render(neededFromYou(v, ["XX"])), /Nothing needed from you\./);
});

test("refusals: no project, an unknown prefix, and a foreign row inside a file", () => {
  const v = vault();
  assert.equal(neededFromYou(v, []).ok, false);
  assert.equal(neededFromYou(v, [""]).ok, false);
  assert.match(neededFromYou(v, ["ZZ"]).reason, /unknown project prefix: ZZ/);
  writeFileSync(join(v, "projects", "hoverboard", "hoverboard-queue.md"), QUEUE("HB", "| PF-5 | pf row filed in hb |"));
  assert.match(neededFromYou(v, ["HB"]).reason, /not a HB row/);
});

test("CLI prints the block for the named projects and exits 1 on a refusal", () => {
  const v = vault();
  const ok = spawnSync("node", [script, "--vault", v, "--projects", "HB"], { encoding: "utf8" });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /^## Needed from you/);
  assert.doesNotMatch(ok.stdout, /PF-|DS-/);
  const bad = spawnSync("node", [script, "--vault", v], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /name at least one project prefix/);
});

test("DISC-178: a hand-typed release-only row is not printed; a release row with an operator-owned call is", () => {
  const v = mkdtempSync(join(tmpdir(), "nfy-rel-"));
  const put = (p, t) => { mkdirSync(join(v, p, ".."), { recursive: true }); writeFileSync(join(v, p), t); };
  put("projects/portfolio/portfolio-queue.md", QUEUE("PF", "| PF-5 | Release again for the underline? | | | |\n| PF-6 | Release with SITE_MODE holding -> live? | | | |\n| PF-7 | look at the footer | | | |"));
  put("projects/portfolio/portfolio-backlog.md", BACKLOG("PF", "| PF-8 | Release? | d | waiting on operator |"));
  const out = render(neededFromYou(v, ["PF"]));
  assert.doesNotMatch(out, /PF-5|PF-8/);
  assert.match(out, /PF-6/);
  assert.match(out, /PF-7/);
});
