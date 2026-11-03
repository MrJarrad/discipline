// 1.164.0: DISC-235 (copy-writing fix, operator s48 "yes", with his research-step addition)
// and the s45, s46, s47 parent lessons. Each rule's text is asserted verbatim at its one home.
// Run: node --test hooks/scripts/session52-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const flat = (p) => read(p).replace(/\s+/g, " ");
const BV = "skills/brand-voice/SKILL.md";

test("DISC-235 A1: brand-voice drafting method, in order, each step with its criterion", () => {
  const s = flat(BV);
  const steps = [
    "0. **Know the client.**",
    "1. **State the page's job and its reader**, one line each.",
    "2. **Write three distinct directions**: different openings and structures, never one sentence with words swapped.",
    "3. **Compare against the exemplar bank** (`projects/<p>/copy/<p>-exemplar-bank.md`)",
    "4. **Polish and read aloud** (§ Verify before done).",
    "5. **Fact pass, separate from the writing**: check every claim against the spec and change the fewest words that make it true.",
  ];
  let at = s.indexOf("## Drafting method — research, three directions, the bank, a fact pass");
  assert.ok(at > 0, "the section exists");
  for (const step of steps) {
    const i = s.indexOf(step, at);
    assert.ok(i > at, step);
    at = i;
  }
  assert.ok(s.indexOf("## Drafting method") < s.indexOf("## Verify before done"), "the method sits before the read-aloud test it points at");
  assert.equal((s.match(/\*Done when /g) || []).length, 6, "every step ends on a criterion");
});

test("DISC-235 A2: research step reads the client first; the brief and bank shapes live once in a reference", () => {
  const s = flat(BV);
  assert.ok(s.includes("None yet: read the client's own site and about page and how others describe them (`capture-website`, copy angle: their words, product names, what they are known for)"));
  assert.ok(s.includes("Their words make the copy specific; facts about the work come from the spec; a fact from the web is checked before use."));
  const r = flat("skills/brand-voice/references/COPY-BRIEF-AND-BANK.md");
  assert.ok(r.includes("## Copy brief — `projects/<p>/copy/<p>-copy-brief.md`"));
  assert.ok(r.includes("## Exemplar bank — `projects/<p>/copy/<p>-exemplar-bank.md`"));
  assert.ok(r.includes("Facts about the work (what was made, for whom, the scope) come from the project spec, never from this brief."));
  assert.ok(flat("skills/capture-website/SKILL.md").includes("For a copy job (`brand-voice` § Drafting method step 0) this layer, read on the client's own site and about page, feeds the project's copy brief."));
});

test("DISC-235 A3: an approved line enters the project's exemplar bank the same turn", () => {
  assert.ok(flat(BV).includes("**An approved line** goes into the exemplar bank with his words, the same turn."));
  assert.ok(flat("skills/brand-voice/references/COPY-BRIEF-AND-BANK.md").includes("A line enters the bank the turn he approves it."));
});

test("DISC-235 A4: metadata has an owner, grounded in Google Search Central; no route to an uninstalled seo-* skill", () => {
  const s = flat(BV);
  assert.ok(!s.includes("`seo-*`"), "brand-voice no longer routes to seo-* skills, which are not installed");
  assert.ok(s.includes("Page titles and meta descriptions are copy and are owned here ([references/METADATA.md](references/METADATA.md))"));
  assert.ok(read(BV).split("\n").find((l) => l.startsWith("description:")).includes("page titles and meta descriptions"), "the description triggers on metadata");
  const m = flat("skills/brand-voice/references/METADATA.md");
  for (const url of [
    "https://developers.google.com/search/docs/appearance/snippet",
    "https://developers.google.com/search/blog/2009/09/google-does-not-use-keywords-meta-tag",
    "https://developers.google.com/search/docs/appearance/ai-features",
  ]) assert.ok(m.includes(url), url);
  assert.ok(m.includes("\"we still don't use the description meta tag in our ranking\""));
  assert.ok(m.includes("**Length is a working target, never a rule.**"));
  assert.ok(flat("skills/markup-standard/SKILL.md").includes("Wording is `brand-voice`'s (`references/METADATA.md`)"));
});

