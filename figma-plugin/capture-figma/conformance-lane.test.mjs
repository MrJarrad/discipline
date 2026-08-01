// Tests for the design<->code drift lane in the plugin UI (operator scope
// addition 2026-08-01): the listener already runs conformance + binding
// checks per capture, but the operator only ever saw Figma-hygiene warnings.
// The two lanes must read as distinct, and "not configured" must never render
// as "clean".
//
// The lane's copy is a pure function inside ui.html's script, extracted by
// its markers — same technique as warning-guide.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readUi() {
  return readFileSync(join(import.meta.dirname, "ui.html"), "utf8");
}

function load() {
  const match = /=== CONFORMANCE LANE[\s\S]*?===\n([\s\S]*?)\n {4}\/\/ === END CONFORMANCE LANE ===/.exec(readUi());
  if (!match) throw new Error("CONFORMANCE LANE markers not found in ui.html");
  return new Function(`${match[1]}\nreturn { formatDriftLane };`)();
}

const { formatDriftLane } = load();

test("drift lane: an unconfigured check says so instead of reporting zero defects", () => {
  const text = formatDriftLane({ ran: false, skipped: true });
  assert.equal(/\b0\b/.test(text), false, "must not imply a clean result");
  assert.match(text, /not configured/i);
});

test("drift lane: a clean run says both lanes match, in words", () => {
  const text = formatDriftLane({ ran: true, skipped: false, value: { defects: 0, samples: [] }, binding: { defects: 0, samples: [] } });
  assert.match(text, /match the code/i);
});

test("drift lane: defects are attributed to their lane, without repeating the headline total", () => {
  const text = formatDriftLane({
    ran: true,
    skipped: false,
    value: { defects: 3, samples: [] },
    binding: { defects: 2, samples: [] },
  });
  assert.match(text, /3 token value/);
  assert.match(text, /2 component binding/);
  assert.equal(/\b5\b/.test(text), false, "the section heading already shows the total");
});

test("drift lane: an unchanged sync says it wasn't re-checked, not that it's clean", () => {
  const text = formatDriftLane({ ran: false, skipped: false, unchanged: true });
  assert.match(text, /not re-checked|unchanged/i);
});

test("drift lane: a failed check surfaces its error", () => {
  const text = formatDriftLane({ ran: false, skipped: false, error: "mapping file not found: /x.json" });
  assert.match(text, /mapping file not found/);
});

test("drift lane: a missing conformance field (an older listener) degrades honestly", () => {
  const text = formatDriftLane(undefined);
  assert.ok(text.length > 0);
  assert.equal(/\b0 defects\b/.test(text), false);
});

test("drift UI: hygiene and drift are shown as two named lanes, with defects expandable", () => {
  const ui = readUi();
  assert.match(ui, /id="drift-row"/);
  assert.match(ui, /Figma hygiene/i);
  assert.match(ui, /Design.code drift/i);
  assert.match(ui, /function renderDrift\(/);
  assert.match(ui, /codeLocation/);
});

test("drift UI: the sync-post-result relays the listener's conformance summary back to code.js", () => {
  const ui = readUi();
  const handler = /res\s*\n?\s*\.json\(\)\s*\n?\s*\.then\(\(body\) => \{([\s\S]*?)\}\)/.exec(ui);
  assert.ok(handler, "sync-post-result json handler not found");
  assert.match(handler[1], /conformance/);
});

test("drift UI: the drift row stays hidden until a sync reports on it (.row's display:flex must not override [hidden])", () => {
  // Regression: `hidden` is a UA-stylesheet rule, so the author-level
  // `.row { display: flex }` beat it and the empty drift section showed on
  // an idle panel.
  const css = /<style>([\s\S]*)<\/style>/.exec(readUi())[1];
  assert.match(css, /\.row\[hidden\]\s*\{[^}]*display:\s*none/);
});
