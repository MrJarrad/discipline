// DISC-351 slice 1: the shared vault lookup. Run: node --test hooks/scripts/resolve-vault.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveVault, stopVerdict, CLOUD_VAULT } from "./lib/resolve-vault.mjs";

const has = (...dirs) => (p) => dirs.some((d) => p === join(d, "projects"));

test("env wins; a set-but-not-a-vault env turns the lookup off", () => {
  assert.deepEqual(resolveVault({ env: { DISCIPLINE_VAULT_ROOT: "/e" }, home: "/h", exists: has("/e", "/h/JHD/vault") }), { root: "/e", via: "env" });
  assert.equal(resolveVault({ env: { DISCIPLINE_VAULT_ROOT: "none" }, home: "/h", exists: has("/h/JHD/vault", CLOUD_VAULT) }), null);
});
test("no env: ~/JHD/vault/main (home), then the cloud clone at /home/user/jhd-vault", () => {
  assert.deepEqual(resolveVault({ env: {}, home: "/h", exists: has("/h/JHD/vault/main", CLOUD_VAULT) }), { root: "/h/JHD/vault/main", via: "home" });
  assert.deepEqual(resolveVault({ env: {}, home: "/h", exists: has(CLOUD_VAULT) }), { root: CLOUD_VAULT, via: "cloud" });
  assert.deepEqual(resolveVault({ env: { DISCIPLINE_VAULT_ROOT: "", DISCIPLINE_CLOUD_VAULT: "/c" }, home: "/h", exists: has("/c") }), { root: "/c", via: "cloud" }, "empty env is unset; cloud path overridable");
  assert.deepEqual(resolveVault({ env: { DISCIPLINE_VAULT_ROOT: "/bare" }, home: "/h", exists: (p) => p === "/bare", need: "" }), { root: "/bare", via: "env" });
  assert.equal(CLOUD_VAULT, "/home/user/jhd-vault");
  assert.equal(resolveVault({ env: {}, home: "/h", exists: () => false }), null);
});
test("verdict: env-named vaults block as before; the cloud clone warns until the mode is block", () => {
  assert.equal(stopVerdict("r", "env", {}).decision, "block");
  assert.equal(stopVerdict("r", "home", {}).decision, "block");
  assert.deepEqual(Object.keys(stopVerdict("r", "cloud", {})), ["systemMessage"]);
  assert.equal(stopVerdict("r", "cloud", { DISCIPLINE_OUTCOME_CHECKS: "block" }).decision, "block");
});
test("the real cloud clone is found by a hook with no env var set", { skip: !existsSync(join(CLOUD_VAULT, "projects")) }, () => {
  const hook = fileURLToPath(new URL("../bin/needed-from-you-stop.mjs", import.meta.url));
  const home = mkdtempSync(join(tmpdir(), "rv-home-"));
  const env = { PATH: process.env.PATH, HOME: home };
  const t = join(home, "t.jsonl");
  const L = (o) => JSON.stringify(o);
  spawnSync("sh", ["-c", `printf '%s\\n%s\\n' '${L({ type: "user", timestamp: "2026-10-16T10:00:00.000Z", message: { content: "s" } })}' '${L({ type: "assistant", message: { content: [{ type: "text", text: "Status.\n\n## Needed from you\n\nNothing." }] } })}' > ${t}`]);
  const r = spawnSync("node", [hook], { input: JSON.stringify({ transcript_path: t }), encoding: "utf8", env });
  assert.equal(r.status, 0);
  if (r.stdout) assert.equal(JSON.parse(r.stdout).decision, undefined, "warn-only in this slice");
});