test("DISC-235 A5: a copy brief gives job, reader and exemplars, never a sentence formula — prompt-craft", () => {
  const p = flat("skills/prompt-craft/SKILL.md");
  assert.ok(p.includes("It gives the page's job, its reader, and the project's copy brief and exemplar bank (`brand-voice` § Drafting method); it never gives a sentence formula, a fixed order of parts or a mandatory phrase: formula in, formula out (DISC-235)."));
});

test("DISC-235 A6: copy lanes run on the strongest tier — model-routing", () => {
  assert.ok(flat("skills/model-routing/SKILL.md").includes("| Published copy (drafting or fact-checking words a user reads) | the strongest tier (`fable`, else `opus`); `## Interrogated`: \"copy lane\" (DISC-235) |"));
});

test("s45.1, s46.3, s46.4, s47.2, s47.3: the five link checks live once in PREVIEW-PROBE; the skill and helpers point", () => {
  const r = flat("skills/present-for-review/references/PREVIEW-PROBE.md");
  assert.ok(r.includes("- **The `preview/*` build, not a `claude/*` badge.** A green build on a `claude/*` branch is not the preview: its log says it skips the upload"));
  assert.ok(r.includes("- **The link opens in the state to review.** Open it cold, as the operator will, before sending."));
  assert.ok(r.includes("gets a preview-only URL flag that opens it (`?time-circuits=on`, `?mode=holding`) and the link carries the flag"));
  assert.ok(r.includes("- **The preview carries current main.** Before a look link, the lane merges current main into its branch, or the message names which approved fixes the preview lacks"));
  assert.ok(r.includes("- **An SSR or hydration fix is proven by two cold runs on the deployed preview** before the link"));
  assert.ok(flat("skills/present-for-review/SKILL.md").includes("- **Before any look link, run the five link checks**: [PREVIEW-PROBE.md](references/PREVIEW-PROBE.md) § Link checks (s45–s47)."));
  assert.ok(flat("skills/cloud-dispatch/references/HELPER-SESSIONS.md").includes("A review link it sends meets `present-for-review` § Before the link goes out: opened cold first, in the state to review."));
  assert.ok(flat("doer-rules.md").includes("**A deploy is read from the build log, never the badge**: a `claude/*` build shows \"Deployment successful\" while its log says it skips the upload; only `preview/*` publishes (s47)."));
});

test("s45.2 and s46.5 and s47.1: supplied copy is fact-checked only; stop after a second miss; versions of copy are kept", () => {
  const s = flat(BV);
  assert.ok(s.includes("**Copy the operator supplied** (ChatGPT or anywhere else): the default is his copy with facts checked, step 5 only, never a merge back toward an older draft or spec (s45)."));
  assert.ok(s.includes("**Second miss**: after a second \"not quite\" on the same set, offer to park it, or ask him for two or three lines of his own, instead of another set (s46)."));
  assert.ok(s.includes("**A clean-up pass** removes only working material he named (drafts, questions, history); a field that holds a version of copy is kept and labelled, never dropped on an older ruling (s47)."));
  assert.ok(flat("skills/prompt-craft/SKILL.md").includes("Copy the operator supplied is briefed as fact-check only."));
  const d = flat("skills/brand-voice/references/DOS-AND-DONTS.md");
  assert.ok(d.includes("| Take the operator's supplied copy as the base and only fact-check it |"));
  assert.ok(d.includes("| Draft from the spec alone, or follow a sentence formula a brief gave |"));
});

test("s45.3: every reviewer brief copies the verdict shape from its one home", () => {
  assert.ok(flat("skills/dispatch-brief/SKILL.md").includes("Verdict shape: `agents/reviewer.md` § Verdict, verbatim."));
  assert.ok(flat("agents/reviewer.md").includes("**Verdict shape — the one definition the merge gates parse**"), "the shape still has its home");
});

