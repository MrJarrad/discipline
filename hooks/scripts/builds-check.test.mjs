// Run: node --test hooks/scripts/builds-check.test.mjs  (DISC-171; fixtures shaped from live responses 2026-10-15)
import { test } from "node:test";
import assert from "node:assert/strict";
import { cfGet, resolveAccount, activeBuilds, RefusedError } from "./builds-check.mjs";

const ok = (result) => ({ ok: true, status: 200, text: async () => JSON.stringify({ success: true, result }) });
const build = (status, repo, branch) => ({ status, trigger: { repo_connection: { repo_name: repo } }, build_trigger_metadata: { branch, commit_hash: "d8741b613235b0fb" }, created_on: "t" });
const fake = (routes) => async (url) => {
  const p = url.replace("https://api.cloudflare.com/client/v4", "");
  if (!(p in routes)) return { ok: false, status: 404, text: async () => '{"success":false}' };
  return ok(routes[p]);
};

test("account falls back to the single /accounts entry; arg and env win", async () => {
  const f = fake({ "/accounts": [{ id: "A1" }] });
  assert.equal(await resolveAccount({ env: {}, fetchImpl: f }), "A1");
  assert.equal(await resolveAccount({ account: "X", env: {}, fetchImpl: f }), "X");
  assert.equal(await resolveAccount({ env: { CLOUDFLARE_ACCOUNT_ID: "E" }, fetchImpl: f }), "E");
  await assert.rejects(resolveAccount({ env: {}, fetchImpl: fake({ "/accounts": [{ id: 1 }, { id: 2 }] }) }), RefusedError);
});

test("active = non-stopped build for the named repo only", async () => {
  const f = fake({
    "/accounts/A/workers/scripts": [{ id: "stg", tag: "t1" }, { id: "hov", tag: "t2" }],
    "/accounts/A/builds/workers/t1/builds": [build("running", "jhd-portfolio", "preview/x"), build("stopped", "jhd-portfolio", "main")],
    "/accounts/A/builds/workers/t2/builds": [build("queued", "jhd-hoverboard", "preview/y")],
  });
  const r = await activeBuilds("MrJarrad/jhd-portfolio", "A", f);
  assert.deepEqual(r.map((b) => [b.script, b.status, b.branch, b.commit]), [["stg", "running", "preview/x", "d8741b6"]]);
  assert.deepEqual(await activeBuilds("nothing", "A", f), []);
});

test("a refusal names the response and says not-clear", async () => {
  const f = async () => ({ ok: false, status: 403, text: async () => '{"success":false,"errors":[{"code":10000}]}' });
  await assert.rejects(cfGet("/accounts", f, null), (e) => e instanceof RefusedError && /HTTP 403/.test(e.message) && /do not treat as clear/.test(e.message));
});

test("no Authorization header unless a token is set", async () => {
  let seen;
  const f = async (_u, o) => { seen = o.headers; return ok([]); };
  await cfGet("/x", f, null); assert.deepEqual(seen, {});
  await cfGet("/x", f, "tok"); assert.equal(seen.Authorization, "Bearer tok");
});
