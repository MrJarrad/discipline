// DISC-297 (operator s80, verbatim): "these 2 items are the kind of thing that should just be review together. Generally we may be getting a bit granular with reviews."
// and "i'm getting a bit confused with what i should be looking at"; Status dropdown "yes" (rulings 2026-11-12-s80-fewer-granular-reviews).
// The mechanism is queue-page-sync.mjs (its own test); this pins the prose that tells the parent how to use it.
// Run: node --test hooks/scripts/disc297-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("DISC-297: the pinned-doc rule lives once in HARD-RULES and names all four parts", () => {
  const h = flat("skills/routing/references/HARD-RULES.md");
  for (const s of [
    "**One look row per lane, and every item shows its Status** (DISC-297",
    "a new round of the same lane REPLACES that row's text and link, never appends",
    "related asks on one lane or screen are presented together for one review",
    "an answered item leaves \"Waiting on you\" in the same turn",
    "every item carries the Status chip: Ready for you / You're on it / Claude's on it / Done",
    "`queue-page-sync.mjs` flags `noStatus`, `appended`, `sameLane` and `leaveWaiting`",
  ]) assert.ok(h.includes(s), s);
});

test("DISC-297: the always-on style and wrap point at the rule, they do not restate it", () => {
  assert.ok(flat("output-styles/discipline.md").includes("(DISC-297, `routing` HARD-RULES)"));
  assert.ok(flat("skills/wrap/references/SECTIONS.md").includes("`leaveWaiting`"));
});

// DISC-299 (s81): the release path proposes the setup-script refresh-line bump; s80 Mac wording lives where Mac-job asks live.
test("DISC-299: RELEASE-PATH makes server-managed settings the route (no per-release step) and the refresh line only a fallback", () => {
  const r = flat("skills/release-deploy/references/RELEASE-PATH.md");
  for (const s of ["every new session should always be on the latest version of the plugin", "https://claude.ai/admin-settings/claude-code",
    "\"extraKnownMarketplaces\":{\"discipline\":{\"source\":{\"source\":\"github\",\"repo\":\"MrJarrad/discipline\"},\"autoUpdate\":true}}", "\"enabledPlugins\":{\"discipline@discipline\":true}",
    "There is no per-release step", "Prove it in a fresh session", "Fallback only", "setup-refresh-line.mjs"]) assert.ok(r.includes(s), s);
  assert.ok(!r.includes("After a discipline release tag"), "the per-release proposal step is gone");
});
test("s80 Mac wording: ask 'Is now a good time for me to take over your Mac (about N minutes)?' before a job that uses the screen", () => {
  const m = flat("skills/cloud-dispatch/references/MAC-JOBS.md");
  assert.ok(m.includes("Is now a good time for me to take over your Mac (about N minutes)?"));
  assert.ok(m.includes("never ask whether he is at the Mac"));
});
// Review notes on #187.
test("#187 notes: fromDocsRead decodes &amp;#39; and keeps link urls when stripping tags", async () => {
  const { fromDocsRead } = await import("./queue-page-sync.mjs");
  const doc = "&lt;listItem id='.1'&gt;&lt;paragraph&gt;&lt;text&gt; **PF-5** you&amp;#39;re &lt;link href='https://a.example/x'&gt;one&lt;/link&gt; and &lt;link href='https://a.example/y'&gt;two&lt;/link&gt;&lt;/text&gt;&lt;/paragraph&gt;&lt;/listItem&gt;";
  const out = fromDocsRead(doc);
  assert.ok(out.includes("you're"), out);
  assert.ok(out.includes("https://a.example/x") && out.includes("https://a.example/y"), out);
});
