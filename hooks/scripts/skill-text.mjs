// A skill as the model can load it: SKILL.md plus every references/*.md that SKILL.md links.
// Law tests that pin a rule's wording read this, so a rule moved verbatim from the body into a
// linked reference (progressive disclosure, skill-authoring § Information hierarchy) still counts,
// and a rule in an unlinked file does not.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function skillText(skill, { root = repo } = {}) {
  const dir = join(root, "skills", skill);
  const body = readFileSync(join(dir, "SKILL.md"), "utf8");
  const linked = [...new Set([...body.matchAll(/\]\((references\/[A-Za-z0-9._-]+\.md)\)/g)].map((m) => m[1]))];
  return [body, ...linked.filter((rel) => existsSync(join(dir, rel))).map((rel) => readFileSync(join(dir, rel), "utf8"))].join("\n");
}

// readLoaded(root, path): a law test's file read. A skill's SKILL.md reads as the loaded skill
// (skillText); any other path reads as the file itself.
export function readLoaded(root, p) {
  const m = /^skills\/([A-Za-z0-9-]+)\/SKILL\.md$/.exec(p);
  return m ? skillText(m[1], { root }) : readFileSync(join(root, p), "utf8");
}
