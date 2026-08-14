/* annotations — the shared classification layer for every conformance/drift
   lane (binding, page-template, axis).

   LAW (operator ruling 2026-08-14, vault fleet/rulings/
   2026-08-14-rulings-annotate-never-suppress.md, verbatim: "the main purpose
   of the plugin is to surface differences. having ruling like that coded in
   creates an issue i think"): the lanes report EVERY difference EVERY sync.
   No coded ruling may remove an item from the output. A ruling ATTACHES a
   classification to an item — drift / ratified-exception / anticipated-update
   / suspected-false-positive — citing the ruling it came from; it never
   filters. Every exception may declare a CLOSURE CONDITION, a mechanical
   predicate over the capture ("closes when the file binds X at mode Y"),
   evaluated every sync; when it comes true the item flips to
   `closure-condition-met` and moves BACK to needs-action ("reconcile now").

   This module is the whole mechanism, so no lane can re-invent a private
   suppression: a lane computes its differences exactly as if no ruling
   existed, hands the full list here, and gets the same list back with
   annotations attached, plus the needs-action / annotated split for display.

   Interface (deep module — five functions, one direction of data flow):

     loadAnnotationRegistry(path)            -> entries[]  (lint-validated)
     annotateItems({items, entries, capture}) -> items[]    (same length, always)
     splitByAction(items)                    -> { needs_action, annotated }
     evaluateClosure(closure, capture)        -> { state, detail }
     summarizeAnnotations(items)              -> string[]   (display lines)

   REGISTRY ENTRY (scripts/annotations-registry.json, or --annotations <path>):

     {
       "id":             "splitcontent-split-text-gap-lg",   // stable, unique
       "lane":           "binding" | "page-template" | "axis",
       "classification": "ratified-exception" | "anticipated-update"
                         | "suspected-false-positive",
       "ruling":         "operator ruling 2026-08-02: ...",  // MANDATORY citation
       "match":          { <item field>: <exact value>, ..., "variantIncludes": "device=sm" },
       "expectValue":    <optional> the value the ruling describes; when the
                         capture's value has moved on the annotation is STALE
                         (it no longer describes reality) and the item goes
                         back to needs-action rather than quietly covering a
                         different difference than the one that was ratified.
       "closure":        <optional> { kind, ... } — see CLOSURES below.
     }

   `match` is a plain field-equality map against the item the lane emitted,
   with one special key: `variantIncludes` is a SUBSTRING test against the
   item's `variant` string or any entry of its `variants[]` list (the same
   substring convention the maps already use for variant filters).

   CLOSURES — mechanical predicates over the capture, never prose:

     { kind: "instance_bound_variable", component, variantIncludes?,
       subProperty, variableId }
        true when some templateFrames[].instances[] of `component` (narrowed
        by variantIncludes against its own variantProps) carries a
        boundVariables override whose [subProperty] aliases `variableId`.

     { kind: "component_binding_value", component, layer, property,
       variantIncludes?, value }
        true when some components.sets[]/standalone[] variant of `component`
        binds (layer, property) to `value`.

   A closure that cannot be evaluated at all (the component/instance the
   predicate names is absent from this capture) returns `unknown` — NEVER
   `open`. Unknown means the instrument lost sight of the thing it was
   watching, which is itself actionable: those items go to needs-action with
   the reason stated, because a condition that can never be observed can
   never announce its own closure. That silence is the exact failure this
   ruling exists to prevent.
*/
import { readFileSync, existsSync } from "node:fs";

export const CLASSIFICATIONS = new Set([
  "ratified-exception",
  "anticipated-update",
  "suspected-false-positive",
]);

// The classification an item carries when no ruling speaks to it: a plain
// difference between Figma and code. Never a filter — every lane's item
// starts here and stays emitted whatever a ruling says about it.
export const DEFAULT_CLASSIFICATION = "drift";

const CLOSURE_KINDS = new Set(["instance_bound_variable", "component_binding_value"]);

// ---- registry lint ------------------------------------------------------

export function validateRegistry(entries) {
  const seen = new Set();
  for (const entry of entries || []) {
    const where = entry?.id ? `entry "${entry.id}"` : `entry ${JSON.stringify(entry)}`;
    if (typeof entry?.id !== "string" || entry.id.trim() === "") {
      throw new Error(`[annotations] ${where} is missing a stable id.`);
    }
    if (seen.has(entry.id)) {
      throw new Error(`[annotations] duplicate annotation id "${entry.id}" — ids address items, they must be unique.`);
    }
    seen.add(entry.id);
    if (typeof entry.lane !== "string" || entry.lane.trim() === "") {
      throw new Error(`[annotations] ${where} is missing a lane.`);
    }
    if (!CLASSIFICATIONS.has(entry.classification)) {
      throw new Error(
        `[annotations] ${where} has classification "${entry.classification}" — must be one of ${[...CLASSIFICATIONS].join(", ")}.`
      );
    }
    if (typeof entry.ruling !== "string" || entry.ruling.trim() === "") {
      throw new Error(`[annotations] ${where} is missing a ruling citation — every annotation names the ruling it came from.`);
    }
    if (!entry.match || typeof entry.match !== "object" || Object.keys(entry.match).length === 0) {
      throw new Error(`[annotations] ${where} has no match — an annotation that matches nothing is dead weight.`);
    }
    if (entry.closure !== undefined && entry.closure !== null) {
      if (!CLOSURE_KINDS.has(entry.closure.kind)) {
        throw new Error(
          `[annotations] ${where} declares closure kind "${entry.closure.kind}" — must be one of ${[...CLOSURE_KINDS].join(", ")}.`
        );
      }
      if (typeof entry.closure.description !== "string" || entry.closure.description.trim() === "") {
        throw new Error(
          `[annotations] ${where}'s closure is missing a description — the condition must be readable ("closes when the file binds X at mode Y") as well as mechanical.`
        );
      }
    }
    if (entry.classification === "anticipated-update" && !entry.closure) {
      throw new Error(
        `[annotations] ${where} is an anticipated-update with no closure condition — an anticipated update that can't announce its own arrival is the defect this ruling exists to prevent.`
      );
    }
  }
  return entries || [];
}

