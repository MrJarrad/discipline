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

test("DISC-224 D: a helper's state is read from its progress file first, list_events narrow — HELPER-SESSIONS § 3", () => {
  const h = flat("skills/cloud-dispatch/references/HELPER-SESSIONS.md");
  assert.ok(h.includes("To see what a helper is doing, read its progress file (the brief names it) first; otherwise `list_events` with `kinds: [\"result\"]` and `limit: 5`, widening to `\"assistant\"` only when that does not answer (DISC-224, s44: 12.7k chars for one read)."));
  assert.ok(!h.includes("`limit: 100`"));
});

test("DISC-224 E: the first status reply comes before housekeeping — HARD-RULES 24, pointed at from routing and pause-resume", () => {
  const s = flat("skills/routing/references/HARD-RULES.md");
  assert.ok(s.includes("24. **The first status reply comes before housekeeping**"));
  assert.ok(s.includes("A starting or resuming parent sends its first status reply from three reads only: `session-resume.mjs`, `needed-from-you.mjs` and the cockpit."));
  assert.ok(s.includes("Merges, the helper sweep, re-point messages and PR or session reads come after it, in a turn the parent starts itself with one `send_later` (`delay_minutes: 1`) armed before the reply."));
  assert.ok(flat("skills/routing/SKILL.md").includes("The first status reply comes before any merge or sweep (HARD-RULES 24)."));
  assert.ok(flat("skills/pause-resume/SKILL.md").includes("the first status reply comes before any merge or sweep (`routing` HARD-RULES 24)"));
});

test("DISC-224 F: the start is measured by start-cost.mjs against a budget — HARD-RULES 24", () => {
  const s = flat("skills/routing/references/HARD-RULES.md");
  assert.ok(s.includes("Measured by `node <plugin>/hooks/scripts/start-cost.mjs <transcript.jsonl> --max 40000` (tool-result chars through the first status reply; s44: ~176.7k)."));
});

test("DISC-226: a paragraph follows the pattern first, the ruled-out openers after — HOUSE-VOICE, prompt-craft pointer", () => {
  const s = flat("skills/brand-voice/references/HOUSE-VOICE.md");
  assert.ok(s.includes("## Writing a paragraph — the pattern"));
  assert.ok(s.includes("Write from the person's own approach and perspective, stated plainly, never a broad declaration about design or belief."));
  assert.ok(s.includes("1. **Name the concepts** the paragraph has to carry."));
  assert.ok(s.includes("2. **Find how they relate**: what leads to what. Reordering the same ideas is not a resolution."));
  assert.ok(s.includes("3. **Write one point of view** that holds them, in the order perspective, how the work is done, what that makes possible."));
  assert.ok(s.includes("4. **Build toward the most distinctive idea**, so the paragraph ends on it."));
  assert.ok(s.includes("A tone reference (a site, a page) is read for its qualities, such as direct, purpose-led, personal but considered, naturally structured, never for its wording."));
  const i = s.indexOf("## Writing a paragraph — the pattern"), ex = s.indexOf("What the pattern rules out", i);
  assert.ok(ex > s.indexOf("4. **Build toward the most distinctive idea**", i), "the ruled-out examples come after the pattern");
  assert.ok(s.slice(ex).includes("\"I believe\"") && s.slice(ex).includes("\"good design\""));
  assert.ok(flat("skills/prompt-craft/SKILL.md").includes("A copy brief points at `brand-voice` HOUSE-VOICE § Writing a paragraph — the pattern"));
});

test("release: 1.162.0 in both manifests and CHANGED.txt, with the encoded line", () => {
  for (const p of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) assert.ok(read(p).includes('"version": "1.162.0"'), p);
  const top = read("CHANGED.txt");
  assert.ok(top.startsWith("1.162.0 — "));
  assert.ok(top.split("\n\n")[0].includes("encoded: 1.162.0 — backlog DISC-223, DISC-224."));
});
