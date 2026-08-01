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

const { collectInParallel } = extract("PARALLEL COLLECT", "{ collectInParallel }");

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

test("parallel collect: parallel walks collect byte-identically to the sequential version, entry order included", async () => {
  const before = emptyCollector();
  await sequentialWalkBaseline(SETS, before, outOfOrderWalk(SETS.length));
  const after = emptyCollector();
  await collectInParallel(SETS, after, outOfOrderWalk(SETS.length));
  assert.equal(collectorAsJson(after), collectorAsJson(before));
});

test("parallel collect: the walks really do overlap rather than queue", async () => {
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
  await collectInParallel(SETS, emptyCollector(), walk);
  assert.equal(peak, SETS.length, "every set's walk should be in flight at once");
});

test("parallel collect: each walk's own return value comes back in item order", async () => {
  let call = 0;
  const walk = (item) => {
    const delay = (SETS.length - call++) * 2;
    return new Promise((resolve) => setTimeout(() => resolve({ frame: item.name }), delay));
  };
  const results = await collectInParallel(SETS, emptyCollector(), walk);
  assert.deepEqual(results.map((r) => r.frame), SETS.map((s) => s.name));
});

test("parallel collect: no sets is not an error and collects nothing", async () => {
  const out = emptyCollector();
  await collectInParallel([], out, outOfOrderWalk(0));
  assert.equal(collectorAsJson(out), collectorAsJson(emptyCollector()));
});

// --- template instance overrides ------------------------------------------

const { resolveOverrideNodes } = extract("TEMPLATE OVERRIDES", "{ resolveOverrideNodes }");

// A node lookup that answers in the REVERSE of call order.
function outOfOrderNodeLookup(count) {
  let call = 0;
  return (id) => {
    const delay = (count - call++) * 2;
    return new Promise((resolve) => setTimeout(() => resolve(id === "gone" ? null : { id }), delay));
  };
}

// The shipped-before-this-change implementation: one getNodeById at a time
// inside the override loop (code.js at ab40efa).
async function sequentialOverrideNodes(inst, getNode) {
  const nodes = [];
  for (const ov of inst.overrides || []) {
    nodes.push(ov.id === inst.id ? inst : await getNode(ov.id));
  }
  return nodes;
}

const INSTANCE = {
  id: "I:1",
  overrides: [{ id: "n1" }, { id: "I:1" }, { id: "gone" }, { id: "n2" }],
};

const nodeIds = (nodes) => nodes.map((n) => (n ? n.id : null));

test("template overrides: parallel node resolution lands in override order, not completion order", async () => {
  const before = await sequentialOverrideNodes(INSTANCE, outOfOrderNodeLookup(4));
  const after = await resolveOverrideNodes(INSTANCE, outOfOrderNodeLookup(4));
  assert.deepEqual(nodeIds(after), nodeIds(before));
  assert.deepEqual(nodeIds(after), ["n1", "I:1", null, "n2"]);
});

test("template overrides: the instance's own id is never looked up", async () => {
  const asked = [];
  await resolveOverrideNodes(INSTANCE, (id) => {
    asked.push(id);
    return Promise.resolve({ id });
  });
  assert.deepEqual(asked, ["n1", "gone", "n2"]);
});

test("template overrides: an instance with no overrides resolves to nothing", async () => {
  assert.deepEqual(await resolveOverrideNodes({ id: "I:2" }, outOfOrderNodeLookup(0)), []);
});

// --- style lookup cache ---------------------------------------------------

const { createIdCache } = extract("ID CACHE", "{ createIdCache }");

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
  const after = await Promise.all(LOOKUPS.map(createIdCache(cached.fetch)));
  assert.equal(JSON.stringify(after), JSON.stringify(before));
});

test("style cache: a repeated style id costs one round trip, not one per layer", async () => {
  const plain = fakeStyleApi();
  await Promise.all(LOOKUPS.map(uncachedBaseline(plain.fetch)));
  assert.equal(plain.calls.length, 6);

  const cached = fakeStyleApi();
  await Promise.all(LOOKUPS.map(createIdCache(cached.fetch)));
  assert.deepEqual(cached.calls, ["S:a", "S:slow", "S:b"], "in-flight duplicates must be shared, not re-issued");
});