export function loadAnnotationRegistry(path) {
  if (!path || !existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return validateRegistry(parsed.annotations || []);
}

// ---- matching -----------------------------------------------------------

function variantStrings(item) {
  const list = [];
  if (typeof item.variant === "string") list.push(item.variant);
  for (const v of item.variants || []) list.push(String(v));
  return list;
}

function matchesItem(match, item) {
  for (const [key, expected] of Object.entries(match)) {
    if (key === "variantIncludes") {
      if (!variantStrings(item).some((v) => v.includes(expected))) return false;
      continue;
    }
    if (item[key] !== expected) return false;
  }
  return true;
}

// ---- closure predicates -------------------------------------------------

function variantPropsString(variantProps) {
  return Object.entries(variantProps || {})
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

function evaluateInstanceBoundVariable(closure, capture) {
  const candidates = [];
  for (const frame of capture?.templateFrames || []) {
    for (const inst of frame.instances || []) {
      if (inst.component !== closure.component) continue;
      const variantName = variantPropsString(inst.variantProps);
      if (closure.variantIncludes && !variantName.includes(closure.variantIncludes)) continue;
      const bound = (inst.overrides || []).find((o) => o.property === "boundVariables");
      const target = bound?.value?.[closure.subProperty];
      candidates.push({
        frame: frame.name,
        variant: variantName,
        value: target && target.type === "VARIABLE_ALIAS" ? target.id : null,
      });
    }
  }
  if (candidates.length === 0) {
    return {
      state: "unknown",
      detail: `no ${closure.component} instance matching ${closure.variantIncludes || "any variant"} exists in this capture — the condition cannot be observed`,
    };
  }
  const met = candidates.filter((c) => c.value === closure.variableId);
  const seen = candidates.map((c) => `${c.frame} (${c.variant}): ${c.value || "unbound"}`).join("; ");
  return met.length > 0
    ? { state: "met", detail: `${met.map((c) => c.frame).join(", ")} now binds ${closure.subProperty} to ${closure.variableId}` }
    : { state: "open", detail: `still ${seen}` };
}

function evaluateComponentBindingValue(closure, capture) {
  const components = [...(capture?.components?.sets || []), ...(capture?.components?.standalone || [])];
  const component = components.find((c) => c.name === closure.component);
  if (!component) {
    return { state: "unknown", detail: `component ${closure.component} is absent from this capture — the condition cannot be observed` };
  }
  const seen = [];
  for (const variant of component.variants || []) {
    if (closure.variantIncludes && !String(variant.name).includes(closure.variantIncludes)) continue;
    for (const binding of variant.bindings || []) {
      if (binding.layer !== closure.layer || binding.property !== closure.property) continue;
      seen.push({ variant: variant.name, value: binding.value });
    }
  }
  if (seen.length === 0) {
    return {
      state: "unknown",
      detail: `${closure.component} has no ${closure.layer}.${closure.property} binding matching ${closure.variantIncludes || "any variant"} in this capture — the condition cannot be observed`,
    };
  }
  const met = seen.filter((s) => JSON.stringify(s.value) === JSON.stringify(closure.value));
  return met.length > 0
    ? { state: "met", detail: `${met.map((s) => s.variant).join(", ")} now binds ${closure.layer}.${closure.property} to ${JSON.stringify(closure.value)}` }
    : { state: "open", detail: `still ${seen.map((s) => `${s.variant}=${JSON.stringify(s.value)}`).join(", ")}` };
}

const CLOSURE_EVALUATORS = {
  instance_bound_variable: evaluateInstanceBoundVariable,
  component_binding_value: evaluateComponentBindingValue,
};

export function evaluateClosure(closure, capture) {
  if (!closure) return null;
  const evaluator = CLOSURE_EVALUATORS[closure.kind];
  if (!evaluator) throw new Error(`[annotations] unknown closure kind "${closure.kind}".`);
  const { state, detail } = evaluator(closure, capture);
  return { kind: closure.kind, description: closure.description, state, detail };
}

// ---- annotation ---------------------------------------------------------

// Attaches an annotation to every item a registry entry matches. The
// returned array is ALWAYS the same length as `items`, in the same order —
// this function classifies, it never filters. Each item gains:
//   classification — the ruling's class, or "drift" when no ruling speaks
//   annotation     — { id, ruling, state, reason, closure? } when one does
// Annotation states:
//   active                — the ruling describes this item; annotated
//   stale                 — expectValue no longer matches the capture's
//                           value, so the ratification covers a difference
//                           that is no longer the one in front of us
//   closure-condition-met — the awaited update landed; reconcile now
//   closure-unknown       — the closure predicate cannot be observed
export function annotateItems({ items, entries, capture }) {
  const registry = entries || [];
  return (items || []).map((item) => {
    const entry = registry.find((e) => e.lane === item.lane && matchesItem(e.match, item));
    if (!entry) return { ...item, classification: DEFAULT_CLASSIFICATION };

    const closure = evaluateClosure(entry.closure, capture);
    let state = "active";
    let reason = null;

    if (entry.expectValue !== undefined && item.value !== undefined && JSON.stringify(item.value) !== JSON.stringify(entry.expectValue)) {
      state = "stale";
      reason = `the ruling covers ${JSON.stringify(entry.expectValue)} but the capture now says ${JSON.stringify(item.value)} — re-ratify or fix`;
    } else if (closure?.state === "met") {
      state = "closure-condition-met";
      reason = `closure condition met — reconcile now (${closure.detail})`;
    } else if (closure?.state === "unknown") {
      state = "closure-unknown";
      reason = `closure condition could not be evaluated (${closure.detail})`;
    }

    return {
      ...item,
      classification: entry.classification,
      annotation: {
        id: entry.id,
        ruling: entry.ruling,
        state,
        ...(reason ? { reason } : {}),
        ...(closure ? { closure } : {}),
      },
    };
  });
}

// States that put an annotated item BACK in front of the operator. An
// annotation only quiets an item while it still describes reality.
const ACTIONABLE_ANNOTATION_STATES = new Set(["stale", "closure-condition-met", "closure-unknown"]);

export function splitByAction(items) {
  const needs_action = [];
  const annotated = [];
  for (const item of items || []) {
    const annotation = item.annotation;
    if (!annotation || ACTIONABLE_ANNOTATION_STATES.has(annotation.state)) needs_action.push(item);
    else annotated.push(item);
  }
  return { needs_action, annotated };
}

// THE ONE CALL EVERY LANE MAKES. A lane computes its differences exactly as
// if no ruling existed, then hands the whole list here — annotation and the
// needs-action/annotated split happen in one place so no lane can grow its
// own private suppression.
//
// UNMATCHED ANNOTATIONS are the mirror image of a suppressed item: a ruling
// that no longer matches ANY difference this sync. Left silent, a
// ratification outlives the thing it ratified (exactly how the PaginationPage
// update arrived unannounced), so each lane reports its own registry entries
// that matched nothing as `annotation_unmatched` rows — visible under
// annotated, stating that the exception looks spent and should be retired.
export function applyAnnotations({ items, entries, lane, capture }) {
  const laneEntries = (entries || []).filter((e) => e.lane === lane);
  const annotatedItems = annotateItems({ items, entries: laneEntries, capture });
  const matchedIds = new Set(annotatedItems.map((i) => i.annotation?.id).filter(Boolean));

  const unmatched = laneEntries
    .filter((entry) => !matchedIds.has(entry.id))
    .map((entry) => ({
      lane,
      type: "annotation_unmatched",
      classification: entry.classification,
      annotation: {
        id: entry.id,
        ruling: entry.ruling,
        state: "unmatched",
        reason: "matched no difference this sync — the difference it covers is gone; retire the annotation or check why the lane stopped seeing it",
        ...(entry.closure ? { closure: evaluateClosure(entry.closure, capture) } : {}),
      },
    }));

  const split = splitByAction(annotatedItems);
  return {
    items: annotatedItems,
    needs_action: split.needs_action,
    annotated: [...split.annotated, ...unmatched],
  };
}

// Display lines for an annotated item — every annotated item prints every
// sync, with its classification, its ruling, and its closure condition's
// current state. This is what "shows up every sync with its condition" means
// mechanically.
export function summarizeAnnotations(items) {
  return (items || []).map((item) => {
    const a = item.annotation || {};
    const closure = a.closure ? ` — closure: ${a.closure.description} [${a.closure.state}: ${a.closure.detail}]` : "";
    const reason = a.reason ? ` — ${a.reason}` : "";
    return `  [${item.classification}] ${describeItem(item)} — ${a.ruling} (${a.id})${closure}${reason}`;
  });
}

function describeItem(item) {
  const identity = [item.component, item.template, item.instance].filter(Boolean).join(" ");
  const field = [item.layer, item.property || item.prop, item.axis].filter(Boolean).join(".");
  const variant = item.variant ? ` (${item.variant})` : "";
  return `${item.type}: ${identity}${field ? ` ${field}` : ""}${variant}`.trim();
}
