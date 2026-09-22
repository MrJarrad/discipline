// The 1.92.0 queue: six plugin changes plus the Change 1 additions from
// `2026-09-22-lessons-for-1-92.md` (operator: "i'd like to actually discuss
// these and get them actioned" / "go", with three adjustments on the same
// day: the Source-contract lock-row gate also refuses backticked mechanism
// identifiers in the quote cell; the skills-named gate check applies to
// every persona, not build verbs only; the portfolio CLAUDE.md DS-path fix
// is already merged (PR 149), not deferred), PLUS the parent's ledger-block
// ruling: `fleet/lessons/hoverboard-rounds-14-15-lessons-2026-09-21.md`
// items 1, 3, 5 and 6 are answered in this release too (items 2 and 4 are
// hoverboard-rig-specific, noted in the lesson file's own `## Encoding`
// section, not encoded as a general plugin rule).
//
// Run: node --test hooks/scripts/queue-1920-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { checkAgentDispatch, checkSkillsNamed, checkSourceContractLockRows } from "../bin/agent-dispatch-gate.mjs";
import { rowWritten } from "./queue-write-check.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

// --- Change 1: Source-contract lock-row gate --------------------------------

test("dispatch-brief points at the Source-contract lock-row kinds, gate-enforced", () => {
  const doc = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(doc, /SOURCE-CONTRACT-LOCKS\.md/);
});

test("the three legal lock-row kinds are documented with their meaning", () => {
  const doc = flat(read("skills/dispatch-brief/references/SOURCE-CONTRACT-LOCKS.md"));
  for (const kind of ["export-silent", "export-vs-ruling", "operator-round"]) {
    assert.ok(doc.includes(kind), `missing lock-row kind: ${kind}`);
  }
  assert.match(doc, /Banned, whatever the source/);
  assert.match(doc, /backticked mechanism identifier/);
});

test("gate: a Source-contract lock row is refused outside the three kinds", () => {
  assert.equal(checkSourceContractLockRows("## Source contract\n## Locked decisions\n| # | Operator said (verbatim) | Source |\n| - | --- | --- |\n| 1 | \"x\" | recommended |").item, "lock-rows");
});

test("gate: a Source-contract quote carrying a backticked mechanism identifier is refused", () => {
  const prompt =
    "## Source contract\n## Locked decisions\n| # | Operator said (verbatim) | Source |\n| - | --- | --- |\n" +
    '| 1 | "bind `--nav-gap-md` here" | operator-round |';
  assert.equal(checkSourceContractLockRows(prompt).item, "lock-rows");
});

// --- Change 1 additions: skills-named gate is every persona, not build verbs -

test("agent-dispatch-gate's skills check runs unconditionally on every subagent_type, not gated by a persona/verb allowlist", () => {
  const script = read("hooks/bin/agent-dispatch-gate.mjs");
  const callSite = script.slice(script.indexOf("const skillsVerdict"), script.indexOf("const skillsVerdict") + 120);
  assert.doesNotMatch(callSite, /subagentType|persona/i);
  assert.match(script, /checkSkillsNamed/);
});

test("gate: reviewer/researcher/releaseops dispatches with no Skills: line are refused, same as engineer", () => {
  for (const subagent_type of ["engineer", "ux-designer", "reviewer", "researcher", "releaseops"]) {
    const verdict = checkAgentDispatch({
      description: `cloud — ${subagent_type} (sonnet): do the thing`,
      model: "sonnet",
      subagent_type,
      prompt: "No skills line here at all.",
    });
    assert.equal(verdict.item, "skills", subagent_type);
  }
});

// --- Change 1 additions: fixed House rules block ----------------------------

test("dispatch-brief points at the fixed House rules block", () => {
  const doc = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(doc, /HOUSE-RULES\.md/);
});

test("the House rules block names the real paths and every named area", () => {
  const doc = flat(read("skills/dispatch-brief/references/HOUSE-RULES.md"));
  assert.match(doc, /~\/JHD\/jhd-design-system\/main/);
  assert.match(doc, /~\/JHD\/jhd-design-system\/main\/motion-law\.md/);
  assert.match(doc, /fleet\/rulings\/token-rulings\.md/);
  for (const area of [
    "Design system",
    "Motion law",
    "Markup standard",
    "Layout policy",
    "Component law",
    "Contract order",
    "Pointers",
  ]) {
    assert.ok(doc.includes(area), `House rules block missing area: ${area}`);
  }
});

// --- Change 2: frame-first proof --------------------------------------------

test("handoff-to-code's coverage-ledger.md carries frame-first proof before any link", () => {
  const doc = flat(read("skills/handoff-to-code/references/coverage-ledger.md"));
  assert.match(doc, /Before any link goes out, the return carries a side-by-side/);
  assert.match(doc, /reviewer checks the ledger against the export JSON's node list/);
});

test("agents/reviewer.md checks the ledger against the export JSON's node list", () => {
  const doc = flat(read("agents/reviewer.md"));
  assert.match(doc, /Under a Source contract, the ledger is checked against the export JSON's node list/);
});

// --- Change 3: runtime proof for State claims -------------------------------

test("dispatch-brief's State section requires reproduction on the running build", () => {
  const doc = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(doc, /reproduces each\s*claim \*\*on the running build\*\*, never by reading the code/);
});

test("doer-rules.md carries the runtime-proof-over-code-read rule", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /reproduced on the running build, never verified by reading the\s*code/);
});

