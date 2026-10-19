// 1.151.0: the reviewer's ambers on #110 (A1 pagination, A2 stated-once, A3 send_message) and DISC-197
// (an `## Upcoming` section of backlog links, printed by needed-from-you.mjs). Run: node --test hooks/scripts/session35-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// Loaded dynamically so a 1.150.0 tree reports each check red, not one load error.
const nfy = await import("./needed-from-you.mjs");
const missing = (n) => () => { throw new Error(`${n} is not exported`); };
const { neededFromYou } = nfy;
const renderUpcoming = nfy.renderUpcoming ?? missing("renderUpcoming");
const vaultBlobBase = nfy.vaultBlobBase ?? missing("vaultBlobBase");
import { check } from "../bin/needed-from-you-stop.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const has = (p, s) => assert.ok(flat(p).includes(s), `${p} is missing: ${s}`);
const HEAD = "c137007fc1159f87d0fc58e885fc8b71b0362275";
const dir = () => mkdtempSync(join(tmpdir(), "s35-"));

/* --- A1: get_files pagination --- */
const gate = join(root, "hooks/bin/merge-review-gate.mjs");
const transcript = (calls) => {
  const p = join(dir(), "t.jsonl");
  const lines = calls.flatMap((k, i) => [
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: `t${i}`, name: "mcp__github__pull_request_read", input: { method: "get_files", owner: "MrJarrad", repo: "jhd-vault", pullNumber: 9, ...k.input } }] } },
    { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: `t${i}`, content: [{ type: "text", text: JSON.stringify(Array.from({ length: k.n }, (_, j) => ({ filename: `projects/p/n-${k.input.page || 1}-${j}.md` }))) }] }] } },
  ]);
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return p;
};
const decide = (calls) => {
  const out = execFileSync(process.execPath, [gate], { input: JSON.stringify({ tool_name: "mcp__github__merge_pull_request", tool_input: { owner: "MrJarrad", repo: "jhd-vault", pullNumber: 9, expectedHeadSha: HEAD }, transcript_path: transcript(calls) }), encoding: "utf8" });
  return out.trim() ? JSON.parse(out).hookSpecificOutput.permissionDecision : "allow";
};

test("(A1) get_files completeness needs page 1 through a short page, with no gaps", () => {
  assert.equal(decide([{ n: 5, input: { page: 2 } }]), "deny", "page 2 alone, page 1 never read");
  assert.equal(decide([{ n: 30, input: {} }, { n: 4, input: { page: 3 } }]), "deny", "page 2 skipped");
  assert.equal(decide([{ n: 100, input: { perPage: 200 } }]), "deny", "GitHub caps perPage at 100, so 100 rows is a full page");
  assert.equal(decide([{ n: 30, input: {} }]), "deny", "a full first page");
  assert.equal(decide([{ n: 30, input: {} }, { n: 30, input: { page: 2 } }, { n: 2, input: { page: 3 } }]), "allow");
  assert.equal(decide([{ n: 30, input: { perPage: 100 } }]), "allow");
  assert.equal(decide([{ n: 7, input: {} }]), "allow");
});

/* --- A2: the helper rules are stated once --- */
test("(A2) HARD-RULES 19 owns the opener, the sweep cadence and the archive trigger; the recipe points at it without restating", () => {
  const rules = flat("skills/routing/references/HARD-RULES.md");
  for (const s of ["start now, no go needed", "within 5 minutes of dispatch and on every wake", "answers a blocked helper the same turn", "superseded round's helper is archived then"]) assert.ok(rules.includes(s), s);
  const recipe = flat("skills/cloud-dispatch/references/HELPER-SESSIONS.md");
  for (const s of ["start now, no go needed", "within 5 minutes", "same turn", "superseded round", "Helper · <task", "no action needed"]) assert.ok(!recipe.includes(s), `the recipe restates: ${s}`);
  assert.match(recipe, /HARD-RULES 19/);
  assert.ok(!/\.\. Do not queue/.test(flat("skills/cloud-dispatch/SKILL.md")), "stray double full stop");
});

/* --- A3: a helper's read-back and return reach the parent by send_message --- */
test("(A3) the recipe requires every read-back and the final return to go to the parent with send_message, and says the transcript is not a channel", () => {
  const f = "skills/cloud-dispatch/references/HELPER-SESSIONS.md";
  has(f, "every read-back and the final return go to the parent with `send_message` using the parent id above");
  has(f, "the helper's own transcript is not a channel to the parent");
  has(f, "**and sends the same return to the parent with `send_message`**");
  has(f, "A read-back written only in its transcript does not reach the parent.");
});

