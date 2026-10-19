// 1.150.0: DISC-193 (the 1.148.0 merge-gate follow-ups N5, N6, N7, N1 from review #108 round 2),
// lesson 2026-10-18-text-wrap-reproduce-the-real-gesture (four skills) and DISC-195 (one helper-session recipe).
// Run: node --test hooks/scripts/session34-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const has = (p, s) => assert.ok(flat(p).includes(s), `${p} is missing: ${s}`);
const mar = await import("./merge-after-review.mjs");
const HEAD = "c137007fc1159f87d0fc58e885fc8b71b0362275";
const S7 = HEAD.slice(0, 7);
const c = (body, at) => ({ body, author: { login: "MrJarrad" }, at });
const yes = `## Review — head ${S7}\n\n**merge: yes.**`;
const no = `## Review — head ${S7}\n\n**merge: no.**`;

const dir = () => mkdtempSync(join(tmpdir(), "s34-"));
const transcript = (calls) => {
  const p = join(dir(), "t.jsonl");
  const lines = calls.flatMap((k, i) => [
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: `t${i}`, name: "mcp__github__pull_request_read", input: k.input }] } },
    { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: `t${i}`, content: [{ type: "text", text: JSON.stringify(k.items) }] }] } },
  ]);
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return p;
};
const run = (gate, tool_input, transcript_path) => {
  const out = execFileSync(process.execPath, [gate], { input: JSON.stringify({ tool_name: "mcp__github__merge_pull_request", tool_input, transcript_path }), encoding: "utf8" });
  return out.trim() ? JSON.parse(out).hookSpecificOutput : { permissionDecision: "allow" };
};
const gate = join(root, "hooks/bin/merge-review-gate.mjs");
const files = (n, extra = {}) => ({ input: { method: "get_files", owner: "MrJarrad", repo: "jhd-vault", pullNumber: 9, ...extra }, items: Array.from({ length: n }, (_, i) => ({ filename: `projects/p/note-${i}.md` })) });
const vault = (extra = {}) => ({ owner: "MrJarrad", repo: "jhd-vault", pullNumber: 9, expectedHeadSha: HEAD, ...extra });

test("(N5) a notes-only vault merge must pin expectedHeadSha too", () => {
  const t = transcript([files(2)]);
  assert.equal(run(gate, vault(), t).permissionDecision, "allow");
  const d = run(gate, vault({ expectedHeadSha: undefined }), t);
  assert.equal(d.permissionDecision, "deny");
  assert.match(d.permissionDecisionReason, /pass expectedHeadSha/);
});

test("(N5) a full get_files page may hide more files: refused until a short page or a larger perPage is read", () => {
  const d = run(gate, vault(), transcript([files(30)]));
  assert.equal(d.permissionDecision, "deny");
  assert.match(d.permissionDecisionReason, /last get_files page was full.*larger perPage/);
  assert.equal(run(gate, vault(), transcript([files(30), files(3, { page: 2 })])).permissionDecision, "allow");
  assert.equal(run(gate, vault(), transcript([files(30, { perPage: 100 })])).permissionDecision, "allow");
});

test("(N6) the merge: no denial reads cleanly and never says 'with merge: yes on head' after 'says merge: no'", () => {
  const t = transcript([{ input: { method: "get_comments", owner: "MrJarrad", repo: "jhd-portfolio", pullNumber: 5 }, items: [{ body: no, user: { login: "MrJarrad" } }] }]);
  const d = run(gate, { owner: "MrJarrad", repo: "jhd-portfolio", pullNumber: 5, expectedHeadSha: HEAD }, t);
  assert.equal(d.permissionDecision, "deny");
  assert.match(d.permissionDecisionReason, /the latest reviewer verdict on head c137007 says merge: no \(every merge needs merge: yes/);
  assert.doesNotMatch(d.permissionDecisionReason, /says merge: no with/);
  const none = run(gate, { owner: "MrJarrad", repo: "jhd-portfolio", pullNumber: 5, expectedHeadSha: HEAD }, transcript([]));
  assert.match(none.permissionDecisionReason, /no reviewer verdict with merge: yes on head c137007/);
});

test("(N7) the verdict sort is transitive when a timestamp is missing: untimed posts rank oldest", () => {
  const items = [c(no, "2026-10-18T17:00:00Z"), c(yes, undefined), c(yes, "2026-10-18T16:00:00Z")];
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const p of perms) assert.equal(mar.reviewVerdict(p.map((i) => items[i]), HEAD, ["MrJarrad"])?.verdict, "no", p.join());
  assert.equal(mar.reviewVerdict([c(yes, "2026-10-18T16:00:00Z"), c(no, undefined)], HEAD, ["MrJarrad"])?.verdict, "yes");
});