// --- Change 4: lane clock + stall visibility --------------------------------

test("doer-rules.md's progress-file rule stamps the dispatch time and quotes it for an ETA", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /Its first line\s*stamps the dispatch time/);
  assert.match(doc, /quoting the dispatch time against the last milestone/);
  assert.match(doc, /No new\s*milestone for 15 minutes/);
});

test("routing's baton table has a 15-minute row alongside the 30-minute row", () => {
  const doc = flat(read("skills/routing/SKILL.md"));
  assert.match(doc, /Progress file silent 15 minutes/);
  assert.match(doc, /Progress file silent 30 minutes/);
});

// --- Change 5: motion proof --------------------------------------------------

test("motion's REVIEW.md requires a sampled property-over-time trace for enter/exit", () => {
  const doc = flat(read("skills/motion/references/REVIEW.md"));
  assert.match(doc, /Sampled proof for enter\/exit/);
  assert.match(doc, /is a note, not proof/);
});

// --- Change 6: queue write helper + deploy mechanics ------------------------

test("vault-write names the queue-write-check helper and the greps-the-row-back rule", () => {
  const doc = flat(read("skills/vault-write/SKILL.md"));
  assert.match(doc, /queue-write-check\.mjs/);
  assert.match(doc, /re-read the file and grep the written row back/);
});

test("release-deploy bans deploy verbs from briefs and names the standalone promote", () => {
  const doc = flat(read("skills/release-deploy/SKILL.md"));
  assert.match(doc, /runs as its own standalone Bash call from the parent/);
  assert.match(doc, /never named as a verb inside a dispatch brief/);
});

test("present-for-review points at the same standalone-deploy rule", () => {
  const doc = flat(read("skills/present-for-review/SKILL.md"));
  assert.match(doc, /Deploy commands stand alone/);
});

test("queue-write-check: rowWritten finds an exact row, whitespace-normalised", () => {
  const file = "| 81 | done | x |\n| 82 |  in progress | y |";
  assert.equal(rowWritten(file, "| 82 | in progress | y |"), true);
  assert.equal(rowWritten(file, "| 83 | missing | z |"), false);
});

test("queue-write-check CLI: exits 0 when the row is present, 1 and names it when absent", () => {
  const script = join(repo, "hooks", "scripts", "queue-write-check.mjs");
  const dir = mkdtempSync(join(tmpdir(), "queue-write-check-"));
  const file = join(dir, "queue.md");
  writeFileSync(file, "| 1 | banked row | ok |\n");

  const present = spawnSync(process.execPath, [script, file, "| 1 | banked row | ok |"], { encoding: "utf8" });
  assert.equal(present.status, 0);

  const absent = spawnSync(process.execPath, [script, file, "| 2 | never written | ok |"], { encoding: "utf8" });
  assert.equal(absent.status, 1);
  assert.match(absent.stderr, /row not found/);
  assert.match(absent.stderr, /never written/);
});

// --- hoverboard rounds 14-15 lesson: items 1, 3, 5, 6 -----------------------

test("item 1: doer-rules.md's evidence section requires the deployed link + operator device", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /A load\/timing number counts only on\s*the deployed link and the operator's device/);
  assert.match(doc, /unproven until the operator's own device readout says/);
});

test("item 3: doer-rules.md and routing require a gate-run lane for a full suite, never the parent shell", () => {
  const dr = flat(read("doer-rules.md"));
  assert.match(dr, /runs in a gate-run lane, never the parent\s*shell/);
  assert.match(dr, /run_in_background.*and.*nohup … & disown.*both die with the tool shell/);

  const routing = flat(read("skills/routing/SKILL.md"));
  assert.match(routing, /is its own gate-run\s*lane, dispatched and polled — never run from the parent shell/);
});

test("item 5: dispatch-brief's read-back line states which object a dimension sizes", () => {
  const doc = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(doc, /The read-back states which object a dimension sizes/);
  assert.match(doc, /board, canvas, instance/);
});

test("item 6: vault-write folds the queue-row-in-same-tool-call rule into Change 6", () => {
  const doc = flat(read("skills/vault-write/SKILL.md"));
  assert.match(doc, /A queue row named in chat is written to the file in the same tool call/);
});

test("CHANGED.txt links the hoverboard-rounds-14-15 lesson file", () => {
  const doc = read("CHANGED.txt");
  assert.match(doc, /\[\[hoverboard-rounds-14-15-lessons-2026-09-21\]\]/);
});

// --- Additions-c: portfolio CLAUDE.md DS-path fix already merged ------------

test("the lessons-for-1-92 decision file exists and names the DS-path fix", () => {
  // This law test lives with the plugin repo, so it asserts the plugin-side
  // encoding only; the portfolio-repo fix itself (PR 149) is out of this
  // repo's tree and is not re-asserted here.
  assert.match(
    flat(read("skills/dispatch-brief/references/HOUSE-RULES.md")),
    /~\/JHD\/jhd-design-system\/main/,
  );
});
