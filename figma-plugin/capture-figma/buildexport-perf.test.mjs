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

// --- component-set walk ---------------------------------------------------

const { walkComponentSets } = extract("COMPONENT SET WALK", "{ walkComponentSets }");

function emptyCollector() {
  return { nodeSnapshots: [], spacerInstances: [], latentCapabilities: [], variantBindings: new Map() };
}

// A walk that finishes in the REVERSE of the order it was called in — the only
// way a parallelized version could differ from a sequential one is by letting
// completion order leak into the collected output.
function outOfOrderWalk(setCount) {
  let call = 0;
  return (set, out) => {
    const delay = (setCount - call++) * 2;
    return new Promise((resolve) => {
      setTimeout(() => {
        out.nodeSnapshots.push({ id: set.name + ":root" }, { id: set.name + ":child" });
        out.spacerInstances.push({ id: set.name + ":spacer" });
        out.latentCapabilities.push({ node: set.name });
        out.variantBindings.set(set.name + ":v1", [{ layer: "l", property: "fill", value: set.name }]);
        resolve();
      }, delay);
    });
  };
}

// The shipped-before-this-change implementation: one set at a time, every walk
// appending straight into the shared collector (code.js at 4b5ce19).
async function sequentialWalkBaseline(sets, out, walk) {
  for (const set of sets) await walk(set, out);
}

const SETS = [{ name: "Button" }, { name: "Card" }, { name: "Chip" }, { name: "Spacer" }];

function collectorAsJson(out) {
  return JSON.stringify({
    nodeSnapshots: out.nodeSnapshots,
    spacerInstances: out.spacerInstances,
    latentCapabilities: out.latentCapabilities,
    variantBindings: [...out.variantBindings.entries()],
  });
}

test("component-set walk: parallel walks collect byte-identically to the sequential version, entry order included", async () => {
  const before = emptyCollector();
  await sequentialWalkBaseline(SETS, before, outOfOrderWalk(SETS.length));
  const after = emptyCollector();
  await walkComponentSets(SETS, after, outOfOrderWalk(SETS.length));
  assert.equal(collectorAsJson(after), collectorAsJson(before));
});

test("component-set walk: the walks really do overlap rather than queue", async () => {
  let inFlight = 0;
  let peak = 0;
  const walk = () =>
    new Promise((resolve) => {
      peak = Math.max(peak, ++inFlight);
      setTimeout(() => {
        inFlight--;
        resolve();
      }, 5);
    });
  await walkComponentSets(SETS, emptyCollector(), walk);
  assert.equal(peak, SETS.length, "every set's walk should be in flight at once");
});

test("component-set walk: no sets is not an error and collects nothing", async () => {
  const out = emptyCollector();
  await walkComponentSets([], out, outOfOrderWalk(0));
  assert.equal(collectorAsJson(out), collectorAsJson(emptyCollector()));
});

// --- style lookup cache ---------------------------------------------------

const { createStyleCache } = extract("STYLE CACHE", "{ createStyleCache }");

// A style API shaped like Figma's: every lookup is a real async round trip,
// and it answers out of call order (later calls can land first).
function fakeStyleApi() {
  const calls = [];
  const fetch = (id) => {
    calls.push(id);
    const delay = id === "S:slow" ? 8 : 1;
    return new Promise((resolve) => setTimeout(() => resolve({ id, name: "style/" + id }), delay));
  };
  return { fetch, calls };
}

// The shipped-before-this-change implementation: no cache, one round trip per
// lookup (code.js at 1884562, getStyleById).
const uncachedBaseline = (fetch) => (id) => fetch(id);

const LOOKUPS = ["S:a", "S:slow", "S:a", "S:b", "S:slow", "S:a"];

test("style cache: cached lookups return exactly what the uncached ones returned, in the same order", async () => {
  const plain = fakeStyleApi();
  const before = await Promise.all(LOOKUPS.map(uncachedBaseline(plain.fetch)));
  const cached = fakeStyleApi();
  const after = await Promise.all(LOOKUPS.map(createStyleCache(cached.fetch)));
  assert.equal(JSON.stringify(after), JSON.stringify(before));
});

