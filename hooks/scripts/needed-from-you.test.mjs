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
import { neededFromYou, render, renderShort } from "./needed-from-you.mjs";

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
  assert.match(ok.stdout, /^## Upcoming\n[\s\S]*\n## Needed from you/);
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

// DISC-230: on the Mac the vault is a container (~/JHD/vault/.bare + ~/JHD/vault/main), and Mac jobs
// passed `--vault ~/JHD/vault`, so every prefix was "unknown". The container root resolves to main/.
test("DISC-230: a vault container root resolves to its main/ checkout", () => {
  const v = vault();
  const box = mkdtempSync(join(tmpdir(), "nfy-box-"));
  mkdirSync(join(box, ".bare"));
  spawnSync("mv", [v, join(box, "main")]);
  const r = spawnSync("node", [script, "--vault", box, "--projects", "HB"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /HB-5/);
});

// DISC-273 (operator 2026-11-08 s67): "always a sentence a bullets with a status".
const MULTI = "| PF-65 | Project media per case study. Per project:<br>- Yardsale — done (pf #551)<br>- Oliver Cabell — waiting on you<br>- Sakara — waiting on you<br><br>Earlier wording kept. | operator | waiting on operator | a note |";
function multiVault() {
  const v = mkdtempSync(join(tmpdir(), "nfy-multi-"));
  mkdirSync(join(v, "projects", "p"), { recursive: true });
  writeFileSync(join(v, "projects", "p", "p-queue.md"), QUEUE("PF", "| PF-5 | single ask | | | |"));
  writeFileSync(join(v, "projects", "p", "p-backlog.md"), BACKLOG("PF", MULTI));
  return v;
}

test("DISC-273: a row that tracks several items prints one sentence, then one bullet per item with its status", () => {
  const out = render(neededFromYou(multiVault(), ["PF"]));
  const block = out.split("\n").filter((l) => !/^\|/.test(l));
  const at = block.findIndex((l) => l.includes("PF-65"));
  assert.match(block[at], /^\*\*PF-65\*\* — Project media per case study\. Per project:$/);
  assert.deepEqual(block.slice(at + 1, at + 4), ["- Yardsale — done (pf #551)", "- Oliver Cabell — waiting on you", "- Sakara — waiting on you"]);
  assert.doesNotMatch(out, /<br>/, "no raw <br> reaches the operator");
  assert.match(out, /Earlier wording kept\./);
  assert.match(out, /\| PF-5 \| single ask/, "a single-item row keeps its table form");
});

// DISC-288: the short form — this turn's new asks plus one line linking the pinned checklist.
const LINK = "https://claude.ai/artifact/KjmpGR4zjVKB6WVfy8QsNa";
test("DISC-288: renderShort prints only the named new rows and the one link line, last", () => {
  const out = renderShort(neededFromYou(vault(), ["PF", "HB"]), ["PF-5"], LINK);
  assert.match(out, /^## Needed from you/);
  assert.match(out, /PF-5 \| pf look at the footer/);
  assert.doesNotMatch(out, /HB-5|hb secret row|PF-8/, "old open rows stay on the checklist");
  assert.match(out.trimEnd().split("\n").pop(), new RegExp(`^Full list: \\[Status\\]\\(${LINK}\\)$`));
});
test("DISC-288: no new asks prints just the link line; no link prints the full block", () => {
  const r = neededFromYou(vault(), ["PF"]);
  assert.equal(renderShort(r, [], LINK), `## Needed from you\n\nFull list: [Status](${LINK})`);
  assert.equal(renderShort(r, ["PF-5"], null), render(r));
});
test("DISC-288: CLI --short reads the link from the vault paragraph and --new from the flag", () => {
  const v = vault();
  mkdirSync(join(v, "orchestrator"), { recursive: true });
  writeFileSync(join(v, "orchestrator/operator-queue.md"), `**Pinned checklist (x):** Doc ${LINK} (doc id y).\n`);
  const ok = spawnSync("node", [script, "--vault", v, "--projects", "PF", "--short", "--new", "PF-5"], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /PF-5/);
  assert.match(ok.stdout, new RegExp(LINK));
  assert.doesNotMatch(ok.stdout, /PF-8/);
});