test("(N1) a gate that cannot load merge-after-review.mjs fails closed instead of exiting 1", () => {
  const tmp = dir();
  mkdirSync(join(tmp, "hooks/bin"), { recursive: true });
  mkdirSync(join(tmp, "hooks/scripts"), { recursive: true });
  cpSync(gate, join(tmp, "hooks/bin/merge-review-gate.mjs"));
  writeFileSync(join(tmp, "hooks/scripts/merge-after-review.mjs"), "export const broken = ;\n");
  const d = run(join(tmp, "hooks/bin/merge-review-gate.mjs"), vault(), transcript([files(1)]));
  assert.equal(d.permissionDecision, "deny");
  assert.match(d.permissionDecisionReason, /merge-review-gate failed closed/);
});

const LESSON = "2026-10-18-text-wrap-reproduce-the-real-gesture";
test("(lesson 1,2) webapp-testing: motion probes carry a hover-wobble and a scroll segment; fixtures include a tall-type case", () => {
  has("skills/webapp-testing/SKILL.md", "**Probe the operator's gestures and the page's real type**");
  has("skills/webapp-testing/SKILL.md", "hover-wobble segment");
  has("skills/webapp-testing/SKILL.md", "a scroll segment beside travel");
  has("skills/webapp-testing/SKILL.md", "tall-type case");
  has("skills/webapp-testing/SKILL.md", LESSON);
});

test("(lesson 3) diagnosing-bugs: a pixel measure of a recording is validated on a known-calm reference first", () => {
  has("skills/diagnosing-bugs/SKILL.md", "is validated first on a known-calm reference, such as a plain window resize");
  has("skills/diagnosing-bugs/SKILL.md", LESSON);
});

test("(lesson 4) grilling: any motion feature starts by asking for the reference behaviour", () => {
  has("skills/grilling/SKILL.md", "On any motion feature the first question asks for the reference behaviour itself");
  has("skills/grilling/SKILL.md", LESSON);
});

test("(lesson 5) test-first: a gate's threshold comes from the specified mechanism and is agreed before building", () => {
  has("skills/test-first/SKILL.md", "**A gate's threshold is one the specified behaviour can pass**");
  has("skills/test-first/SKILL.md", "get it agreed before building to it");
  has("skills/test-first/SKILL.md", LESSON);
});

test("(DISC-195) one helper recipe: cloud-dispatch holds it, the pointers lead to it, and it covers every step", () => {
  const ref = "skills/cloud-dispatch/references/HELPER-SESSIONS.md";
  for (const s of [
    "`source_url`", "`add_repo`", "`register_repo_root`", "`model-routing`",
    "Helper · <task in plain words> — no action needed", "session-titles-2026-10-15",
    "this brief is from your parent (session <id>); start now, no go needed",
    "`send_message`", "Reports the plugin version it loaded", "Posts its return on the PR",
    "`get_session`", "`list_events`", "`archive_session`", "never archived",
  ]) has(ref, s);
  has("skills/cloud-dispatch/SKILL.md", "references/HELPER-SESSIONS.md");
  has("skills/routing/references/HARD-RULES.md", "`cloud-dispatch/references/HELPER-SESSIONS.md`");
  assert.ok(!flat("skills/routing/references/HARD-RULES.md").includes("blob_limit_kb"), "the recipe is stated once, in the reference");
});

test("release: 1.150.0 in both manifests and CHANGED.txt, with the encoded line", () => {
  for (const p of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) has(p, '"version": "1.150.0"');
  const top = readFileSync(join(root, "CHANGED.txt"), "utf8");
  assert.ok(top.startsWith("1.150.0 — "));
  assert.match(top.split("\n\n")[0], /\nencoded: 1\.150\.0 — .*2026-10-18-text-wrap-reproduce-the-real-gesture/);
});
