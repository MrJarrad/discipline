// DISC-310 (parent s82: "tick go-live on merge"): a merged row that is a go-live line is ticked in the vault's go-live file; the Status doc follows through status-layout.
// Run: node --test hooks/scripts/go-live-tick.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tickGoLive } from "./go-live-tick.mjs";

const FILE = "projects/portfolio/portfolio-go-live.md";
const TEXT = "---\nname: portfolio-go-live\nkind: checklist\nprefix: PF\n---\n# Go-live\n\n## 1. Site bugs and polish\n\n- [x] PF-1507 · Glide fill\n- [ ] PF-1445 · Hyphenated words can break across lines\n- [ ] PF-1505 · Time Circuits still laggy\n\n## 4. Launch steps\n\n- [ ] PF-1412 · Switch to live\n\n## 5. After launch\n\n- [ ] PF-1396 · Raise HTTPS setting\n";
const BASE = "https://github.com/MrJarrad/jhd-vault/blob/main";

test("a merged go-live row is ticked: the new file text, the changed line, and the launch line the doc then shows", () => {
  const r = tickGoLive(TEXT, ["PF-1445"], { base: BASE, file: FILE });
  assert.equal(r.text, TEXT.replace("- [ ] PF-1445 ·", "- [x] PF-1445 ·"));
  assert.deepEqual(r.ticked, [{ id: "PF-1445", from: "- [ ] PF-1445 · Hyphenated words can break across lines", to: "- [x] PF-1445 · Hyphenated words can break across lines" }]);
  assert.equal(r.launch, `Launch: 2 of 4 done · [Full go-live list](${BASE}/${FILE})`, "groups 1-4: 4 lines, 2 ticked; group 5 is not counted");
});
test("an already-ticked row, a row not on the list, and a group-5 row are reported, not changed twice", () => {
  const r = tickGoLive(TEXT, ["PF-1507", "PF-9999", "PF-1396"], { base: BASE, file: FILE });
  assert.deepEqual([r.already, r.notFound, r.ticked.map((t) => t.id)], [["PF-1507"], ["PF-9999"], ["PF-1396"]]);
  assert.match(r.text, /- \[x\] PF-1396/);
  assert.equal(r.launch, `Launch: 1 of 4 done · [Full go-live list](${BASE}/${FILE})`, "ticking a group-5 line does not change the launch count");
});
test("CLI: prints the plan; --apply writes the file; a project with no go-live file is a clean no-op", () => {
  const v = mkdtempSync(join(tmpdir(), "glt-"));
  mkdirSync(join(v, "projects/portfolio"), { recursive: true });
  writeFileSync(join(v, FILE), TEXT);
  writeFileSync(join(v, "projects/portfolio/portfolio-backlog.md"), "---\nname: x\nkind: backlog\nprefix: PF\n---\n| # | Item | Raised | Status |\n| - | - | - | - |\n");
  writeFileSync(join(v, "projects/portfolio/portfolio-queue.md"), "---\nname: x\nkind: queue\nprefix: PF\n---\n| # | Needed |\n| - | - |\n");
  const script = fileURLToPath(new URL("./go-live-tick.mjs", import.meta.url));
  const run = (...a) => spawnSync("node", [script, "--vault", v, ...a], { encoding: "utf8" });
  const dry = run("--rows", "PF-1445");
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(JSON.parse(dry.stdout).ticked[0].id, "PF-1445");
  assert.equal(readFileSync(join(v, FILE), "utf8"), TEXT, "no --apply, no write");
  assert.equal(run("--rows", "PF-1445", "--apply").status, 0);
  assert.match(readFileSync(join(v, FILE), "utf8"), /- \[x\] PF-1445 ·/);
  const none = run("--rows", "HB-1");
  assert.equal(none.status, 0);
  assert.deepEqual(JSON.parse(none.stdout).noGoLive, ["HB"]);
});
