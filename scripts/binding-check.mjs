#!/usr/bin/env node
/* binding-check — reads a Figma capture's per-component LAYER BINDINGS
   (components.sets[].variants[].bindings — which token/variant/style each
   layer of a component instance consumes) + a figma-map.json "components"
   section, and reports where the mapped code's actual binding disagrees
   with what Figma's variants declare.

   This is a SEPARATE lane from conformance-check.mjs's value lane, by
   design: the value lane asks "does this token's resolved VALUE match?";
   this lane asks "does this layer bind to the same NAMED token/variant/
   style Figma says it should?" — a component can pass every value check
   and still be wrong if a layer quietly rebinds to a different step (the
   hero bug this lane exists to catch: the layer's value output looked
   fine, its resolved SIZE was the mismatch, because it was reading the
   wrong step of the ramp). Different failure taxonomy, different
   extraction (grep a literal/class-name assertion vs. resolve+normalize a
   CSS value), so a separate deep module keeps each lane's contract small
   instead of overloading one script with two comparison strategies.

   Interface (deep module — small surface):

     runBindingCheck({ capturePath, mappingPath })
       -> { ok, defects, summary }

   Mapping schema (figma-map.json "components" section):
     { "components": {
         "entries": [
           { component, layer, property, variant?, codeLocation, assertion }
         ],
         "unmappable": [ { component, reason } ]   // documentation only,
                                                     // never checked
     } }

   entries[].component  — a components.sets[] or components.standalone[]
     name in the capture (Figma's own name, including a leading "." for
     private components).
   entries[].layer / property — identifies the binding within each variant
     (variants[].bindings[] entries carry {layer, property, value}).
   entries[].variant — OPTIONAL substring match against a variant's `name`
     (e.g. "device=sm"). When omitted, ALL of the component's variants must
     carry an identical value for (layer, property) — a component-level
     binding that's constant regardless of variant. When variants disagree
     and no `variant` filter narrows them to one, that's a defect in its
     own right (the map's assumption of a single constant binding no longer
     holds) rather than a silent pick-one.
   entries[].codeLocation — relative to the mapping file's GRANDPARENT
     directory (same convention as conformance-check.mjs).
   entries[].assertion — { kind: "css-class" } derives the expected string
     from the Figma value itself (e.g. "title-style1/300" -> the literal
     substring "title-style1-300", Figma's "/" step separator rewritten to
     the CSS-class "-" convention) — no value duplicated into the map, so a
     Figma-side restep is caught automatically without editing the map.
     { kind: "literal", value } checks an explicit author-supplied literal
     substring instead, for bindings with no mechanical Figma-value ->
     code-string transform (an instance swap, a CSS var reference, a prop
     default) — extend with new kinds as new code shapes need support,
     mirroring conformance-check.mjs's EXTRACTORS enum.

   THIRD LANE: this is the BINDING lane. There are two siblings —
   conformance-check.mjs (does a mapped token's resolved VALUE match?) and
   template-check.mjs (does the rendered page's block geometry/grid/
   computed-style match the DS Example templates?). Reviewers run all three
   before merging a visual/layout change — see template-check.mjs's header
   for the full integration note.
*/
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function buildComponentIndex(components) {
  const index = new Map(); // name -> component (set or standalone)
  for (const c of components?.standalone || []) index.set(c.name, c);
  for (const c of components?.sets || []) index.set(c.name, c);
  return index;
}

// Collects every (variant, value) pair for a given layer+property across a
// component's variants, optionally narrowed to variants whose `name`
// contains `variantFilter` as a substring.
function collectBindingValues(component, layer, property, variantFilter) {
  const matches = [];
  for (const variant of component.variants || []) {
    if (variantFilter && !variant.name.includes(variantFilter)) continue;
    for (const binding of variant.bindings || []) {
      if (binding.layer === layer && binding.property === property) {
        matches.push({ variantName: variant.name, value: binding.value });
      }
    }
  }
  return matches;
}

