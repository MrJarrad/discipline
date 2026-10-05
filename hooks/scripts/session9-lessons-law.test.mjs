// The 1.107.0 lessons (session 9, 2026-10-03..05): one verbatim assertion per rule,
// each at the file that owns the behaviour.
// Run: node --test hooks/scripts/session9-lessons-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

test("visual bug on any device or browser: picture first, cheap causes, re-derive from the picture", () => {
  const d = read("skills/diagnosing-bugs/SKILL.md");
  assert.match(d, /## Visual bugs: the picture first/);
  assert.match(d, /on any device or browser/);
  assert.match(d, /what is painted on top, in order, before any theory/);
  assert.match(d, /stacking\/z-index, clipping, an ancestor's opacity/);
  assert.match(d, /re-derive from the picture, not from the last theory/);
  assert.match(d.split("---")[1], /any visual bug/, "the description fires on visual bugs");
});

test("pixels, never DOM state; headless is not the device; device-tests named", () => {
  const w = read("skills/webapp-testing/SKILL.md");
  assert.match(w, /never from DOM state alone/);
  assert.match(w, /DOM probes explain a pixel failure, they never pass one/);
  assert.match(w, /A third headless-only round is a routing failure/);
  assert.match(w, /MrJarrad\/jhd-device-tests/);
});

test("motion: name the model before tuning; signs verified on the render", () => {
  const b = read("skills/motion/references/BUILD.md");
  assert.match(b, /## Name the model before tuning/);
  assert.match(b, /Two "not right" rounds on one model: question the model, not the knobs/);
  assert.match(b, /verified on the rendered output/);
});

test("release: look at the page visitors will see before asking for the go-live yes", () => {
  assert.match(read("skills/release-deploy/SKILL.md"), /Pre-promote: look at what visitors will see/);
  assert.match(read("skills/release-deploy/references/DEPLOY-CHECKLIST.md"), /Pre-promote look/);
});

test("routing: question shape goes to the Researcher; session start greps next-session backlog rows", () => {
  const h = read("skills/routing/references/HARD-RULES.md");
  assert.match(h, /"is X good for Y", "compare", "should we use" goes to\s+the Researcher/);
  assert.match(h, /grep the project backlog for rows marked "next session"/);
  assert.match(h, /setup defect to close/);
});

test("cloud install is frozen-lockfile; a lane never commits the lockfile", () => {
  const r = read("doer-rules.md");
  assert.match(r, /pnpm install --frozen-lockfile/);
  assert.match(r, /never\s+commits the lockfile unless the task changes dependencies/);
});

test("output style: numbered chat rows and a Build in Progress heading", () => {
  const s = read("output-styles/discipline.md");
  assert.match(s, /each open row prints as a numbered item/);
  assert.match(s, /## Build in Progress/);
});
