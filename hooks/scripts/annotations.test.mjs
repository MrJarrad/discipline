import { test } from "node:test";
import assert from "node:assert/strict";

import { annotateItems, applyAnnotations, loadAnnotationRegistry, splitByAction, validateRegistry, evaluateClosure, summarizeAnnotations } from "./annotations.mjs";

// THE LAW THIS MODULE EXISTS TO ENFORCE (operator ruling 2026-08-14, vault
// fleet/rulings/2026-08-14-rulings-annotate-never-suppress.md): every
// difference the lanes find is EMITTED every sync. A ruling attaches a
// classification to an item; it never removes one. These tests are written
// against that law, not against the mechanism — an implementation that
// filters anything out fails them by construction.

const RATIFIED = {
  id: "splitcontent-split-text-gap-lg",
  lane: "binding",
  classification: "ratified-exception",
  ruling: "operator ruling 2026-08-02: two stacked text blocks need more space",
  match: { component: "SplitContent", layer: "content", property: "itemSpacing" },
};

test("annotateItems: an item no annotation matches keeps its own classification and needs action", () => {
  const items = [{ lane: "binding", type: "binding_mismatch", component: "HeroText", layer: "title", property: "textStyle" }];

  const annotated = annotateItems({ items, entries: [RATIFIED], capture: {} });

  assert.equal(annotated.length, 1, "the item is emitted");
  assert.equal(annotated[0].classification, "drift");
  assert.equal(annotated[0].annotation, undefined);
  const { needs_action, annotated: side } = splitByAction(annotated);
  assert.equal(needs_action.length, 1);
  assert.equal(side.length, 0);
});

test("annotateItems: a matching ratified-exception annotates the item — still emitted, moved to annotated, citing its ruling", () => {
  const items = [
    { lane: "binding", type: "variant-divergence", component: "SplitContent", layer: "content", property: "itemSpacing" },
  ];

  const annotated = annotateItems({ items, entries: [RATIFIED], capture: {} });

  assert.equal(annotated.length, 1, "the annotated item is NEVER dropped from the output");
  assert.equal(annotated[0].classification, "ratified-exception");
  assert.equal(annotated[0].annotation.id, "splitcontent-split-text-gap-lg");
  assert.equal(annotated[0].annotation.ruling, RATIFIED.ruling);
  assert.equal(annotated[0].annotation.state, "active");
  const split = splitByAction(annotated);
  assert.equal(split.needs_action.length, 0);
  assert.equal(split.annotated.length, 1, "annotated is visible one level down, never gone");
});

test("annotateItems: an annotation on another lane never touches this lane's item", () => {
  const items = [
    { lane: "axis", type: "axis_ownership_violation", component: "SplitContent", layer: "content", property: "itemSpacing" },
  ];

  const annotated = annotateItems({ items, entries: [RATIFIED], capture: {} });

  assert.equal(annotated[0].classification, "drift");
});

test("annotateItems: variantIncludes narrows an annotation to the variant the ruling actually covers", () => {
  const entry = { ...RATIFIED, match: { ...RATIFIED.match, variantIncludes: "device=sm, layout=split-text" } };
  const items = [
    {
      lane: "binding",
      type: "variant-divergence",
      component: "SplitContent",
      layer: "content",
      property: "itemSpacing",
      variants: ["device=sm, layout=split-text", "device=lg, layout=split-text"],
    },
    {
      lane: "binding",
      type: "variant-divergence",
      component: "SplitContent",
      layer: "content",
      property: "itemSpacing",
      variants: ["device=lg, layout=half"],
    },
  ];

  const annotated = annotateItems({ items, entries: [entry], capture: {} });

  assert.equal(annotated[0].classification, "ratified-exception");
  assert.equal(annotated[1].classification, "drift", "an uncovered variant stays a plain difference");
});

// ---- CLOSURE CONDITIONS -------------------------------------------------
// "Every exception declares a CLOSURE CONDITION ('closes when the file binds
// X'), checked mechanically each sync; when met, the item flips to 'closure
// condition met — reconcile now.'" (ruling, verbatim)

const ANTICIPATED = {
  id: "paginationpage-sm-height-500",
  lane: "binding",
  classification: "anticipated-update",
  ruling: "operator ruling: code leads, the file is expected to catch up",
  match: { component: "PaginationPage", property: "boundVariables.height" },
  closure: {
    kind: "instance_bound_variable",
    description: "closes when the file binds PaginationPage height to VariableID:163:90 at device=sm",
    component: "PaginationPage",
    variantIncludes: "device=sm",
    subProperty: "height",
    variableId: "VariableID:163:90",
  },
};

