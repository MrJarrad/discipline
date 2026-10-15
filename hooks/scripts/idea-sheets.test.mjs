// Ideas live in the backlog (DISC-168, operator 2026-10-15: "ideas are part of the
// backlog / queue list like everything else, so they don't get lost, probably as
// items that are needed from me"). An idea sheet in evidence must cite one backlog
// row per idea; list-drift-check reports `idea-unrowed` otherwise.
// Run: node --test hooks/scripts/idea-sheets.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkIdeaSheets } from "./lib/idea-sheets.mjs";
import { checkVault, FAILING } from "./list-drift-check.mjs";

const script = fileURLToPath(new URL("./list-drift-check.mjs", import.meta.url));
const FM = (p) => `---\nprefix: ${p}\n---\n`;
const TABLE = (rows) => `| # | Item | Raised | Status |\n| - | --- | --- | --- |\n${rows}\n`;

function vault({ sheet, sheetName = "ideas.md", backlogRows, fm = "" }) {
  const v = mkdtempSync(join(tmpdir(), "idea-vault-"));
  const p = join(v, "projects", "hb");
  mkdirSync(join(p, "evidence", "2026-10-02-x"), { recursive: true });
  writeFileSync(join(p, "hb-backlog.md"), `${FM("HB")}# Backlog\n\n## Open\n\n${TABLE(backlogRows)}\n## Done\n\n${TABLE("")}`);
  writeFileSync(join(p, "hb-queue.md"), `${FM("HB")}# Queue\n\n${TABLE("")}`);
  writeFileSync(join(p, "evidence", "2026-10-02-x", sheetName), `---\nname: x\ndescription: "Idea sheet (rung 2): two ideas"\n${fm}---\n\n${sheet}`);
  return v;
}
const ROWS = "| HB-1 | idea one | 2026-10-15 | waiting on operator |\n| HB-2 | idea two | 2026-10-15 | waiting on operator |";
const IDEAS = "## 1. First\n\ntext\n\n## 2. Second\n\ntext\n\n";

test("a sheet with no Idea rows section is idea-unrowed", () => {
  const f = checkIdeaSheets(vault({ sheet: IDEAS, backlogRows: ROWS }));
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, "idea-unrowed");
  assert.match(f[0].file, /evidence\/2026-10-02-x\/ideas\.md$/);
});

test("a sheet citing one real row per idea passes", () => {
  const f = checkIdeaSheets(vault({ sheet: `${IDEAS}## Idea rows\n\n- HB-1 First\n- HB-2 Second\n`, backlogRows: ROWS }));
  assert.deepEqual(f, []);
});

test("a cited ID that is in no backlog or queue is flagged", () => {
  const f = checkIdeaSheets(vault({ sheet: `${IDEAS}## Idea rows\n\n- HB-1\n- HB-9\n`, backlogRows: ROWS }));
  assert.equal(f.length, 1);
  assert.match(f[0].msg, /HB-9/);
});

test("fewer cited rows than ideas is flagged", () => {
  const f = checkIdeaSheets(vault({ sheet: `${IDEAS}## Idea rows\n\n- HB-1\n`, backlogRows: ROWS }));
  assert.equal(f.length, 1);
  assert.match(f[0].msg, /2 ideas.*1 row/);
});

test("numbered bold-list ideas are counted too", () => {
  const f = checkIdeaSheets(vault({ sheet: "1. **A.** x\n\n2. **B.** y\n\n3. **C.** z\n\nIdea rows:\n- HB-1\n- HB-2\n", backlogRows: ROWS }));
  assert.equal(f.length, 1);
  assert.match(f[0].msg, /3 ideas/);
});

test("an archived or moot sheet is skipped", () => {
  assert.deepEqual(checkIdeaSheets(vault({ sheet: IDEAS, backlogRows: ROWS, fm: "status: archived\n" })), []);
});

test("a sheet is found by its 'Idea sheet' description, whatever the file name", () => {
  assert.equal(checkIdeaSheets(vault({ sheet: IDEAS, backlogRows: ROWS, sheetName: "notes.md" })).length, 1);
});

test("idea-unrowed fails list-drift-check (exit 1) and is in FAILING", () => {
  assert.ok(FAILING.has("idea-unrowed"));
  const v = vault({ sheet: IDEAS, backlogRows: ROWS });
  assert.ok(checkVault(v, []).some((f) => f.kind === "idea-unrowed"));
  const r = spawnSync("node", [script, "--vault", v], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /idea-unrowed/);
});

test("a sheet with no frontmatter keeps its first lines; an unreadable path does not throw", () => {
  const v = vault({ sheet: IDEAS, backlogRows: ROWS });
  const d = join(v, "projects", "hb", "evidence", "y");
  mkdirSync(d);
  writeFileSync(join(d, "ideas.md"), "Idea rows:\n- HB-1\n\n---\n\n## 1. A\n");
  mkdirSync(join(d, "ideas-dir.md"));
  const f = checkIdeaSheets(v);
  assert.equal(f.filter((x) => /evidence\/y\//.test(x.file)).length, 0);
});