/* --- DISC-197: ## Upcoming --- */
const FM = (px, kind) => `---\nname: x\nkind: ${kind}\nprefix: ${px}\n---\n`;
function vault(remote) {
  const v = dir();
  const put = (p, t) => { mkdirSync(join(v, p, ".."), { recursive: true }); writeFileSync(join(v, p), t); };
  for (const [px, proj] of [["PF", "portfolio"], ["HB", "hoverboard"], ["DISC", "jhd-discipline"]]) {
    put(`projects/${proj}/${proj}-queue.md`, FM(px, "queue") + `| # | Needed | Where | Why | Recommended |\n| - | - | - | - | - |\n`);
    put(`projects/${proj}/${proj}-backlog.md`, FM(px, "backlog") + `## Open\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n\n## Done\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n`);
  }
  if (remote) { execFileSync("git", ["-C", v, "init", "-q"]); execFileSync("git", ["-C", v, "remote", "add", "origin", remote]); }
  return v;
}

test("(DISC-197) the vault's blob base comes from its origin remote, https or ssh, credentials and .git stripped", () => {
  const base = (u) => vaultBlobBase("/x", () => u);
  assert.equal(base("https://github.com/MrJarrad/jhd-vault"), "https://github.com/MrJarrad/jhd-vault/blob/main");
  assert.equal(base("https://x-access-token:abc@github.com/MrJarrad/jhd-vault.git\n"), "https://github.com/MrJarrad/jhd-vault/blob/main");
  assert.equal(base("git@github.com:Someone/else-vault.git"), "https://github.com/Someone/else-vault/blob/main");
  assert.equal(base("/srv/git/vault.git"), null);
  assert.equal(vaultBlobBase("/x", () => { throw new Error("no remote"); }), null);
});

test("(DISC-197) the script prints ## Upcoming with one backlog link per session project, above ## Needed from you", () => {
  const v = vault("https://github.com/MrJarrad/jhd-vault");
  const r = spawnSync(process.execPath, [join(root, "hooks/scripts/needed-from-you.mjs"), "--vault", v, "--projects", "PF,HB,DISC"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = r.stdout;
  assert.ok(out.startsWith("## Upcoming\n"));
  for (const [px, proj] of [["PF", "portfolio"], ["HB", "hoverboard"], ["DISC", "jhd-discipline"]]) {
    assert.ok(out.includes(`- [${px} — ${proj} backlog](https://github.com/MrJarrad/jhd-vault/blob/main/projects/${proj}/${proj}-backlog.md)`), proj);
  }
  assert.equal([...out.matchAll(/^- \[/gm)].length, 3, "one link per project");
  assert.ok(out.indexOf("## Upcoming") < out.indexOf("## Needed from you"));
  const heads = [...out.matchAll(/^## .*$/gm)].map((m) => m[0]);
  assert.deepEqual(heads, ["## Upcoming", "## Needed from you"], "Needed from you stays the last ## heading");
  const one = spawnSync(process.execPath, [join(root, "hooks/scripts/needed-from-you.mjs"), "--vault", v, "--projects", "HB"], { encoding: "utf8" }).stdout;
  assert.ok(!/portfolio|jhd-discipline/.test(one), "only the session's projects are linked");
});

test("(DISC-197) with no GitHub remote the section names the file path and says why, never a made-up link", () => {
  const v = vault(null);
  const up = renderUpcoming(neededFromYou(v, ["PF"]), vaultBlobBase(v, () => { throw new Error("none"); }));
  assert.match(up, /PF — portfolio backlog: `projects\/portfolio\/portfolio-backlog\.md` \(the vault has no GitHub remote, so no link\)/);
  assert.ok(!up.includes("http"));
});

test("(DISC-197) the Stop hook accepts Upcoming above the block, treats it as a status reply, and still wants the block last", () => {
  const v = vault(null);
  writeFileSync(join(v, "projects/portfolio/portfolio-queue.md"), FM("PF", "queue") + "| # | Needed | Where | Why | Recommended |\n| - | - | - | - | - |\n| PF-5 | look at footer | | | |\n");
  const block = "## Needed from you\n\n### PF — portfolio\n\n1. **Footer** PF-5 look.\n";
  const up = "## Upcoming\n\n- [PF — portfolio backlog](https://github.com/MrJarrad/jhd-vault/blob/main/projects/portfolio/portfolio-backlog.md)\n\n";
  const T = "2026-10-19T10:00:00.000Z";
  assert.equal(check({ text: `Status.\n\n## Build in Progress\n\n- lane\n\n${up}${block}`, userTs: T, vault: v }), null);
  assert.match(check({ text: `Status.\n\n${up}`, userTs: T, vault: v }), /no `## Needed from you` block/);
  assert.match(check({ text: `${block}\n${up}`, userTs: T, vault: v }), /last section/);
  has("output-styles/discipline.md", "**`## Upcoming` sits between them**");
  has("output-styles/discipline.md", "never hand-build a link");
});

test("release: 1.151.0 in both manifests and CHANGED.txt, with the encoded line", () => {
  for (const p of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) has(p, '"version": "1.151.0"');
  const top = readFileSync(join(root, "CHANGED.txt"), "utf8");
  assert.ok(top.startsWith("1.151.0 — "));
  assert.match(top.split("\n\n")[0], /\nencoded: 1\.151\.0 — .*DISC-197/);
});
