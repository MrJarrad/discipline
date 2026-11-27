import test from "node:test";
import assert from "node:assert/strict";
import { checkResolveResult } from "./agent-dispatch-gate.mjs";

const blocks = [
  "Add Figma variables for spacing.",
  "Rename color/a to color/b in Figma.",
  "Add variables to the design file.",
  "Rename the Figma variables via use_figma.",
];
const passes = [
  "Create the Figma variables export script.",
  "Add a script that lists Figma variables.",
  "Create tokens, never add Figma variables.",
  "Do not add Figma variables.",
  "Read the file. Never rename Figma variables.",
  "Fetch the spec and don't create Figma variables here.",
  "Add the token to tokens.css.",
];
for (const s of blocks) test(`blocks: ${s}`, () => assert.equal(checkResolveResult(s)?.item, "resolve-result"));
for (const s of passes) test(`passes: ${s}`, () => assert.equal(checkResolveResult(s), null));
test("resolve result section clears the block", () =>
  assert.equal(checkResolveResult("Add Figma variables.\n\n## Resolve result\nreport.json open: 0\n"), null));
