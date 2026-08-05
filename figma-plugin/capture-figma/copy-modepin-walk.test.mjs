// Tests for the COPY CAPTURE + MODE-PIN CAPTURE live tree walk (brief pack
// references/figma-agent-plugin-brief.md, "COPY CAPTURE"/"MODE-PIN CAPTURE"
// sections — 2026-08-05 ruling: capture-figma is the active exporter, these
// walks are its own, not the retired Figma-agent plugin's).
//
// code.js can't be imported (top-level figma.showUI), so this reads the real
// source and extracts the walk by its markers, same technique
// buildexport-perf.test.mjs established for createSubtreeWalk.
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

const { createCopyModePinWalk } = extract("COPY AND MODE-PIN WALK", "{ createCopyModePinWalk }");

// --- fixture helpers --------------------------------------------------------

function node(type, name, props) {
  const n = Object.assign({ type, name, children: [] }, props || {});
  for (const child of n.children) child.parent = n;
  return n;
}

function newOut() {
  return { copy: [], modePins: [] };
}

// Stub api: no instance ever resolves a component (individual tests override
// this where componentContext resolution matters).
function stubApi(overrides) {
  return Object.assign(
    {
      findEnclosingInstance: function () { return null; },
      getInstanceMainComponent: async function () { return null; },
      resolveComponentSetName: function () { return null; },
    },
    overrides || {}
  );
}

test("copy walk: a visible TEXT node's characters are captured with a path built from the root frame's own name plus the node's own name", async () => {
  const walk = createCopyModePinWalk(stubApi());
  const frame = node("FRAME", "Landing", {
    children: [node("TEXT", "Title", { characters: "Welcome", id: "1:23" })],
  });

  const out = newOut();
  await walk(frame, out);

  assert.deepEqual(out.copy, [{ path: "Landing/Title", text: "Welcome", id: "1:23" }]);
});

test("copy walk: a TEXT node with empty-string characters is skipped — nothing to capture", async () => {
  const walk = createCopyModePinWalk(stubApi());
  const frame = node("FRAME", "Landing", {
    children: [node("TEXT", "EmptyLabel", { characters: "", id: "1:24" })],
  });

  const out = newOut();
  await walk(frame, out);

  assert.deepEqual(out.copy, []);
});

test("copy walk: placeholder-looking text ('Lorem ipsum') is kept, never filtered as noise — placeholder copy on a deliverable page is itself drift signal", async () => {
  const walk = createCopyModePinWalk(stubApi());
  const frame = node("FRAME", "Landing", {
    children: [node("TEXT", "Body", { characters: "Lorem ipsum dolor sit amet", id: "1:25" })],
  });

  const out = newOut();
  await walk(frame, out);

  assert.deepEqual(out.copy, [{ path: "Landing/Body", text: "Lorem ipsum dolor sit amet", id: "1:25" }]);
});

test("copy walk: a TEXT node inside a hidden layer is skipped — the hidden ancestor's whole subtree is never descended into", async () => {
  const walk = createCopyModePinWalk(stubApi());
  const frame = node("FRAME", "Landing", {
    children: [
      node("GROUP", "HiddenGroup", {
        visible: false,
        children: [node("TEXT", "Secret", { characters: "shh", id: "1:26" })],
      }),
    ],
  });

  const out = newOut();
  await walk(frame, out);

  assert.deepEqual(out.copy, []);
});

test("copy walk: the path is composed only of FRAME/INSTANCE ancestor names, ending in the node's own name — a GROUP in between is structurally transparent", async () => {
  const walk = createCopyModePinWalk(stubApi());
  const frame = node("FRAME", "Landing", {
    children: [
      node("INSTANCE", "NavigationHeader", {
        children: [
          node("GROUP", "InnerGroup", {
            children: [node("TEXT", "Info", { characters: "About", id: "1:27" })],
          }),
        ],
      }),
    ],
  });

  const out = newOut();
  await walk(frame, out);

  assert.deepEqual(out.copy, [{ path: "Landing/NavigationHeader/Info", text: "About", id: "1:27" }]);
});