function captureWithPaginationHeight(variableId) {
  return {
    templateFrames: [
      {
        name: "M - Project",
        instances: [
          {
            component: "PaginationPage",
            variantProps: { device: "sm" },
            overrides: variableId
              ? [{ property: "boundVariables", value: { height: { type: "VARIABLE_ALIAS", id: variableId } } }]
              : [],
          },
        ],
      },
    ],
  };
}

const PAGINATION_ITEM = {
  lane: "binding",
  type: "binding_mismatch",
  component: "PaginationPage",
  layer: "PaginationPage",
  property: "boundVariables.height",
};

test("anticipated-update, condition still open: the item is annotated, visible, and states the condition every sync", () => {
  const annotated = annotateItems({
    items: [PAGINATION_ITEM],
    entries: [ANTICIPATED],
    capture: captureWithPaginationHeight("VariableID:163:91"),
  });

  assert.equal(annotated[0].classification, "anticipated-update");
  assert.equal(annotated[0].annotation.state, "active");
  assert.equal(annotated[0].annotation.closure.state, "open");
  assert.match(annotated[0].annotation.closure.detail, /163:91/);
  const split = splitByAction(annotated);
  assert.equal(split.annotated.length, 1, "an open anticipated update is annotated, never gone");
  assert.match(summarizeAnnotations(split.annotated)[0], /closes when the file binds/);
});

test("anticipated-update, condition MET: the item flips to closure-condition-met and returns to needs-action", () => {
  const annotated = annotateItems({
    items: [PAGINATION_ITEM],
    entries: [ANTICIPATED],
    capture: captureWithPaginationHeight("VariableID:163:90"),
  });

  assert.equal(annotated[0].annotation.state, "closure-condition-met");
  assert.equal(annotated[0].annotation.closure.state, "met");
  assert.match(annotated[0].annotation.reason, /reconcile now/);
  const split = splitByAction(annotated);
  assert.equal(split.needs_action.length, 1, "the sync the file catches up, the item announces itself");
  assert.equal(split.annotated.length, 0);
});

test("closure condition that cannot be observed is UNKNOWN, never quietly open — the item needs action", () => {
  const annotated = annotateItems({
    items: [PAGINATION_ITEM],
    entries: [ANTICIPATED],
    capture: { templateFrames: [] },
  });

  assert.equal(annotated[0].annotation.closure.state, "unknown");
  assert.equal(annotated[0].annotation.state, "closure-unknown");
  assert.equal(splitByAction(annotated).needs_action.length, 1);
});

test("evaluateClosure: component_binding_value reads a component-set variant binding out of the capture", () => {
  const capture = {
    components: {
      sets: [
        {
          name: "SplitContent",
          variants: [{ name: "device=sm, layout=split-text", bindings: [{ layer: "content", property: "itemSpacing", value: "layout/grid/gap" }] }],
        },
      ],
    },
  };

  const closure = {
    kind: "component_binding_value",
    description: "closes when SplitContent's sm split-text row gap binds plain gap",
    component: "SplitContent",
    layer: "content",
    property: "itemSpacing",
    variantIncludes: "device=sm, layout=split-text",
    value: "layout/grid/gap",
  };

  assert.equal(evaluateClosure(closure, capture).state, "met");
  assert.equal(evaluateClosure({ ...closure, value: "layout/grid/gap-lg" }, capture).state, "open");
  assert.equal(evaluateClosure(closure, { components: { sets: [] } }).state, "unknown");
});

test("an annotation whose expectValue no longer matches reality is STALE — it covers a difference that has moved", () => {
  const entry = { ...RATIFIED, expectValue: "layout/grid/gap-lg" };
  const items = [{ ...RATIFIED.match, lane: "binding", type: "variant-divergence", value: "layout/grid/gap" }];

  const annotated = annotateItems({ items, entries: [entry], capture: {} });

  assert.equal(annotated[0].annotation.state, "stale");
  assert.match(annotated[0].annotation.reason, /re-ratify or fix/);
  assert.equal(splitByAction(annotated).needs_action.length, 1);
});

// ---- REGISTRY LINT ------------------------------------------------------

