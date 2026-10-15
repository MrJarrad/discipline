#!/usr/bin/env node
/* builds-check — is any Workers Build running or queued for a repo? (backlog DISC-171,
   lesson `preview-builds-and-stale-heads-2026-10-14`, 2026-10-15). Briefs hand-listed PRs and
   missed some; overlapping Workers Builds hit R2 429s. One command asks Cloudflare instead.

   usage:  env -u CLOUDFLARE_API_TOKEN NODE_USE_ENV_PROXY=1 node builds-check.mjs <repo> [--account <id>]
   account: --account, else CLOUDFLARE_ACCOUNT_ID, else the only account from GET /accounts.
   exit:    0 no active build | 1 at least one active build (listed) | 2 Cloudflare refused or
            the lookup failed (message printed; never read exit 2 as "clear").

   Endpoints (seen to work 2026-10-15): GET /accounts; GET /accounts/{id}/workers/scripts (id +
   tag per script); GET /accounts/{id}/builds/workers/{script tag}/builds (newest first; each
   build has status "running"/"queued"/"stopped", trigger.repo_connection.repo_name, branch and
   commit in build_trigger_metadata). Active = status other than "stopped". In cloud the proxy
   injects auth only when the request carries no Authorization header, so none is sent unless
   CLOUDFLARE_API_TOKEN is set. Node built-ins only. */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const API = "https://api.cloudflare.com/client/v4";

export class RefusedError extends Error {}

export async function cfGet(path, fetchImpl = fetch, token = process.env.CLOUDFLARE_API_TOKEN) {
  let res;
  try {
    res = await fetchImpl(`${API}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch (e) {
    throw new RefusedError(`cannot reach api.cloudflare.com (${e.message}); run as env -u CLOUDFLARE_API_TOKEN NODE_USE_ENV_PROXY=1 node builds-check.mjs`);
  }
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  if (!res.ok || !body || body.success !== true) {
    throw new RefusedError(`Cloudflare refused GET ${path}: HTTP ${res.status} ${text.slice(0, 300)}. Workers Builds state is unknown: do not treat as clear; ask the operator for a user token or check the dashboard.`);
  }
  return body.result;
}

export async function resolveAccount({ account, env = process.env, fetchImpl = fetch } = {}) {
  const given = account || env.CLOUDFLARE_ACCOUNT_ID;
  if (given) return given;
  const accounts = await cfGet("/accounts", fetchImpl);
  if (accounts.length !== 1) throw new RefusedError(`/accounts returned ${accounts.length} accounts; pass --account <id>`);
  return accounts[0].id;
}

/* Active builds for `repo` (name, or owner/name) across every script in the account. */
export async function activeBuilds(repo, account, fetchImpl = fetch) {
  const name = repo.split("/").pop();
  const scripts = await cfGet(`/accounts/${account}/workers/scripts`, fetchImpl);
  const out = [];
  for (const s of scripts) {
    const builds = await cfGet(`/accounts/${account}/builds/workers/${s.tag}/builds`, fetchImpl);
    for (const b of builds) {
      if (b.status === "stopped" || b.trigger?.repo_connection?.repo_name !== name) continue;
      out.push({ script: s.id, status: b.status, branch: b.build_trigger_metadata?.branch, commit: (b.build_trigger_metadata?.commit_hash ?? "").slice(0, 7), since: b.created_on });
    }
  }
  return out;
}

function isMainModule() {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  const ai = args.indexOf("--account");
  const account = ai >= 0 ? args.splice(ai, 2)[1] : undefined;
  const repo = args[0];
  if (!repo) { console.error("usage: node builds-check.mjs <repo> [--account <id>]"); process.exit(2); }
  try {
    const acct = await resolveAccount({ account });
    const active = await activeBuilds(repo, acct);
    if (!active.length) { console.log(`builds-check: no Workers Build running or queued for ${repo}`); process.exit(0); }
    for (const b of active) console.log(`builds-check: ACTIVE ${b.status} ${b.script} ${b.branch}@${b.commit} since ${b.since}`);
    console.log(`builds-check: ${active.length} active for ${repo}; do not push another preview/* until they end`);
    process.exit(1);
  } catch (e) {
    console.error(`builds-check: ${e.message}`);
    process.exit(2);
  }
}
