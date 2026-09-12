// One home per law. Before 1.79.0 the same five laws were restated across up to
// eight files each — "NEVER call `Agent`" in doer-rules, three agent charters and
// four places in routing. A copied law drifts silently: the copy an agent happens
// to read wins, and nobody notices the two disagree. Each law below is DEFINED in
// exactly one shipped doc and pointed at everywhere else.
//
// Adding a sixth copy of any of these fails here. To move a law, change its `home`
// — do not relax the sweep.
// Run: node --test hooks/scripts/law-single-source.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

// Every agent-consumed doc the plugin ships — the law's blast radius. CHANGED.txt
// is the release log, not an agent-consumed doc, so it is not swept.
const shippedDocs = () => [
  ...readdirSync(join(repo, "agents")).filter((f) => f.endsWith(".md")).map((f) => `agents/${f}`),
  ...readdirSync(join(repo, "skills"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `skills/${d.name}/SKILL.md`)
    .filter((rel) => existsSync(join(repo, rel))),
  ...readdirSync(join(repo, "output-styles")).filter((f) => f.endsWith(".md")).map((f) => `output-styles/${f}`),
  "operator-rules.md",
  "doer-rules.md",
  "AGENTS.md",
  "README.md",
];

const LAWS = [
  {
    law: "the `Agent` prohibition on doers",
    home: "doer-rules.md",
    // Definition sentence, asserted verbatim at the home.
    definition: "Execute inline; your final message is the deliverable. **NEVER call `Agent`.**",
    // Any restatement anywhere else — the shape a sixth copy would take.
    elsewhere: /NEVER call\s+\*{0,2}`?Agent/i,
    pointer: "`doer-rules.md` § You are the doer",
    pointedFrom: ["agents/engineer.md", "agents/reviewer.md", "agents/ux-designer.md", "skills/routing/SKILL.md"],
  },
  {
    law: "the Open gaps wording",
    home: "doer-rules.md",
    definition: 'The `Open gaps` field is "none" or a list — never "nothing blocking."',
    elsewhere: /`Open gaps` field is "none" or a list/i,
    pointer: "see `doer-rules.md` § Fixed evidence return",
    pointedFrom: ["agents/engineer.md", "agents/reviewer.md", "agents/ux-designer.md"],
  },
  {
    law: "operator-facing status vocabulary",
    home: "output-styles/discipline.md",
    definition: "**Status is done or not done.**",
    elsewhere: /\*\*Status is done or not done\.\*\*/,
    pointer: "`output-styles/discipline.md` § Status is done or not done",
    pointedFrom: ["doer-rules.md"],
  },
  {
    law: "the doer port range",
    home: "doer-rules.md",
    definition: "Doers run verification servers on `:3220` and up.",
    elsewhere: /verification servers on `?:3220`? and up|:3220\+ doer servers/i,
    pointer: "`doer-rules.md` § Ports",
    pointedFrom: ["skills/routing/SKILL.md", "skills/webapp-testing/SKILL.md"],
  },
  {
    law: "the review round cap",
    home: "agents/reviewer.md",
    definition: "**Hard cap: 3 review rounds per change.**",
    elsewhere: /hard cap: \d+ review rounds|there is no round 4/i,
    pointer: "`agents/reviewer.md` § Round cap",
    pointedFrom: ["agents/engineer.md", "output-styles/discipline.md", "skills/routing/SKILL.md", "skills/wrap/SKILL.md"],
  },
];

for (const { law, home, definition, elsewhere, pointer, pointedFrom } of LAWS) {
  test(`${law} is defined verbatim at its one home (${home})`, () => {
    assert.ok(
      flat(read(home)).includes(flat(definition)),
      `${home} no longer carries the definition verbatim: ${definition}`,
    );
  });

  test(`${law} is restated nowhere but ${home}`, () => {
    const copies = shippedDocs()
      .filter((rel) => rel !== home)
      .filter((rel) => elsewhere.test(flat(read(rel))));
    assert.deepEqual(copies, [], `${law} is duplicated in: ${copies.join(", ")} — point at ${home} instead`);
  });

  test(`${law} is pointed at from every site that used to restate it`, () => {
    const missing = pointedFrom.filter((rel) => !flat(read(rel)).includes(flat(pointer)));
    assert.deepEqual(missing, [], `missing the pointer "${pointer}": ${missing.join(", ")}`);
  });
}