test("validateRegistry: an annotation without a ruling citation is an authoring error, never a silent exception", () => {
  assert.throws(
    () => validateRegistry([{ id: "x", lane: "binding", classification: "ratified-exception", match: { component: "A" } }]),
    /missing a ruling citation/
  );
});

test("validateRegistry: an anticipated-update with no closure condition is rejected — it could never announce its own arrival", () => {
  assert.throws(
    () =>
      validateRegistry([
        { id: "x", lane: "binding", classification: "anticipated-update", ruling: "r", match: { component: "A" } },
      ]),
    /anticipated-update with no closure condition/
  );
});

test("validateRegistry: unknown classifications and closure kinds are rejected", () => {
  assert.throws(
    () => validateRegistry([{ id: "x", lane: "binding", classification: "wontfix", ruling: "r", match: { component: "A" } }]),
    /must be one of/
  );
  assert.throws(
    () =>
      validateRegistry([
        {
          id: "x",
          lane: "binding",
          classification: "ratified-exception",
          ruling: "r",
          match: { component: "A" },
          closure: { kind: "vibes", description: "d" },
        },
      ]),
    /closure kind/
  );
});

test("validateRegistry: duplicate ids are rejected — an id addresses one item", () => {
  const entry = { id: "dupe", lane: "binding", classification: "ratified-exception", ruling: "r", match: { component: "A" } };
  assert.throws(() => validateRegistry([entry, { ...entry }]), /duplicate annotation id/);
});

// ---- ORPHANED ANNOTATIONS ----------------------------------------------
// The mirror image of a suppressed item: a ruling that no longer matches ANY
// difference. Silence there is how a ratification outlives the thing it
// ratified — the lane must say so, not quietly carry a dead exception.

test("applyAnnotations: an annotation matching no item this sync is reported as unmatched, under annotated", () => {
  const entry = { ...RATIFIED };

  const result = applyAnnotations({ items: [], entries: [entry], lane: "binding", capture: {} });

  assert.equal(result.needs_action.length, 0);
  assert.equal(result.annotated.length, 1, "the spent ruling is still reported");
  assert.equal(result.annotated[0].type, "annotation_unmatched");
  assert.equal(result.annotated[0].annotation.state, "unmatched");
  assert.equal(result.annotated[0].annotation.id, RATIFIED.id);
  assert.match(summarizeAnnotations(result.annotated)[0], /matched no difference/);
});

test("applyAnnotations: an annotation for another lane is not reported as unmatched by this lane", () => {
  const result = applyAnnotations({ items: [], entries: [{ ...RATIFIED, lane: "page-template" }], lane: "binding", capture: {} });

  assert.deepEqual(result.annotated, []);
});

test("applyAnnotations: returns every item, split, with the annotated ones classified", () => {
  const items = [
    { lane: "binding", type: "binding_mismatch", component: "HeroText", layer: "title", property: "textStyle" },
    { lane: "binding", type: "variant-divergence", component: "SplitContent", layer: "content", property: "itemSpacing" },
  ];

  const result = applyAnnotations({ items, entries: [RATIFIED], lane: "binding", capture: {} });

  assert.equal(result.items.length, 2, "every difference is emitted");
  assert.equal(result.needs_action.length, 1);
  assert.equal(result.annotated.length, 1);
});

// ---- THE SHIPPED REGISTRY ----------------------------------------------

test("the shipped registry parses, lints clean, and carries this week's seeded rulings", () => {
  const entries = loadAnnotationRegistry(new URL("./annotations-registry.json", import.meta.url).pathname);

  const ids = entries.map((e) => e.id);
  assert.ok(ids.includes("splitcontent-split-text-row-gap"), "(a) the split-text exception is a permanent annotation");
  assert.ok(ids.includes("paginationpage-sm-height-screen-height-500"), "(b) the PaginationPage anticipated update");
  assert.ok(ids.includes("navigationheader-mobile-layout-split"), "migrated: the NavigationHeader axis exception");
  assert.ok(ids.includes("layoutgrid-columns-device-owned"), "migrated: LayoutGrid columns, previously silent");

  const splitText = entries.find((e) => e.id === "splitcontent-split-text-row-gap");
  assert.equal(splitText.closure, undefined, "a permanent annotation declares no closure condition");
  const pagination = entries.find((e) => e.id === "paginationpage-sm-height-screen-height-500");
  assert.equal(pagination.closure.kind, "instance_bound_variable");
});
