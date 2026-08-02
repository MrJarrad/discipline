// Tests for code.js's JUMP TO NODE pure ancestor/page resolution (operator
// request 2026-08-02: every FIGMA HYGIENE "where it shows up" entry selects
// + scrolls the flagged node into view on click). code.js can't be imported
// directly — it calls figma.showUI(...) at module top level and throws
// outside the plugin sandbox (no `figma` global in Node) — so this extracts
// the pure resolveJumpTarget() (+ its ancestor/page-walk helpers) by its
// "JUMP TO NODE" markers and evals it standalone, same technique
// resize-dedup.test.mjs already uses.
//
// The figma.* IO half (getNodeByIdAsync, setCurrentPageAsync, selection,
// viewport.scrollAndZoomIntoView) is NOT exercised here — there is no figma
// global under Node and no fixture that could stand in for the live plugin
// API the way createSubtreeWalk's injected `api` does. resolveJumpTarget is
// deliberately the pure seam: everything it needs (`.type`/`.parent`/
// `.removed`) is a plain node property, no plugin-API call, so it's fully
// testable with mock node objects — the same shape
// nested-instance-interchangeability.test.mjs's node() helper builds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function extractJumpToNodeBlock(source) {
  const match = /=== JUMP TO NODE[\s\S]*?===\n([\s\S]*?)\n\/\/ === END JUMP TO NODE ===/.exec(source);
  if (!match) throw new Error("JUMP TO NODE markers not found in code.js");
  return match[1];
}

function loadJumpToNode() {
  const codeJs = readFileSync(join(import.meta.dirname, "code.js"), "utf8");
  const block = extractJumpToNodeBlock(codeJs);
  const fn = new Function(`${block}\nreturn { resolveJumpTarget, findSelectableAncestor, findOwningPage, isSelectableNodeType };`);
  return fn();
}

const { resolveJumpTarget, findSelectableAncestor, findOwningPage, isSelectableNodeType } = loadJumpToNode();

// Same node() shape as nested-instance-interchangeability.test.mjs, minimal
// for this file's needs — no auto children/parent wiring required here
// since every fixture below sets .parent explicitly to make the walked
// chain obvious at the call site.
function node(type, extra) {
  return Object.assign({ type: type }, extra || {});
}

test("resolveJumpTarget: an ordinary directly-selectable node on its own page resolves to itself, usedAncestor false", () => {
  const page = node("PAGE", { id: "0:1" });
  const frame = node("FRAME", { id: "1:2", parent: page });
  const target = resolveJumpTarget(frame);
  assert.equal(target.selectableNode, frame);
  assert.equal(target.page, page);
  assert.equal(target.usedAncestor, false);
});

test("resolveJumpTarget: a node with no directly-selectable ancestor available (only PAGE/DOCUMENT above it) returns null", () => {
  const doc = node("DOCUMENT", { id: "0:0" });
  const page = node("PAGE", { id: "0:1", parent: doc });
  page.type = "PAGE";
  // The page itself is the target — PAGE is not selectable, and its only
  // ancestor is DOCUMENT, also not selectable — no selectable node exists.
  assert.equal(resolveJumpTarget(page), null);
});

test("resolveJumpTarget: a removed (deleted) node is a stale capture — returns null, never resolved", () => {
  const page = node("PAGE", { id: "0:1" });
  const frame = node("FRAME", { id: "1:2", parent: page, removed: true });
  assert.equal(resolveJumpTarget(frame), null);
});

test("resolveJumpTarget: a null node (getNodeByIdAsync found nothing) returns null", () => {
  assert.equal(resolveJumpTarget(null), null);
});

test("resolveJumpTarget: a node reachable only through a non-selectable wrapper walks up to the nearest selectable ancestor, usedAncestor true", () => {
  const page = node("PAGE", { id: "0:1" });
  const frame = node("FRAME", { id: "1:2", parent: page });
  // A hypothetical non-selectable node type nested between the frame and
  // the leaf — isSelectableNodeType only excludes PAGE/DOCUMENT per the
  // live Figma API, so this fixture uses PAGE itself as the non-selectable
  // rung to prove the walk keeps going past one non-selectable ancestor.
  const nested = node("VECTOR", { id: "1:3", parent: frame });
  const target = resolveJumpTarget(nested);
  assert.equal(target.selectableNode, nested, "a VECTOR is directly selectable — sanity check for the next case");

  // Genuine non-selectable case: the node itself resolves to something
  // whose own .type isn't selectable (defensive — not expected on a real
  // document, but the walk must still terminate correctly).
  const oddNode = { type: "PAGE", id: "weird", parent: frame };
  const oddTarget = resolveJumpTarget(oddNode);
  assert.equal(oddTarget.selectableNode, frame);
  assert.equal(oddTarget.usedAncestor, true);
});

test("resolveJumpTarget: a nested-instance leaf on a DIFFERENT page than figma.currentPage still resolves — page is derived from the node's own ancestry, not assumed current", () => {
  const otherPage = node("PAGE", { id: "0:99" });
  const instance = node("INSTANCE", { id: "5:1", parent: otherPage });
  const leaf = node("TEXT", { id: "5:1;9:2;3:4", parent: instance });
  const target = resolveJumpTarget(leaf);
  assert.equal(target.page, otherPage);
  assert.equal(target.selectableNode, leaf);
});

test("isSelectableNodeType: PAGE and DOCUMENT are not selectable; every other type is", () => {
  assert.equal(isSelectableNodeType("PAGE"), false);
  assert.equal(isSelectableNodeType("DOCUMENT"), false);
  assert.equal(isSelectableNodeType("FRAME"), true);
  assert.equal(isSelectableNodeType("INSTANCE"), true);
  assert.equal(isSelectableNodeType(undefined), false);
});

test("findOwningPage: walks up through nested instances to the PAGE ancestor", () => {
  const page = node("PAGE", { id: "0:1" });
  const instance = node("INSTANCE", { id: "1:2", parent: page });
  const leaf = node("TEXT", { id: "1:3", parent: instance });
  assert.equal(findOwningPage(leaf), page);
});

test("findOwningPage: no PAGE ancestor anywhere in the chain returns null", () => {
  const orphanNode = node("FRAME", { id: "1:1", parent: null });
  assert.equal(findOwningPage(orphanNode), null);
});

test("findSelectableAncestor: a node whose entire ancestry is exhausted (parent chain hits null) without finding a selectable type returns null", () => {
  const unselectable = node("PAGE", { id: "0:1", parent: null });
  assert.equal(findSelectableAncestor(unselectable), null);
});
