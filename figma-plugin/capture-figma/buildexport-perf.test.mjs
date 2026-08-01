// Tests for buildExport()'s per-phase instrumentation and the two
// optimizations that could be PROVEN output-identical (operator verdict
// 2026-08-01, Addendum 2 item 1: sync lag — measure, then cut only what's
// demonstrably redundant).
//
// Both optimizations are tested DIFFERENTIALLY: the pre-optimization
// algorithm is reimplemented here verbatim from the git history, run against
// the same fixture as the shipped one, and the two outputs compared as JSON
// bytes. An optimization that can't pass this doesn't ship.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readCode() {
  return readFileSync(join(import.meta.dirname, "code.js"), "utf8");
}

function extract(marker, returns) {
  const re = new RegExp(`=== ${marker}[\\s\\S]*?===\\n([\\s\\S]*?)\\n\\/\\/ === END ${marker} ===`);
  const match = re.exec(readCode());
  if (!match) throw new Error(`${marker} markers not found in code.js`);
  return new Function(`${match[1]}\nreturn ${returns};`)();
}

const { findAllComponentNodes } = extract("COMPONENT SCAN", "{ findAllComponentNodes }");
const { resolveValuesByMode } = extract("MODE VALUES", "{ resolveValuesByMode }");

// --- fixture: a document shaped like the real one (component pages with
// sets, loose components, nested variant members, plus an excluded Example
// page) -------------------------------------------------------------------

function node(type, name, children) {
  const n = { type, name, children: children || [] };
  for (const child of n.children) child.parent = n;
  return n;
}

function page(name, children) {
  const p = node("PAGE", name, children);
  p.findAll = (predicate) => {
    const out = [];
    (function walk(parent) {
      for (const child of parent.children || []) {
        if (predicate(child)) out.push(child);
        walk(child);
      }
    })(p);
    return out;
  };
  return p;
}

function fixturePages() {
  return [
    page("Blocks", [
      node("COMPONENT_SET", "Button", [node("COMPONENT", "size=sm"), node("COMPONENT", "size=lg")]),
      node("COMPONENT", "Logo"),
      node("FRAME", "scratch", [node("COMPONENT", "Nested loose component"), node("COMPONENT_SET", "Chip", [node("COMPONENT", "tone=a")])]),
    ]),
    page("Example", [node("COMPONENT", "must be excluded"), node("COMPONENT_SET", "also excluded", [])]),
    page("Primitives", [node("COMPONENT", "Icon"), node("COMPONENT_SET", "Spacer", [node("COMPONENT", "size=8")])]),
  ];
}

// The shipped-before-this-change implementation: two independent full
// findAll passes over every non-Example page (code.js at 0ec5fd5,
// findAllComponentSets + findAllStandaloneComponents).
async function twoPassBaseline(pages) {
  const sets = [];
  for (const p of pages) {
    if (p.name === "Example") continue;
    sets.push.apply(sets, p.findAll(function (n) { return n.type === "COMPONENT_SET"; }));
  }
  const standalone = [];
  for (const p of pages) {
    if (p.name === "Example") continue;
    standalone.push.apply(
      standalone,
      p.findAll(function (n) { return n.type === "COMPONENT" && (!n.parent || n.parent.type !== "COMPONENT_SET"); })
    );
  }
  return { sets, standalone };
}

const names = (nodes) => nodes.map((n) => n.name);

test("component scan: one traversal returns exactly what the previous two traversals returned, in the same order", async () => {
  const before = await twoPassBaseline(fixturePages());
  const after = await findAllComponentNodes(fixturePages());
  assert.deepEqual(names(after.sets), names(before.sets));
  assert.deepEqual(names(after.standalone), names(before.standalone));
});

test("component scan: it really does traverse each page once, not twice", async () => {
  const pages = fixturePages();
  let traversals = 0;
  for (const p of pages) {
    const original = p.findAll;
    p.findAll = (predicate) => {
      traversals++;
      return original(predicate);
    };
  }
  await findAllComponentNodes(pages);
  assert.equal(traversals, 2, "one findAll per non-Example page (the Example page is skipped entirely)");
});

test("component scan: the Example page is still excluded from both buckets", async () => {
  const { sets, standalone } = await findAllComponentNodes(fixturePages());
  assert.equal(names(sets).some((n) => n.includes("excluded")), false);
  assert.equal(names(standalone).some((n) => n.includes("excluded")), false);
});

// --- per-mode value resolution -------------------------------------------

const MODES = [
  { modeId: "m1", name: "Light" },
  { modeId: "m2", name: "Dark" },
  { modeId: "m3", name: "Contrast" },
];

// A resolver that resolves out of call order — the only way a parallelized
// version could differ from a sequential one is by letting completion order
// leak into the output, so the fixture makes completion order the REVERSE of
// call order.
function outOfOrderResolver() {
  let call = 0;
  return (raw) => {
    const delay = 3 - call++;
    return new Promise((r) => setTimeout(() => r({ resolved: raw }), delay));
  };
}

// The shipped-before-this-change implementation: await one mode at a time.
async function sequentialBaseline(variable, modes, resolve) {
  const valuesByMode = {};
  for (const mode of modes) {
    const raw = variable.valuesByMode ? variable.valuesByMode[mode.modeId] : undefined;
    if (raw === undefined) {
      valuesByMode[mode.name] = null;
      continue;
    }
    valuesByMode[mode.name] = await resolve(raw);
  }
  return valuesByMode;
}

test("mode values: parallel resolution is byte-identical to the sequential version, key order included", async () => {
  const variable = { valuesByMode: { m1: "#fff", m2: "#000", m3: "#111" } };
  const before = await sequentialBaseline(variable, MODES, outOfOrderResolver());
  const after = await resolveValuesByMode(variable, MODES, outOfOrderResolver());
  assert.equal(JSON.stringify(after), JSON.stringify(before));
});

test("mode values: a mode with no value is still null, in its own position", async () => {
  const variable = { valuesByMode: { m1: "#fff", m3: "#111" } };
  const before = await sequentialBaseline(variable, MODES, outOfOrderResolver());
  const after = await resolveValuesByMode(variable, MODES, outOfOrderResolver());
  assert.equal(JSON.stringify(after), JSON.stringify(before));
  assert.equal(after.Dark, null);
});

test("mode values: a variable with no valuesByMode at all matches the sequential version", async () => {
  const before = await sequentialBaseline({}, MODES, outOfOrderResolver());
  const after = await resolveValuesByMode({}, MODES, outOfOrderResolver());
  assert.equal(JSON.stringify(after), JSON.stringify(before));
});

// --- instrumentation ------------------------------------------------------

test("timings: buildExport records every phase plus a total into header.timings", () => {
  const source = readCode();
  const fn = /async function buildExport\(\) \{([\s\S]*?)\n  return output;/.exec(source);
  assert.ok(fn, "buildExport not found");
  const body = fn[1];
  for (const phase of ["variables", "styles", "components", "templates", "capabilities", "lint"]) {
    assert.match(body, new RegExp(`phase\\("${phase}"`), `no timing mark for the ${phase} phase`);
  }
  assert.match(body, /timings: /);
  assert.match(body, /totalMs/);
});

test("timings: the synced status carries them to the UI so no DevTools trace is needed", () => {
  const source = readCode();
  assert.match(source, /timings: data\.header\.timings/);
  const ui = readFileSync(join(import.meta.dirname, "ui.html"), "utf8");
  assert.match(ui, /formatTimings/);
  assert.match(ui, /id="sync-timing"/);
});
