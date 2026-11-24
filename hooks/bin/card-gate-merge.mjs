#!/usr/bin/env node
/* PreToolUse (mcp__github__merge_pull_request) — DISC-367 slice 2. A jhd-portfolio PR that changes a module the
   site docs map to a feature merges only with that feature's card in the same PR (`hooks/scripts/card-gate.mjs`,
   escape `Card: no change — <reason>` in a commit message, reason echoed to the reviewer). Other repos: silent.
   The hook has no GitHub access; like vault-pr-files it reads the PR from a local clone's `refs/pull/<n>/merge`.
   The clone is $JHD_PORTFOLIO_ROOT, else the hook's cwd when it is a jhd-portfolio checkout, else the usual
   cloud and Mac paths. No readable clone, a failed fetch or any crash denies, naming the CLI to run by hand.   */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "card-gate.mjs");
const deny = (reason) => {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
  process.exit(0);
};
const isPortfolio = (dir) => {
  if (!dir || !existsSync(dir)) return false;
  const r = spawnSync("git", ["-C", dir, "remote", "get-url", "origin"], { encoding: "utf8" });
  return r.status === 0 && /mrjarrad\/jhd-portfolio(?:\.git)?\/?$/i.test(r.stdout.trim());
};

try {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const t = input.tool_input || {};
  if (String(t.repo).toLowerCase() !== "jhd-portfolio") process.exit(0);
  const how = (c) => `run \`node ${CLI} --repo ${c} --pr ${t.pullNumber}\` (exit 0 = every changed module's card is in the PR), then merge.`;
  let byHand = how("<portfolio clone>");
  const env = process.env.JHD_PORTFOLIO_ROOT;
  const home = process.env.HOME || "";
  const candidates = env ? [env] : [input.cwd, "/home/user/jhd-portfolio", `${home}/JHD/portfolio/main`];
  const clone = candidates.find(isPortfolio) || (env && existsSync(env) ? env : null);
  if (!clone) deny(`card-gate-merge: ${t.owner}/${t.repo}#${t.pullNumber} — no jhd-portfolio clone found to read the PR from (set JHD_PORTFOLIO_ROOT); ${byHand}`);
  byHand = how(clone);
  const args = [CLI, "--repo", clone, "--pr", String(t.pullNumber)];
  if (/^[0-9a-f]{40}$/.test(String(t.expectedHeadSha || ""))) args.push("--head", t.expectedHeadSha);
  const r = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 150000 });
  const v = JSON.parse(r.stdout || "{}").cardGate;
  if (!v) deny(`card-gate-merge: the gate produced no verdict (${(r.stderr || "").trim().split("\n")[0]}); ${byHand}`);
  if (v.ok) {
    if (v.notice) console.log(JSON.stringify({ systemMessage: `card-gate-merge: ${v.notice}` }));
    process.exit(0);
  }
  if (v.reason) deny(`card-gate-merge: PR files unreadable or no card map — ${v.reason}; ${byHand}`);
  const parts = [
    ...v.missing.map((m) => `${m.card} (changed: ${m.modules.join(", ")})`),
    ...v.unmapped.map((u) => `${u} is in no feature: add it to docs/site/inventory.md and its card`),
  ];
  deny(`card-gate-merge: ${t.owner}/${t.repo}#${t.pullNumber} changes behaviour without its card — ${parts.join("; ")}. Update the card in this PR, or a commit message carrying \`Card: no change — <reason>\` if the behaviour did not change.`);
} catch (e) {
  deny(`card-gate-merge: crashed (${e?.message}); run the CLI by hand: node ${CLI} --repo <portfolio clone> --pr <n>`);
}
