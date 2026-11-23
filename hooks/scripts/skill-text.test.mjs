// skillText reads a skill the way the model can load it: the body plus the references it links.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { skillText } from "./skill-text.mjs";

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "skill-text-"));
  const dir = join(root, "skills", "demo");
  mkdirSync(join(dir, "references"), { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), "---\nname: demo\n---\nBody rule. Detail: [references/LINKED.md](references/LINKED.md).\n");
  writeFileSync(join(dir, "references", "LINKED.md"), "A rule moved out of the body.\n");
  writeFileSync(join(dir, "references", "ORPHAN.md"), "A rule nobody points at.\n");
  return root;
};

test("a rule in a reference the body links is part of the skill", () => {
  const text = skillText("demo", { root: fixture() });
  assert.match(text, /Body rule\./);
  assert.match(text, /A rule moved out of the body\./);
});

test("a rule in a reference the body never links is not", () => {
  assert.doesNotMatch(skillText("demo", { root: fixture() }), /A rule nobody points at\./);
});

test("readLoaded reads a SKILL.md path as the loaded skill and any other path as the file", async () => {
  const { readLoaded } = await import("./skill-text.mjs");
  const root = fixture();
  assert.match(readLoaded(root, "skills/demo/SKILL.md"), /A rule moved out of the body\./);
  assert.doesNotMatch(readLoaded(root, "skills/demo/references/ORPHAN.md"), /Body rule/);
});
