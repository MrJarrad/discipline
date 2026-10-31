// 1.162.0: DISC-223 (four skill updates, s43 operator answers) and DISC-224
// (lighter session start). Each rule's text is asserted verbatim at its one home;
// the scripts are tested beside themselves.
// Run: node --test hooks/scripts/session51-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const flat = (p) => read(p).replace(/\s+/g, " ");

test("DISC-223.1: equal items go in one list — HOUSE-VOICE rule 8, with its DO/DON'T", () => {
  const s = flat("skills/brand-voice/references/HOUSE-VOICE.md");
  assert.ok(s.includes("8. **Equal items go in one list.**"));
  assert.ok(s.includes("Things the copy means as equals sit side by side in one list, never one of them in a clause trailing after the rest."));
  const d = flat("skills/brand-voice/references/DOS-AND-DONTS.md");
  assert.ok(d.includes("| Hang one of a set of equals off the end in a trailing clause | Rule 8: it reads as an afterthought |"));
});

test("DISC-223.2: feel questions use the operator's own references — grilling § Feel questions", () => {
  const s = flat("skills/grilling/SKILL.md");
  assert.ok(s.includes("**The references are the operator's own**: a capture, site, Figma frame or recording he gave or named, never an analogy the parent invents"));
  assert.ok(s.includes("(*\"like the paper curve on Gil's profile page, or the React Bits Flying Posters?\"*)"));
  assert.ok(!s.includes("stone dropped in a pond"), "the invented-analogy example is gone");
  assert.ok(s.includes("HB-287 r1, 2026-10-31: \"a trampoline isn't the right reference for this\""));
});

test("DISC-223.3: Figma spec text goes through figma.spec only — one home in LANES-AND-TOOLS", () => {
  const l = flat("skills/capture-figma/references/LANES-AND-TOOLS.md");
  assert.ok(l.includes("| Spec text | `use_figma` with `figma.spec.getContent` to read, `figma.spec.editContent` to write (each call all-or-none; re-read after a write) | everything: REST and the other MCP reads do not return spec text |"));
  assert.ok(flat("skills/capture-figma/SKILL.md").includes("Mechanics: [LANES-AND-TOOLS.md](references/LANES-AND-TOOLS.md) § No-export lanes."), "SKILL points at the one home");
});

test("DISC-223.4: preview builds are spaced — release-deploy, beside Workers Builds", () => {
  const s = flat("skills/release-deploy/SKILL.md");
  assert.ok(s.includes("Previews build on Cloudflare Workers Builds. **Space preview builds**: three or more overlapping branch builds hit Cloudflare's R2 API rate limit (429) and fail with no code change."));
  assert.ok(s.includes("Start the next build once the one before it finishes, and re-run a red build once the others are done (`overload-and-untested-live-2026-10-15` item 3)."));
});

test("DISC-224 A: notes-only vault PRs are proven by vault-pr-files, names only — HARD-RULES 6", () => {
  const s = flat("skills/routing/references/HARD-RULES.md");
  assert.ok(s.includes("a MrJarrad/jhd-vault PR passes only when it is shown notes-only: by `node <plugin>/hooks/scripts/vault-pr-files.mjs --vault <vault> --pr <n>` (names only, bound to the head; use this) or by `get_files` reads"));
});

test("DISC-224 B: the start sweep reads only the helpers wrap named — HARD-RULES 19, wrap, vault-recall", () => {
  const s = flat("skills/routing/references/HARD-RULES.md");
  assert.ok(s.includes("**At wrap** save `list_sessions` (every page) to files and run"));
  assert.ok(s.includes("wrap writes the Keep and Surface ids, and its own id, on the cockpit wrap block's `Helpers:` line."));
  assert.ok(s.includes("**At session start** call `get_session` only on the ids in that `Helpers:` line, save each result, and run the same sweep with one `--sessions` per file; the start sweep never pages `list_sessions` (DISC-224, s44: 25.3k chars)."));
  assert.ok(flat("skills/wrap/references/SECTIONS.md").includes("`Helpers: <id>, …` — the wrap sweep's Keep and Surface ids plus this session's own id"));
  assert.ok(flat("skills/wrap/references/CLOSING-CHECKS.md").includes("at wrap it reads every `list_sessions` page."));
  const v = flat("skills/vault-recall/SKILL.md");
  assert.ok(v.includes("**Before resuming a project**, run the helper sweep (`routing` HARD-RULES 19) on the cockpit's `Helpers:` line"));
  assert.ok(v.includes("check for a parallel parent with one `list_sessions` page (`limit: 10`)"));
});

test("DISC-224 C: the cockpit keeps one wrap block and carries queue paths and counts, never rows", () => {
  assert.ok(flat("skills/wrap/SKILL.md").includes("**The open queue is written once, in the queue files:** the wrap reply prints the rows in full (`needed-from-you.mjs --projects <prefixes>`); the cockpit wrap block and a handover carry a link and count, never rows (`cockpit-check.mjs` passes)"));
  const s = flat("skills/wrap/references/SECTIONS.md");
  assert.ok(s.includes("the cockpit keeps the newest wrap block only (older ones move to the cockpit archive) and carries each project's queue path and open-row count, never rows (DISC-224); `node <plugin>/hooks/scripts/cockpit-check.mjs --vault <vault>` exits 0 before the wrap commit;"));
  assert.ok(!s.includes("the cockpit wrap block carries every open row verbatim"));
  assert.ok(flat("skills/pause-resume/SKILL.md").includes("The open queue is not copied: the cockpit carries each project's queue path and open-row count"));
});
