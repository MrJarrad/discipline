// 1.141.0: DISC-178 release follows merge, DISC-179 status/Drop/wake checks. Run: node --test hooks/scripts/session27-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("DISC-178: baton row and RELEASE-PATH carry release-follows-merge with the operator-owned exceptions", () => {
  assert.match(flat("skills/routing/SKILL.md"), /Merged main changes unreleased\*\* \| \*\*Parent\*\* releases.*no operator row/);
  const t = flat("skills/release-deploy/references/RELEASE-PATH.md");
  assert.match(t, /Release follows merge.*parent starts the release without asking.*never a `Needed from you` row/);
  assert.match(t, /Still the operator's:.*SITE_MODE holding -> live.*new public route.*removing the holding page.*auto-roll back twice/);
});
test("DISC-179(2)(3): Drop only on the operator's word, newest version, re-check once; wake sweeps helper sessions (prose: no hook can list a bucket or call get_session)", () => {
  const t = flat("output-styles/discipline.md");
  assert.match(t, /Drop is checked only when the operator says something was added.*newest R2 `jhd-drop` objects.*newest version of a re-saved file and name which.*re-check once shortly after.*never ask for a re-upload first.*no session-start Drop check/);
  assert.match(t, /Every wake also sweeps helper-session status.*get_session.*ready link reaches the operator that turn/);
});
test("DISC-179(1): the Stop check is described in the output style and wired in hooks.json", () => {
  assert.match(flat("output-styles/discipline.md"), /A Stop hook checks it.*needed-from-you-stop\.mjs/);
  assert.match(readFileSync(join(root, "hooks/hooks.json"), "utf8"), /"Stop"[\s\S]*needed-from-you-stop\.mjs/);
});
