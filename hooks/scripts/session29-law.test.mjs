// 1.143.0: DISC-184 + 2026-10-17-keep-design-handoff + 2026-10-17-measure-motion-on-the-deployed-page-honestly
// + 2026-10-17-cloud-subagents-figma-and-link-first. Run: node --test hooks/scripts/session29-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("keep design handoff: the pair stays the contract, the MCP does not replace it", () => {
  assert.match(flat("skills/handoff-to-code/SKILL.md"), /The Figma MCP does not replace the pair: it cannot return per-mode code-named tokens, generated CSS, the changelog or the pair hashes \(`2026-10-17-keep-design-handoff`\)/);
  assert.match(flat("skills/capture-figma/SKILL.md"), /The export pair stays the contract \(`handoff-to-code`\)/);
});
test("DISC-184: no-export lanes for annotations, interactions and props, losses named", () => {
  const s = flat("skills/capture-figma/SKILL.md");
  assert.match(s, /\*\*No export:\*\* read annotations, prototype interactions and component props live \(MCP \+ REST\) and name what the lane cannot return/);
  const l = flat("skills/capture-figma/references/LANES-AND-TOOLS.md");
  assert.match(l, /## No-export lanes/);
  assert.match(l, /\| Annotations \| REST node `annotations\[\]\.label`.*`category` \(Interaction \/ Development\) and `labelMarkdown`/);
  assert.match(l, /\| Prototype interactions \| REST node `interactions`.*`get_motion_context`/);
  assert.match(l, /\| Component props \| REST `componentPropertyDefinitions`.*`componentProperties`.*never `get_context_for_code_connect`/);
  assert.match(l, /Export-only, not readable live: `codeSyntax` per mode, `cssClass`, pair hashes, changelog/);
});
test("DISC-184: an export exists -> live annotations spot-checked against annotations[]", () => {
  assert.match(flat("skills/capture-figma/SKILL.md"), /\*\*Export exists:\*\* spot-check live annotations against its `annotations\[\]`; a mismatch is a finding before the build/);
  assert.match(flat("skills/capture-figma/references/LANES-AND-TOOLS.md"), /compare each live `annotations\[\]\.label` with the export layer's `annotations\[\]\.label`.*reported before the build as an export-drift finding/);
  assert.match(flat("skills/handoff-to-code/SKILL.md"), /and the live-annotation spot check/);
});
test("cloud subagents: no Figma MCP, REST is the cloud route, parent holds the MCP", () => {
  assert.match(flat("skills/capture-figma/SKILL.md"), /cloud subagents get no Figma MCP, so \*\*REST is the cloud route\*\* \(`curl api\.figma\.com`, proxy-authenticated, no token\)/);
  assert.match(flat("skills/capture-figma/references/LANES-AND-TOOLS.md"), /Brief a Figma-reading subagent with this route; the parent alone holds the MCP and `use_figma` writes/);
  assert.match(flat("skills/routing/references/HARD-RULES.md"), /\*\*In a cloud session no subagent gets them\*\*: brief the REST route/);
});
test("use_figma annotation writes walk to the outermost instance", () => {
  assert.match(flat("skills/routing/references/HARD-RULES.md"), /lands on the nearest instance of the text you walk from \(`\.ActionButtonTitle`\): walk up to the outermost instance whose name has no `\.` prefix first/);
});
test("a headless deployed probe follows the yes, never holds the link", () => {
  assert.match(flat("doer-rules.md"), /\*\*scenario sweeps\*\*, \*\*headless deployed probes\*\*.*run \*\*after his yes\*\*/);
});
test("sound is judged by ear first", () => {
  assert.match(flat("skills/qa-acceptance/SKILL.md"), /Sound is judged by ear first.*The operator.s listen is the first gate; offer the original asset early/);
});
test("numbered rulings are checked for collisions before banking", () => {
  assert.match(flat("skills/vault-write/references/WRITING.md"), /A numbered ruling in a decisions log \(`G18`\) is grepped for its number in that file before banking; a used number takes the next free one/);
});
test("measure motion on the deployed page honestly: webapp-testing", () => {
  const w = flat("skills/webapp-testing/SKILL.md");
  assert.match(w, /install a fake clock \*\*before\*\* `goto`, and pause from the page's own time/);
  assert.match(w, /report the subject's travel \(x\/y range\) with every run/);
  assert.match(w, /count only what shows by the page's own visibility rule/);
  assert.match(w, /run the measure on a known-good build first: it must read the known answer before its number is trusted/);
  assert.match(flat("skills/webapp-testing/references/DOS-AND-DONTS.md"), /Don't install a fake clock mid-session/);
});
test("measure motion on the deployed page honestly: test-first fixtures", () => {
  const t = flat("skills/test-first/SKILL.md");
  assert.match(t, /Fixtures are page-shaped and valid at rest.*`0\.375s`.*the code parses both units; a layout fixture passes its own check at frame 0/);
  assert.match(flat("skills/test-first/references/DOS-AND-DONTS.md"), /`parseFloat` a CSS duration token/);
});
test("served preview is the proof: latest successful build for your sha, then a sha-only probe", () => {
  assert.match(flat("skills/present-for-review/references/PREVIEW-PROBE.md"), /out of order.*3–5 minutes.*\*\*your sha is the latest successful build for that branch\*\*, then for a string only your sha has/);
});
test("tests never write tracked files; generated output has a guard", () => {
  assert.match(flat("skills/test-first/SKILL.md"), /\*\*Tests never write tracked files\*\*.*goes to a temp dir, and `git status --porcelain` is clean after the suite\. Generated output carries a guard test that its critical declarations are present/);
});
test("read-back and final return are written into the progress file", () => {
  assert.match(flat("doer-rules.md"), /\*\*The read-back and the final return are written into it in full\*\*: the file is the record, the hand-back a copy/);
});