test("style cache: a repeated style id costs one round trip, not one per layer", async () => {
  const plain = fakeStyleApi();
  await Promise.all(LOOKUPS.map(uncachedBaseline(plain.fetch)));
  assert.equal(plain.calls.length, 6);

  const cached = fakeStyleApi();
  await Promise.all(LOOKUPS.map(createStyleCache(cached.fetch)));
  assert.deepEqual(cached.calls, ["S:a", "S:slow", "S:b"], "in-flight duplicates must be shared, not re-issued");
});

test("style cache: a sequential repeat also reuses the resolved entry", async () => {
  const cached = fakeStyleApi();
  const getStyle = createStyleCache(cached.fetch);
  const first = await getStyle("S:a");
  const second = await getStyle("S:a");
  assert.equal(JSON.stringify(second), JSON.stringify(first));
  assert.deepEqual(cached.calls, ["S:a"]);
});

test("style cache: it is rebuilt per export, so a style renamed between syncs isn't served stale", () => {
  const body = /async function buildExport\(\) \{([\s\S]*?)\n  return output;/.exec(readCode())[1];
  assert.match(body, /getStyleById = createStyleCache\(fetchStyleById\)/);
});

test("style cache: a missing style stays null and isn't re-fetched", async () => {
  let calls = 0;
  const getStyle = createStyleCache(() => {
    calls++;
    return Promise.resolve(null);
  });
  assert.equal(await getStyle("S:gone"), null);
  assert.equal(await getStyle("S:gone"), null);
  assert.equal(calls, 1);
});

// --- instrumentation ------------------------------------------------------

test("timings: buildExport records every phase plus a total into header.timings", () => {
  const source = readCode();
  const fn = /async function buildExport\(\) \{([\s\S]*?)\n  return output;/.exec(source);
  assert.ok(fn, "buildExport not found");
  const body = fn[1];
  for (const phase of ["variables", "styles", "capabilities", "lint"]) {
    assert.match(body, new RegExp(`phase\\("${phase}"`), `no timing mark for the ${phase} phase`);
  }
  // components and templates are roll-ups over their sub-phases (see below).
  for (const phase of ["components", "templates"]) {
    assert.match(body, new RegExp(`timings\\.${phase} = `), `no timing for the ${phase} phase`);
  }
  assert.match(body, /timings: /);
  assert.match(body, /totalMs/);
});

// Sub-phase attribution (operator verdict 2026-08-01, Addendum 6: components
// 10.5s of a 15.3s export — but "components" is three different things in a
// trench coat). The next real sync must say WHICH of them, even if the
// optimizations below only get part of it.
test("timings: the two heavy phases are broken down into their sub-phases", () => {
  const source = readCode();
  const fn = /async function buildExport\(\) \{([\s\S]*?)\n  return output;/.exec(source);
  assert.ok(fn, "buildExport not found");
  const body = fn[1];
  for (const phase of ["componentsScan", "componentsWalk", "templatesExample", "templatesTransform"]) {
    assert.match(body, new RegExp(`phase\\("${phase}"`), `no timing mark for the ${phase} sub-phase`);
  }
  // The rolled-up phase names stay, so the operator's existing reading of the
  // line ("components 10.5s") still means the same thing.
  for (const phase of ["components", "templates"]) {
    assert.match(body, new RegExp(`timings\\.${phase} = `), `${phase} is no longer reported as a roll-up`);
  }
});

test("timings: the synced status carries them to the UI so no DevTools trace is needed", () => {
  const source = readCode();
  assert.match(source, /timings: data\.header\.timings/);
  const ui = readFileSync(join(import.meta.dirname, "ui.html"), "utf8");
  assert.match(ui, /formatTimings/);
  assert.match(ui, /id="sync-timing"/);
});
