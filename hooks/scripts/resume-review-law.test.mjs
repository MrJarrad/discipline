// 1.127.0 — lesson resume-reads-vault-main-first-2026-10-10 (backlog 160) and
// ruling 2026-10-09-every-merge-reviewed. The law's words are its interface.
// Run: node --test hooks/scripts/resume-review-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const walk = (d) =>
  readdirSync(join(repo, d)).flatMap((f) => {
    const rel = `${d}/${f}`;
    return statSync(join(repo, rel)).isDirectory() ? walk(rel) : [rel];
  });

test("pause-resume: resume fetches origin/main and reads cockpit/handover from it before any dispatch", () => {
  const s = read("skills/pause-resume/SKILL.md");
  assert.match(s, /git fetch origin main/);
  assert.match(s, /origin\/main/);
  assert.match(s, /cockpit/i);
  assert.match(s, /re-check every .running. lane/i);
  assert.match(s, /live PR/i);
});

test("routing: resume reads origin/main and re-checks running lanes against live PR/branch state", () => {
  const r = read("skills/routing/SKILL.md");
  const sec = r.slice(r.indexOf("## Resume vs fresh"), r.indexOf("## Baton handoff table"));
  assert.match(sec, /git fetch origin main/);
  assert.match(sec, /live PR/i);
  assert.match(read("skills/routing/references/HARD-RULES.md"), /git fetch origin main/);
});

test("no small-fix no-reviewer exemption survives in any live doc", () => {
  const files = [...walk("skills"), ...walk("agents"), ...walk("output-styles"), "doer-rules.md", "operator-rules.md", "AGENTS.md", "README.md"]
    .filter((f) => f.endsWith(".md"));
  for (const f of files) {
    const t = read(f);
    assert.doesNotMatch(t, /small fix(es)? ships? with no reviewer/i, f);
    assert.doesNotMatch(t, /\*\*No reviewer\*\* — engineer \+ parent check/, f);
    assert.doesNotMatch(t, /small-fix path/i, f);
    assert.doesNotMatch(t, /small-fix no-reviewer/i, f);
    assert.doesNotMatch(t, /on the small-fix/i, f);
  }
});

test("every merge has a reviewer verdict first: reviewer, routing, releaseops, output style", () => {
  assert.match(read("agents/reviewer.md"), /no small-fix exemption/i);
  assert.match(read("skills/routing/SKILL.md"), /every merge has a reviewer verdict/i);
  assert.match(read("agents/releaseops.md"), /every merge has a reviewer verdict/i);
  assert.match(read("output-styles/discipline.md"), /every merge has a reviewer verdict/i);
  assert.match(read("skills/routing/references/HARD-RULES.md"), /every merge has a reviewer verdict/i);
});

test("diagnosing-bugs: read the operator's named reference first", () => {
  const s = read("skills/diagnosing-bugs/SKILL.md");
  assert.match(s, /named reference/i);
  assert.match(s, /root CSS/i);
  assert.match(read("skills/diagnosing-bugs/references/DOS-AND-DONTS.md"), /named reference/i);
});
