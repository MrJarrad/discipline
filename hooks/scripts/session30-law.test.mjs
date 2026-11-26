// 1.146.0: lesson 2026-10-18-look-rounds-and-harness-claims (session 29), one rule per owner.
// Run: node --test hooks/scripts/session30-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readLoaded } from "./skill-text.mjs"; // a SKILL.md path reads as the loaded skill: body + linked references

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readLoaded(root, p).replace(/\s+/g, " ");

test("operator-facing motion or behaviour numbers come from the deployed probe only", () => {
  assert.match(flat("skills/routing/references/OPERATOR-REPLIES.md"), /A motion or behaviour number reaches him only from the deployed probe; a harness number is labelled "in testing" or withheld until the deployed run lands \(`2026-10-18-look-rounds-and-harness-claims`\)/);
});
test("never cd into a shared clone: the journal hook writes into the cwd", () => {
  assert.match(flat("doer-rules.md"), /\*\*Never `cd` into a shared clone or a vault subfolder\*\*: run read-only commands with absolute paths from the vault root — the session journal hook writes `\.claude\/journal\.jsonl` into the working directory/);
  assert.match(flat("skills/routing/references/OPERATOR-REPLIES.md"), /Your own shell never `cd`s into a shared clone or vault subfolder \(`doer-rules\.md` § Repo and safety\)/);
});