test("s45.4 and s46.2: Mac jobs — review-first folder, throwaway clone, remote head, FETCH_HEAD, macOS lsof", () => {
  const m = flat("skills/cloud-dispatch/references/MAC-JOBS.md");
  assert.ok(m.includes("**A job that needs review first is filed in `queue/mac/review/`**: the runner reads `review/` on origin/main only, so it runs once its PR merges, never before"));
  assert.ok(m.includes("clones it fresh into a temp tree (never the operator's checkout"));
  assert.ok(m.includes("checks the remote head carries it before queueing (`git ls-remote`)"));
  assert.ok(m.includes("`git worktree add <dir> FETCH_HEAD`"));
  assert.ok(m.includes("`lsof -ti tcp:A -ti tcp:B`"));
  assert.ok(flat("skills/cloud-dispatch/SKILL.md").includes("**Review-first jobs and repo checkouts** follow [MAC-JOBS.md](references/MAC-JOBS.md) (s45, s46)."));
});

test("s45.5: the next \"build now\" waits for the previous PR's Workers comment — release-deploy", () => {
  assert.ok(flat("skills/release-deploy/SKILL.md").includes("the next waits until the previous PR's Workers comment reports, never on the helper's \"pushed\" (s45: two overlapping builds)"));
});

test("s46.1: a read-only task goes to cloud too — HARD-RULES 9", () => {
  assert.ok(flat("skills/routing/references/HARD-RULES.md").includes("A read-only task (research, reading files, a search) needs none of the three, so it goes to cloud too: an `Agent` call from the parent runs local (s46, DISC-232"));
});

test("s46.6: WebKit does not kern across inline element edges — motion BUILD", () => {
  assert.ok(flat("skills/motion/references/BUILD.md").includes("**Text morph: WebKit does not kern across inline element edges.**"));
});

test("s46.7: a system value raised on one screen is offered as the global fix first — design-system", () => {
  assert.ok(flat("skills/design-system/SKILL.md").includes("A question about a system value raised on one screen (a dim colour, an icon stroke weight) is offered as the global fix first"));
});

test("s47.4: a waiting helper sends one message when the event lands — doer-rules", () => {
  assert.ok(flat("doer-rules.md").includes("**A helper waiting on an event sends one message, when the event lands** (a build, a review, a merge), never an interim \"still waiting\" message (s47)."));
});

test("release: 1.164.0 in both manifests and CHANGED.txt, with the encoded line", () => {
  for (const p of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) assert.ok(read(p).includes('"version": "1.164.0"'), p);
  const top = read("CHANGED.txt");
  assert.ok(top.startsWith("1.164.0 — "));
  assert.ok(top.split("\n\n")[0].includes("encoded: 1.164.0 — DISC-235; s45 lessons 1–6, s46 lessons 1–7, s47 lessons 1–4."));
  assert.ok(existsSync(join(root, "skills/brand-voice/references/METADATA.md")));
});

test("DISC-229: every network git call in jhd-container-clone.sh runs with GIT_HARDEN", () => {
  const calls = read("hooks/scripts/jhd-container-clone.sh").split("\n")
    .filter((l) => !l.trim().startsWith("#") && !/\bconfig\b/.test(l) && /^\s*git\b.*\b(clone|fetch|pull)\b/.test(l));
  assert.ok(calls.length >= 5, "clone, fetch and pull calls found");
  for (const l of calls) assert.ok(l.includes('"${GIT_HARDEN[@]}"'), l.trim());
});

test("DISC-232: the cloud default bites — HARD-RULES 9 names the line, model-routing points, the gate refuses", () => {
  assert.ok(flat("skills/routing/references/HARD-RULES.md").includes("A `local —` brief says which, on one line: `Local because: (a) …`, `(b) …` or `(c) …`; `agent-dispatch-gate` refuses a local dispatch without it."));
  assert.ok(flat("skills/model-routing/SKILL.md").includes("| Surface (before the model) | cloud; local only with a `Local because: (a\\|b\\|c)` line"));
  assert.ok(flat("hooks/bin/agent-dispatch-gate.mjs").includes("9. LOCAL NAMES ITS NEED"));
});