// Figma textStyle/style values are authored "name/step" (e.g.
// "title-style1/300"); code's Tailwind class convention rewrites the "/"
// step separator to "-" (e.g. "title-style1-300"). This is the one
// mechanical, lossless transform every "css-class" entry relies on.
function figmaValueToCssClass(value) {
  return String(value).replace(/\//g, "-");
}

const ASSERTIONS = {
  "css-class": (figmaValue, codeText) => {
    const expected = figmaValueToCssClass(figmaValue);
    return { expected, found: codeText.includes(expected) };
  },
  literal: (figmaValue, codeText, entry) => {
    const expected = entry.assertion.value;
    return { expected, found: codeText.includes(expected) };
  },
};

function resolveCodeLocation(mappingPath, codeLocation) {
  const repoRoot = dirname(dirname(resolve(mappingPath)));
  return join(repoRoot, codeLocation);
}

export function runBindingCheck({ capturePath, mappingPath }) {
  if (!existsSync(capturePath)) throw new Error(`capture file not found: ${capturePath}`);
  if (!existsSync(mappingPath)) throw new Error(`mapping file not found: ${mappingPath}`);

  const capture = JSON.parse(readFileSync(capturePath, "utf8"));
  const mapping = JSON.parse(readFileSync(mappingPath, "utf8"));
  const index = buildComponentIndex(capture.components);

  const entries = mapping.components?.entries || [];
  const defects = [];
  let checkedCount = 0;

  for (const entry of entries) {
    const { component, layer, property, variant, codeLocation } = entry;
    checkedCount++;

    const comp = index.get(component);
    if (!comp) {
      defects.push({ component, layer, property, codeLocation, type: "missing-figma-component" });
      continue;
    }

    const matches = collectBindingValues(comp, layer, property, variant);
    if (matches.length === 0) {
      defects.push({ component, layer, property, variant, codeLocation, type: "missing-figma-binding" });
      continue;
    }

    const distinctValues = [...new Set(matches.map((m) => JSON.stringify(m.value)))];
    if (distinctValues.length > 1) {
      defects.push({
        component,
        layer,
        property,
        variant,
        codeLocation,
        type: "variant-divergence",
        detail: matches.map((m) => `${m.variantName}=${m.value}`).join(", "),
      });
      continue;
    }

    const figmaValue = matches[0].value;

    const codeFilePath = resolveCodeLocation(mappingPath, codeLocation);
    if (!existsSync(codeFilePath)) {
      defects.push({ component, layer, property, codeLocation, type: "missing-code-location" });
      continue;
    }

    const assertionFn = ASSERTIONS[entry.assertion?.kind];
    if (!assertionFn) {
      defects.push({ component, layer, property, codeLocation, type: "unsupported-assertion", kind: entry.assertion?.kind });
      continue;
    }

    const codeText = readFileSync(codeFilePath, "utf8");
    const { expected, found } = assertionFn(figmaValue, codeText, entry);
    if (!found) {
      defects.push({
        component,
        layer,
        property,
        codeLocation,
        old: figmaValue,
        new: expected,
        type: "binding_mismatch",
      });
    }
  }

  const ok = defects.length === 0;
  const summaryLines = [`Binding check: ${checkedCount} entries checked, ${defects.length} defects.`];
  for (const d of defects) {
    if (d.type === "binding_mismatch") {
      summaryLines.push(`  [binding_mismatch] ${d.component} ${d.layer}.${d.property}: figma expects "${d.old}" ("${d.new}") missing from ${d.codeLocation}`);
    } else {
      summaryLines.push(`  [${d.type}] ${d.component} ${d.layer ?? ""}.${d.property ?? ""} (${d.codeLocation})`);
    }
  }
  return { ok, defects, summary: summaryLines.join("\n") };
}

// ---- CLI --------------------------------------------------------------

function isMainModule() {
  return import.meta.url === `file://${process.argv[1]}`;
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  const getArg = (flag, fallback) => {
    const idx = args.indexOf(flag);
    return idx === -1 ? fallback : args[idx + 1];
  };
  const capturePath = getArg(
    "--capture",
    join(process.env.HOME, "JHD", "captures", "live", "jhd-spec-designsystem-variables-styles.json")
  );
  const mappingPath = getArg("--map", join(process.env.HOME, "JHD", "portfolio", "design", "figma-map.json"));

  try {
    const result = runBindingCheck({ capturePath, mappingPath });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(`[binding-check] ${err.message}`);
    process.exit(2);
  }
}