test("style cache: a sequential repeat also reuses the resolved entry", async () => {
  const cached = fakeStyleApi();
  const getStyle = createIdCache(cached.fetch);
  const first = await getStyle("S:a");
  const second = await getStyle("S:a");
  assert.equal(JSON.stringify(second), JSON.stringify(first));
  assert.deepEqual(cached.calls, ["S:a"]);
});

test("style cache: it is rebuilt per export, so a style renamed between syncs isn't served stale", () => {
  const body = /async function buildExport\(\) \{([\s\S]*?)\n  return output;/.exec(readCode())[1];
  assert.match(body, /getStyleById = createIdCache\(fetchStyleById\)/);
});

// Variables get the same treatment as styles, and for a reason the walk only
// just created: variableById is prewarmed with every LOCAL variable, so a
// miss means a library variable — and now that the whole tree is walked at
// once, every layer bound to that library variable misses simultaneously and
// used to issue its own getVariableByIdAsync. Without this the parallel walk
// would trade round trips it saved for round trips it re-created.
test("id cache: buildExport rebuilds the variable cache per export, exactly as it does the style cache", () => {
  const body = /async function buildExport\(\) \{([\s\S]*?)\n  return output;/.exec(readCode())[1];
  assert.match(body, /getVariableByIdCached = createIdCache\(getVariableById\)/);
  const source = readCode();
  assert.match(source, /let getVariableByIdCached = createIdCache\(getVariableById\)/);
  assert.equal(
    /await getVariableById\(/.test(source),
    false,
    "every alias-resolution path must go through the cache, not the raw plugin call"
  );
});

test("style cache: a missing style stays null and isn't re-fetched", async () => {
  let calls = 0;
  const getStyle = createIdCache(() => {
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

// --- subtree walk: sibling parallelization --------------------------------
//
// Round 2's headline lever (componentsWalk = 7.5s of an 11.6s export). The
// hazard is the binding chain: siblings share one bindings array and one
// `seen` set, with first-occurrence-wins dedupe IN DOCUMENT ORDER. Anything
// that lets completion order reach that dedupe silently reorders — or drops
// the wrong one of — a variant's bindings. So the walk is proven here against
// a verbatim copy of the sequential implementation it replaces, on a fixture
// whose every async dependency completes in the REVERSE of call order.

const { createSubtreeWalk } = extract("SUBTREE WALK", "{ createSubtreeWalk }");

function walkNode(spec) {
  const n = Object.assign({ children: [] }, spec);
  for (const child of n.children) child.parent = n;
  return n;
}

function testNodeNamePath(node, root) {
  if (node === root) return node.name;
  const names = [];
  let cur = node;
  while (cur && cur !== root) {
    names.unshift(cur.name);
    cur = cur.parent;
  }
  return names.join("/");
}

function testNextRecordState(node, nodeWasRecorded) {
  if (node.type === "COMPONENT" || node.type === "FRAME") return true;
  return !!nodeWasRecorded && typeof node.name === "string" && node.name.startsWith(".");
}

// Every async dependency answers later the EARLIER it was called, so a walk
// that let completion order leak would produce visibly different output.
function reverseCompletionApi() {
  let call = 0;
  const later = (value) => new Promise((r) => setTimeout(() => r(value), Math.max(0, 30 - call++)));
  return {
    getInstanceMainComponent: (inst) => later(inst.main || null),
    resolveComponentSetName: (c) => (c && c.setName) || null,
    isSpacerSetName: (name) => name === "SpaceVertical",
    nodeNamePath: testNodeNamePath,
    nextRecordState: testNextRecordState,
    resolveCapabilityBinding: (paint) => later(paint.binding || null),
    collectNodeLatentCapabilities: (node, resolvedPaints) =>
      resolvedPaints.filter((p) => p.paint.hidden).map((p) => ({ node: node.name, binding: p.binding })),
    collectLayerBindingEntries: async (node, layer, variableById, bindingsOut, seen) => {
      for (const pair of node.binds || []) {
        await later(null);
        const key = pair[0] + "\u0000" + pair[1];
        if (seen.has(key)) continue;
        seen.add(key);
        bindingsOut.push({ layer: layer, property: pair[0], value: pair[1] });
      }
    },
  };
}

// The shipped-before-this-change implementation, verbatim from code.js at
// c0ce06c: one sibling at a time, every visit mutating the shared collector
// and the shared bindings/seen context as it goes.
function createSequentialSubtreeWalkBaseline(api) {
  return async function walkV2Subtree(root, variableById, out, collectBindings) {
    async function visit(node, parent, recordHere, bindingCtx) {
      const instanceMainComponent = node.type === "INSTANCE" ? await api.getInstanceMainComponent(node) : null;
      const instanceComponentSetId =
        instanceMainComponent && instanceMainComponent.parent && instanceMainComponent.parent.type === "COMPONENT_SET"
          ? instanceMainComponent.parent.id
          : null;

      if (recordHere) {
        out.nodeSnapshots.push({
          id: node.id,
          name: node.name,
          type: node.type,
          mainComponentId: instanceMainComponent ? instanceMainComponent.id : null,
          componentSetId: instanceComponentSetId,
          parentId: parent ? parent.id : null,
          parentPath: parent ? api.nodeNamePath(parent, root) : null,
        });
      }

      if (node.type === "INSTANCE") {
        const mainComponent = instanceMainComponent;
        const mainComponentSetName = api.resolveComponentSetName(mainComponent);
        if (mainComponentSetName && api.isSpacerSetName(mainComponentSetName)) {
          out.spacerInstances.push({ id: node.id, name: node.name, path: api.nodeNamePath(node, root) });
        }
        if (bindingCtx) {
          const boundName = mainComponent ? api.resolveComponentSetName(mainComponent) || mainComponent.name : null;
          if (boundName) {
            const key = "instance\u0000" + boundName;
            if (!bindingCtx.seen.has(key)) {
              bindingCtx.seen.add(key);
              bindingCtx.bindings.push({ layer: bindingCtx.layer, property: "instance", value: boundName });
            }
          }
        }
      }

      if (Array.isArray(node.fills) || Array.isArray(node.strokes)) {
        const resolvedPaints = [];
        for (const paint of node.fills || []) {
          resolvedPaints.push({ paint: paint, binding: await api.resolveCapabilityBinding(paint, variableById) });
        }
        for (const paint of node.strokes || []) {
          resolvedPaints.push({ paint: paint, binding: await api.resolveCapabilityBinding(paint, variableById) });
        }
        out.latentCapabilities.push.apply(
          out.latentCapabilities,
          api.collectNodeLatentCapabilities(node, resolvedPaints)
        );
      }

      if (bindingCtx && node.type !== "INSTANCE" && bindingCtx.layer !== "") {
        await api.collectLayerBindingEntries(node, bindingCtx.layer, variableById, bindingCtx.bindings, bindingCtx.seen);
      }

      if (Array.isArray(node.children)) {
        const childRecordHere = api.nextRecordState(node, recordHere);
        for (const child of node.children) {
          let childBindingCtx = null;
          if (collectBindings && node === root && child.type === "COMPONENT") {
            const arr = [];
            out.variantBindings.set(child.id, arr);
            childBindingCtx = { layer: "", bindings: arr, seen: new Set() };
          } else if (bindingCtx && node.type !== "INSTANCE") {
            childBindingCtx = {
              layer: bindingCtx.layer ? bindingCtx.layer + "/" + child.name : child.name,
              bindings: bindingCtx.bindings,
              seen: bindingCtx.seen,
            };
          }
          await visit(child, node, childRecordHere, childBindingCtx);
        }
      }
    }
    await visit(root, null, false, null);
  };
}

// A component set shaped like a real one: two variants, each with sibling
// layers that collide on (property, value) so the first-in-document-order
// entry must win with ITS layer; a nested instance (binding chain stops at
// it); a spacer instance; hidden bound paints; a dot-prefixed sub-component
// (the extra recorded level).
function variantSetFixture() {
  const spacerMain = { id: "C:spacer", name: "SpaceVertical", setName: "SpaceVertical" };
  const iconMain = {
    id: "C:icon",
    name: "Icon/base",
    setName: "Icon",
    parent: { type: "COMPONENT_SET", id: "CS:icon" },
  };
  return walkNode({
    id: "CS:1",
    name: "Button",
    type: "COMPONENT_SET",
    children: [
      walkNode({
        id: "C:sm",
        name: "size=sm",
        type: "COMPONENT",
        binds: [["fill", "brand/primary"]],
        children: [
          walkNode({
            id: "N:label",
            name: "label",
            type: "TEXT",
            binds: [
              ["textStyle", "type/body"],
              ["fill", "brand/ink"],
            ],
            fills: [{ hidden: true, binding: "brand/ink" }],
          }),
          walkNode({
            id: "N:label2",
            name: "shadowLabel",
            type: "TEXT",
            // collides with N:label on both entries — must lose both, so the
            // recorded layer stays "label", never "shadowLabel".
            binds: [
              ["textStyle", "type/body"],
              ["fill", "brand/ink"],
            ],
          }),
          walkNode({
            id: "N:icon",
            name: "icon",
            type: "INSTANCE",
            main: iconMain,
            fills: [{ hidden: false, binding: null }],
            strokes: [{ hidden: true, binding: "brand/line" }],
            children: [
              walkNode({ id: "N:inner", name: "inner", type: "VECTOR", binds: [["fill", "never/collected"]] }),
            ],
          }),
          walkNode({ id: "N:gap", name: "gap", type: "INSTANCE", main: spacerMain }),
          walkNode({
            id: "N:priv",
            name: ".private",
            type: "FRAME",
            binds: [["fill", "brand/primary"]],
            children: [walkNode({ id: "N:deep", name: "deep", type: "RECTANGLE", binds: [["fill", "brand/deep"]] })],
          }),
        ],
      }),
      walkNode({
        id: "C:lg",
        name: "size=lg",
        type: "COMPONENT",
        children: [
          // same keys as the other variant's — proves the chains are per
          // variant, not shared.
          walkNode({ id: "N:label3", name: "label", type: "TEXT", binds: [["textStyle", "type/body"]] }),
          walkNode({ id: "N:icon2", name: "icon", type: "INSTANCE", main: iconMain }),
        ],
      }),
    ],
  });
}

function walkCollector() {
  return { nodeSnapshots: [], spacerInstances: [], latentCapabilities: [], variantBindings: new Map() };
}

async function runBothWalks(rootFactory, collectBindings) {
  const baseline = walkCollector();
  await createSequentialSubtreeWalkBaseline(reverseCompletionApi())(rootFactory(), new Map(), baseline, collectBindings);
  const shipped = walkCollector();
  await createSubtreeWalk(reverseCompletionApi())(rootFactory(), new Map(), shipped, collectBindings);
  return { baseline, shipped };
}

test("subtree walk: parallel siblings collect byte-identically to the sequential walk, bindings order included", async () => {
  const { baseline, shipped } = await runBothWalks(variantSetFixture, true);
  assert.equal(collectorAsJson(shipped), collectorAsJson(baseline));
});

test("subtree walk: first-occurrence-wins dedupe still resolves in DOCUMENT order, not completion order", async () => {
  const { baseline, shipped } = await runBothWalks(variantSetFixture, true);
  const smBindings = shipped.variantBindings.get("C:sm");
  assert.deepEqual(smBindings, baseline.variantBindings.get("C:sm"));
  // the colliding sibling ("shadowLabel") must contribute nothing: the
  // earlier-in-document "label" owns both keys.
  assert.equal(smBindings.some((b) => b.layer === "shadowLabel"), false);
  assert.deepEqual(
    smBindings.filter((b) => b.property === "textStyle"),
    [{ layer: "label", property: "textStyle", value: "type/body" }]
  );
});

test("subtree walk: the binding chain still stops at an INSTANCE boundary", async () => {
  const { shipped } = await runBothWalks(variantSetFixture, true);
  const all = [...shipped.variantBindings.values()].flat();
  assert.equal(all.some((b) => b.value === "never/collected"), false);
  assert.deepEqual(
    all.filter((b) => b.property === "instance").map((b) => b.layer + "=" + b.value),
    ["icon=Icon", "gap=SpaceVertical", "icon=Icon"]
  );
});

test("subtree walk: siblings really do overlap rather than queue", async () => {
  let inFlight = 0;
  let peak = 0;
  const api = Object.assign(reverseCompletionApi(), {
    getInstanceMainComponent: (inst) =>
      new Promise((resolve) => {
        peak = Math.max(peak, ++inFlight);
        setTimeout(() => {
          inFlight--;
          resolve(inst.main || null);
        }, 8);
      }),
  });
  const root = walkNode({
    id: "F:1",
    name: "frame",
    type: "FRAME",
    children: [1, 2, 3, 4, 5].map((i) =>
      walkNode({ id: "N:" + i, name: "i" + i, type: "INSTANCE", main: { id: "C:x", name: "X" } })
    ),
  });
  await createSubtreeWalk(api)(root, new Map(), walkCollector(), false);
  assert.equal(peak, 5, "every sibling's visit should be in flight at once");
});

test("subtree walk: a walk with no binding collection matches the sequential version too", async () => {
  const { baseline, shipped } = await runBothWalks(variantSetFixture, false);
  assert.equal(collectorAsJson(shipped), collectorAsJson(baseline));
  assert.equal(shipped.variantBindings.size, 0);
});

// --- example-page section walk --------------------------------------------
//
// templatesExample was 3.1s of the 11.6s v1.23.0 export. Round 1 parallelized
// the frames INSIDE a section and the instances inside a frame, but the
// SECTIONS themselves were still walked one at a time — a top-level section's
// entire frame set had to finish before the next section's began, and a
// nested section waited on its parent's frames. Nothing in a section depends
// on another section, so the whole section tree now goes out at once and the
// results are folded in DFS order afterwards.
//
// Proven against a verbatim copy of the sequential walk, with a frame
// processor that completes in the REVERSE of call order.

const { collectInParallel: collectForSections, newWarningsCollector, mergeWarningsCollector } = extract(
  "PARALLEL COLLECT",
  "{ collectInParallel, newWarningsCollector, mergeWarningsCollector }"
);
const { createExampleSectionWalk } = extract("EXAMPLE SECTIONS", "{ createExampleSectionWalk }");

function exampleNode(type, name, children) {
  return { id: type[0] + ":" + name, name: name, type: type, children: children || [] };
}

function examplePageFixture() {
  return exampleNode("PAGE", "Example", [
    exampleNode("SECTION", "Marketing", [
      exampleNode("FRAME", "D - Home"),
      exampleNode("SECTION", "Marketing/Nested", [
        exampleNode("FRAME", "D - Pricing"),
        exampleNode("SECTION", "Marketing/Nested/Deep", [exampleNode("FRAME", "D - Deep")]),
      ]),
      exampleNode("FRAME", "D - About"),
    ]),
    exampleNode("SECTION", "App", [exampleNode("FRAME", "D - Dashboard"), exampleNode("FRAME", "D - Settings")]),
    exampleNode("FRAME", "D - Loose"),
    exampleNode("FRAME", "D - Loose Two"),
  ]);
}

// A frame processor shaped like processExampleFrame: it writes into the
// collector it is handed and returns the frame snapshot — and it finishes in
// the REVERSE of the order it was called in.
function reverseCompletionFrameProcessor() {
  let call = 0;
  return function (frame, parentId, parentPath, out) {
    const delay = Math.max(0, 24 - call++ * 2);
    return new Promise(function (resolve) {
      setTimeout(function () {
        out.nodeSnapshots.push({ id: frame.id, name: frame.name, parentId: parentId, parentPath: parentPath });
        out.spacerInstances.push({ id: frame.id + "/gap" });
        out.latentCapabilities.push({ node: frame.name });
        out.variantBindings.set(frame.id, [{ layer: frame.name, property: "fill", value: "brand/bg" }]);
        resolve({ id: frame.id, name: frame.name, instances: [] });
      }, delay);
    });
  };
}

// The shipped-before-this-change implementation, verbatim from code.js at
// b2b85a1: sections one at a time, depth-first.
async function sequentialExampleDataBaseline(examplePage, out, processFrame) {
  if (!examplePage) return { sectionSnapshots: [], frameSnapshots: [] };
  const sectionSnapshots = [];
  const frameSnapshots = [];

  async function walkSection(section) {
    const frames = section.children.filter(function (n) { return n.type === "FRAME"; });
    const snapshots = await collectForSections(frames, out, function (frame, bucket) {
      return processFrame(frame, section.id, section.name, bucket);
    });
    for (const snapshot of snapshots) frameSnapshots.push(snapshot);
    const frameDescs = frames.map(function (frame) { return { id: frame.id, name: frame.name }; });
    sectionSnapshots.push({ name: section.name, frames: frameDescs });

    const nestedSections = section.children.filter(function (n) { return n.type === "SECTION"; });
    for (const nested of nestedSections) await walkSection(nested);
  }

  const topSections = examplePage.children.filter(function (n) { return n.type === "SECTION"; });
  for (const section of topSections) await walkSection(section);

  const bareFrames = examplePage.children.filter(function (n) { return n.type === "FRAME"; });
  if (bareFrames.length > 0) {
    const snapshots = await collectForSections(bareFrames, out, function (frame, bucket) {
      return processFrame(frame, examplePage.id, "", bucket);
    });
    for (const snapshot of snapshots) frameSnapshots.push(snapshot);
    const frameDescs = bareFrames.map(function (frame) { return { id: frame.id, name: frame.name }; });
    sectionSnapshots.push({ name: "", frames: frameDescs });
  }

  return { sectionSnapshots: sectionSnapshots, frameSnapshots: frameSnapshots };
}

function shippedExampleWalk(processFrame) {
  return createExampleSectionWalk({
    collectInParallel: collectForSections,
    newWarningsCollector: newWarningsCollector,
    mergeWarningsCollector: mergeWarningsCollector,
    processFrame: processFrame,
  });
}

async function runBothExampleWalks(page) {
  const baselineOut = walkCollector();
  const baseline = await sequentialExampleDataBaseline(page, baselineOut, reverseCompletionFrameProcessor());
  const shippedOut = walkCollector();
  const shipped = await shippedExampleWalk(reverseCompletionFrameProcessor())(page, shippedOut);
  return { baseline, baselineOut, shipped, shippedOut };
}

test("example sections: parallel sections produce byte-identical structure and frame snapshots", async () => {
  const { baseline, shipped } = await runBothExampleWalks(examplePageFixture());
  assert.equal(JSON.stringify(shipped), JSON.stringify(baseline));
});

test("example sections: the warnings collector is filled in the same DFS order as before", async () => {
  const { baselineOut, shippedOut } = await runBothExampleWalks(examplePageFixture());
  assert.equal(collectorAsJson(shippedOut), collectorAsJson(baselineOut));
  assert.deepEqual(
    shippedOut.nodeSnapshots.map((n) => n.name),
    ["D - Home", "D - About", "D - Pricing", "D - Deep", "D - Dashboard", "D - Settings", "D - Loose", "D - Loose Two"]
  );
});

test("example sections: every frame on the page really is in flight at once", async () => {
  let inFlight = 0;
  let peak = 0;
  const processFrame = () =>
    new Promise((resolve) => {
      peak = Math.max(peak, ++inFlight);
      setTimeout(() => {
        inFlight--;
        resolve({ id: "x", name: "x", instances: [] });
      }, 6);
    });
  await shippedExampleWalk(processFrame)(examplePageFixture(), walkCollector());
  assert.equal(peak, 8, "all eight frames, across four sections and the bare page, should overlap");
});

test("example sections: no Example page is still an empty result, not a crash", async () => {
  const { baseline, shipped } = await runBothExampleWalks(null);
  assert.equal(JSON.stringify(shipped), JSON.stringify(baseline));
  assert.deepEqual(shipped, { sectionSnapshots: [], frameSnapshots: [] });
});

test("example sections: a page with no bare frames records no empty-named section", async () => {
  const page = exampleNode("PAGE", "Example", [exampleNode("SECTION", "Only", [exampleNode("FRAME", "D - One")])]);
  const { baseline, shipped } = await runBothExampleWalks(page);
  assert.equal(JSON.stringify(shipped), JSON.stringify(baseline));
  assert.deepEqual(shipped.sectionSnapshots.map((s) => s.name), ["Only"]);
});

// --- layer binding entries ------------------------------------------------
//
// With siblings now overlapping, what is left of the walk's serial depth is
// INSIDE a node: collectLayerBindingEntries awaited every bound variable and
// then all four style fields one at a time, so a single layer cost up to
// half a dozen round trips end to end, multiplied by tree depth. They are
// independent lookups; only the PUSH order matters, because that order is
// what the chain-wide first-occurrence-wins dedupe consumes.
//
// Proven against a verbatim copy of the sequential collector, with resolvers
// that answer in the REVERSE of call order.

const { createLayerBindingCollector } = extract("LAYER BINDINGS", "{ createLayerBindingCollector }");

function reverseCompletionBindingApi() {
  let call = 0;
  const later = (value) => new Promise((r) => setTimeout(() => r(value), Math.max(0, 24 - call++ * 2)));
  return {
    resolveVariableName: (id) => later("tokens/" + id),
    getStyleById: (id) => later(id === "S:gone" ? null : { name: "style/" + id }),
  };
}

// The shipped-before-this-change implementation, verbatim from code.js at
// 5d64bf2: every lookup awaited in place, inside the enumeration loops.
function createSequentialLayerBindingBaseline(api) {
  return async function collectLayerBindingEntries(node, layer, variableById, bindingsOut, seen) {
    function push(property, value) {
      if (value === null || value === undefined) return;
      const key = property + "\u0000" + value;
      if (seen.has(key)) return;
      seen.add(key);
      bindingsOut.push({ layer: layer, property: property, value: value });
    }
    if (node.boundVariables) {
      for (const prop of Object.keys(node.boundVariables)) {
        const alias = node.boundVariables[prop];
        if (!alias) continue;
        const aliases = Array.isArray(alias) ? alias : [alias];
        for (const a of aliases) {
          if (a && typeof a.id === "string") push(prop, await api.resolveVariableName(a.id, variableById));
        }
      }
    }
    for (const bucket of [
      { paints: node.fills, prefix: "fill" },
      { paints: node.strokes, prefix: "stroke" },
    ]) {
      if (!Array.isArray(bucket.paints)) continue;
      for (const paint of bucket.paints) {
        if (!paint || !paint.boundVariables) continue;
        for (const field of Object.keys(paint.boundVariables)) {
          const alias = paint.boundVariables[field];
          if (alias && typeof alias.id === "string") {
            push(bucket.prefix + "." + field, await api.resolveVariableName(alias.id, variableById));
          }
        }
      }
    }
    for (const field of ["textStyleId", "fillStyleId", "strokeStyleId", "effectStyleId"]) {
      const styleId = node[field];
      if (typeof styleId !== "string" || !styleId) continue;
      const style = await api.getStyleById(styleId);
      push(field.replace(/Id$/, ""), style ? style.name : styleId);
    }
  };
}

// A layer using every lane at once: a multi-alias bound property, a bound
// property that is empty, bound fills AND strokes, all four style fields
// (one of them missing, so it falls back to the raw id), and a repeat that
// must be deduped.
const BINDING_NODE = {
  boundVariables: {
    itemSpacing: { id: "V:gap" },
    paddingLeft: [{ id: "V:pad" }, { id: "V:gap" }],
    visible: null,
  },
  fills: [{ boundVariables: { color: { id: "V:ink" } } }, null, { boundVariables: {} }],
  strokes: [{ boundVariables: { color: { id: "V:ink" } } }],
  textStyleId: "S:body",
  fillStyleId: "",
  strokeStyleId: "S:gone",
  effectStyleId: "S:shadow",
};

async function collectBoth(node, layer) {
  const beforeOut = [];
  await createSequentialLayerBindingBaseline(reverseCompletionBindingApi())(
    node, layer, new Map(), beforeOut, new Set()
  );
  const afterOut = [];
  await createLayerBindingCollector(reverseCompletionBindingApi())(node, layer, new Map(), afterOut, new Set());
  return { before: beforeOut, after: afterOut };
}

test("layer bindings: parallel lookups push byte-identically to the sequential collector", async () => {
  const { before, after } = await collectBoth(BINDING_NODE, "card/label");
  assert.equal(JSON.stringify(after), JSON.stringify(before));
  assert.equal(after.length > 0, true, "the fixture must actually produce entries");
});

test("layer bindings: enumeration order — bound variables, then fills, then strokes, then styles", async () => {
  const { after } = await collectBoth(BINDING_NODE, "card/label");
  assert.deepEqual(
    after.map((e) => e.property),
    [
      "itemSpacing",
      "paddingLeft",
      "paddingLeft",
      "fill.color",
      "stroke.color",
      "textStyle",
      "strokeStyle",
      "effectStyle",
    ]
  );
  // The dedupe key is property+value, not either alone: "stroke.color"
  // resolves to the same tokens/V:ink as "fill.color" and survives on a
  // different property, and paddingLeft appears twice on different values.
  assert.deepEqual(
    after.filter((e) => e.value === "tokens/V:ink").map((e) => e.property),
    ["fill.color", "stroke.color"]
  );
  assert.deepEqual(
    after.filter((e) => e.property === "paddingLeft").map((e) => e.value),
    ["tokens/V:pad", "tokens/V:gap"]
  );
});

test("layer bindings: a missing style still falls back to the raw style id", async () => {
  const { after } = await collectBoth(BINDING_NODE, "card/label");
  assert.deepEqual(after.find((e) => e.property === "strokeStyle"), {
    layer: "card/label",
    property: "strokeStyle",
    value: "S:gone",
  });
});

test("layer bindings: an entry already in `seen` is still skipped by the caller's chain", async () => {
  const out = [];
  const seen = new Set(["textStyle\u0000style/S:body"]);
  await createLayerBindingCollector(reverseCompletionBindingApi())(BINDING_NODE, "later", new Map(), out, seen);
  assert.equal(out.some((e) => e.property === "textStyle"), false);
});

test("layer bindings: a layer with nothing bound collects nothing", async () => {
  const { before, after } = await collectBoth({ fills: [{}], strokes: "not-an-array" }, "plain");
  assert.deepEqual(after, before);
  assert.deepEqual(after, []);
});

test("layer bindings: the lookups really do overlap rather than queue", async () => {
  let inFlight = 0;
  let peak = 0;
  const hold = (value) =>
    new Promise((resolve) => {
      peak = Math.max(peak, ++inFlight);
      setTimeout(() => {
        inFlight--;
        resolve(value);
      }, 6);
    });
  await createLayerBindingCollector({
    resolveVariableName: (id) => hold("tokens/" + id),
    getStyleById: (id) => hold({ name: "style/" + id }),
  })(BINDING_NODE, "card/label", new Map(), [], new Set());
  assert.equal(peak, 8, "five bound-variable aliases and three style ids, all in flight together");
});
