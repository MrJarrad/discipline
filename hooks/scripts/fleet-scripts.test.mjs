// `jhd-container-clone.sh` was rehomed here in 1.79.0 when the discipline-cursor
// repo was archived. A skill that names a command path nobody can run is worse
// than one that names none: the doer follows it, gets "no such file", and
// improvises a product layout. So every command path new-product names is
// asserted to exist, and no placeholder is allowed to survive in its place.
//
// `sync-discipline-into-product.sh` did NOT come across — see the commit message.
// It is inert without the rules/templates payload it copies, and that payload is
// the Cursor-era always-on corpus this same release retired, so importing it would
// have un-retired Cursor one commit after retiring it.
// Run: node --test hooks/scripts/fleet-scripts.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const newProduct = read("skills/new-product/SKILL.md");

// The skill writes absolute paths under the installed checkout (~/JHD/ai/discipline/main)
// because a doer runs them from whatever cwd it is in. Tests resolve the same
// tail against THIS worktree, so a branch is checked against itself rather than
// against whatever happens to be installed on the machine.
const INSTALL_PREFIX = "~/JHD/ai/discipline/main/";

/* Every `bash <path>` and `node <path>` command line the skill names. */
function commandPaths(text) {
  return [...text.matchAll(/(?:bash|node) (~\/JHD\/ai\/discipline\/main\/\S+)/g)].map((m) => m[1]);
}

test("new-product names the clone and doer-rules commands", () => {
  const paths = commandPaths(newProduct);
  assert.ok(paths.length >= 2, `found ${paths.length} command paths: ${paths.join(", ")}`);
  for (const tail of ["scripts/jhd-container-clone.sh", "hooks/scripts/sync-doer-rules.mjs"]) {
    assert.ok(paths.some((p) => p.endsWith(tail)), `new-product no longer names ${tail}`);
  }
});

test("every command path new-product names exists in this repo", () => {
  const missing = commandPaths(newProduct)
    .map((p) => p.slice(INSTALL_PREFIX.length))
    .filter((rel) => !existsSync(join(repo, rel)));
  assert.deepEqual(missing, [], `new-product names paths that do not exist: ${missing.join(", ")}`);
});

test("no placeholder path survived the rehoming", () => {
  assert.doesNotMatch(newProduct, /<fleet-scripts>/, "a placeholder is not a command a doer can run");
});

test("the rehomed script is executable", () => {
  const rel = "scripts/jhd-container-clone.sh";
  assert.ok(statSync(join(repo, rel)).mode & 0o111, `${rel} is not executable`);
});

// The container clone was rehomed byte-for-byte apart from a provenance header:
// it is pure git/rsync with no repo-relative data, so a change to its logic here
// is a change nobody asked for.
test("the rehomed clone script carries no editor or payload dependency", () => {
  const script = read("scripts/jhd-container-clone.sh");
  assert.doesNotMatch(script, /ai\/discipline-cursor/, "still points at the archived repo");
  assert.doesNotMatch(script, /\$ROOT\/(rules|templates|config)/, "grew a repo-relative payload dependency");
  assert.match(script, /Rehomed here in 1\.79\.0/, "provenance header missing");
});

// The overlay payload has no home here yet, so the skill must not hand a doer a
// command for it — a named-but-absent overlay step is the same failure as a
// named-but-absent script path.
test("new-product does not name an overlay sync command it cannot run", () => {
  assert.doesNotMatch(newProduct, /bash [^\n]*sync-discipline-into-product\.sh/);
  assert.match(newProduct, /overlay payload has no home in this repo yet/);
});