test("copy walk: componentPropertyReferences.characters resolves componentContext to the enclosing instance's component/set name and the referenced prop", async () => {
  const mainComponent = node("COMPONENT", "Default");
  const api = stubApi({
    findEnclosingInstance: function (n) {
      let cur = n.parent;
      while (cur) {
        if (cur.type === "INSTANCE") return cur;
        cur = cur.parent;
      }
      return null;
    },
    getInstanceMainComponent: async function () { return mainComponent; },
    resolveComponentSetName: function (component) { return component === mainComponent ? "NavigationHeader" : null; },
  });
  const walk = createCopyModePinWalk(api);
  const frame = node("FRAME", "Landing", {
    children: [
      node("INSTANCE", "NavHeaderInstance", {
        children: [
          node("TEXT", "Info", {
            characters: "About",
            id: "1:28",
            componentPropertyReferences: { characters: "Label#123:4" },
          }),
        ],
      }),
    ],
  });

  const out = newOut();
  await walk(frame, out);

  assert.deepEqual(out.copy, [
    {
      path: "Landing/NavHeaderInstance/Info",
      text: "About",
      id: "1:28",
      componentContext: { component: "NavigationHeader", prop: "Label#123:4" },
    },
  ]);
});

test("copy walk: a raw text node with no componentPropertyReferences.characters carries no componentContext key at all", async () => {
  const walk = createCopyModePinWalk(stubApi());
  const frame = node("FRAME", "Landing", {
    children: [node("TEXT", "Title", { characters: "Welcome", id: "1:29" })],
  });

  const out = newOut();
  await walk(frame, out);

  assert.ok(!("componentContext" in out.copy[0]));
});

test("modePins walk: a visible FrameNode with non-empty explicitVariableModes is captured, keyed by its own path", async () => {
  const walk = createCopyModePinWalk(stubApi());
  const frame = node("FRAME", "Landing", { explicitVariableModes: { "coll-1": "mode-1" } });

  const out = newOut();
  await walk(frame, out);

  assert.deepEqual(out.modePins, [{ path: "Landing", explicitVariableModes: { "coll-1": "mode-1" } }]);
});

test("modePins walk: a frame with an empty explicitVariableModes is skipped — inheriting every collection's mode is the common case, not capture-worthy", async () => {
  const walk = createCopyModePinWalk(stubApi());
  const frame = node("FRAME", "Landing", { explicitVariableModes: {} });

  const out = newOut();
  await walk(frame, out);

  assert.deepEqual(out.modePins, []);
});

test("modePins walk: captured for both the top-level frame AND a nested frame beneath it — not only inferred from instance-override side effects", async () => {
  const walk = createCopyModePinWalk(stubApi());
  const frame = node("FRAME", "Landing", {
    explicitVariableModes: { "coll-color": "mode-dark" },
    children: [
      node("FRAME", "NestedCard", { explicitVariableModes: { "coll-layout": "mode-lg" } }),
    ],
  });

  const out = newOut();
  await walk(frame, out);

  assert.deepEqual(out.modePins, [
    { path: "Landing", explicitVariableModes: { "coll-color": "mode-dark" } },
    { path: "Landing/NestedCard", explicitVariableModes: { "coll-layout": "mode-lg" } },
  ]);
});

test("modePins walk: a frame inside a hidden layer is skipped, same hidden-subtree rule as copy capture", async () => {
  const walk = createCopyModePinWalk(stubApi());
  const frame = node("FRAME", "Landing", {
    children: [
      node("GROUP", "HiddenGroup", {
        visible: false,
        children: [node("FRAME", "HiddenPin", { explicitVariableModes: { "coll-1": "mode-1" } })],
      }),
    ],
  });

  const out = newOut();
  await walk(frame, out);

  assert.deepEqual(out.modePins, []);
});
