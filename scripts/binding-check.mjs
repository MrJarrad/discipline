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

     Two OTHER assertion kinds share this schema by property-name shape
     alone — no separate discriminator field, so a Figma-side rename can't
     silently point an entry at the wrong lane:
       (a) a component-SET's own property default — property matches
           "name#nodeId:index" (Figma's own property-key format, e.g.
           "has-spacer-bottom#153:1"), resolved from
           componentSets[name=component].properties[property].defaultValue
           instead of a per-variant binding, then run through the SAME
           applyAssertion downstream as the ordinary lane.
       (b) an instance boundVariables alias TARGET — property starts with
           "boundVariables." (e.g. "boundVariables.height"), resolved by
           walking templateFrames[].instances[] (matched by `component`,
           filtered by `variant` against a "key=value, key2=value2" string
           built from the instance's own variantProps) for an
           overrides[] entry whose property is "boundVariables" and whose
           value[subProperty] is a { type: "VARIABLE_ALIAS", id }. This
           lane has no code-side counterpart to compare against (code
           references CSS custom properties, never a Figma variable id) —
           it checks the capture's alias id against entry.assertion.value's
           leading token instead of reading codeLocation at all.
     Routing precedence (runBindingCheck's main loop, checked in this
     order per entry): (b) boundVariables-prefixed property first, then
     (a) componentSet-property-shaped property, then the ordinary
     per-variant-binding lane last — property-name shape is checked before
     any capture lookup runs, so a name that happens to match more than one
     shape always resolves to the earliest-listed lane.
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
     entries[].assertion.figmaExpected — OPTIONAL, orthogonal to `kind`: the
     value figmaValue itself (not code) must equal, checked FIRST and
     independently of the code-side kind check (see applyAssertion /
     checkFigmaExpected). A plain "literal" assertion's `value` is an
     author-supplied code-side string that never looks at figmaValue at
     all — without figmaExpected, a Figma-side flip of the SOURCE property
     (e.g. componentSets[].properties[].defaultValue going true->false)
     ships silently, since the literal string in code hasn't changed
     (reviewer finding 2026-08-04, closed same session: HeroText
     has-spacer-bottom's map entry now carries
     `figmaExpected: true` alongside its literal code check, so either side
     drifting — Figma's default OR the code string — flags on its own
     terms, `figma-value-mismatch` vs `binding_mismatch`).
   entries[].ratifiedVariants — OPTIONAL array of { variant, value, citation }
     carving an operator-ratified divergence out of the defect surface,
     mirroring the plugin's RATIFIED_AXIS_EXCEPTIONS pattern (code.js
     ~1055). `variant` is a substring filter (same matching rule as
     entries[].variant); `value` is the exact binding value the ratification
     covers; `citation` is a MANDATORY, non-empty string naming the ruling —
     an entry with a ratifiedVariants item missing a citation is a map-lint
     error (thrown before any check runs), never silently accepted. Matches
     narrowed to a ratifiedVariants filter are pulled out of the ordinary
     variant-divergence/binding_mismatch comparison before it runs: a
     binding whose value equals the ratified `value` is downgraded to an
     informational `ratified[]` row (excluded from `defects`, kept in the
     summary); a binding narrowed to the same filter but carrying a
     DIFFERENT value is reported as a real `ratified-mismatch` defect —
     reality changed again, the ratification no longer holds, re-ratify or
     fix it. This keeps the actionable surface honest without deleting the
     check (capture-figma-primer.md §3's actionable-only-panel rule, same
     spirit applied to this checker's own output).

   THIRD LANE: this is the BINDING lane. There are two siblings —
   conformance-check.mjs (does a mapped token's resolved VALUE match?) and
   template-check.mjs (does the rendered page's block geometry/grid/
   computed-style match the DS Example templates?). Reviewers run all three
   before merging a visual/layout change — see template-check.mjs's header
   for the full integration note.
*/
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// Property-key format Figma uses for a component-SET's own properties (a
// BOOLEAN/TEXT/VARIANT default, not a per-variant layer binding) —
// "name#nodeId:index", e.g. "has-spacer-bottom#153:1". Distinguishes a
// componentSets[].properties lookup (assertion kind (a)) from the ordinary
// per-variant components.sets[].variants[].bindings lookup, without needing
// a new discriminator field on the map entry itself — the property NAME
// Figma already exports carries the discriminator.
const COMPONENT_SET_PROPERTY_RE = /#\d+:\d+$/;

// entry.property prefix identifying assertion kind (b): an instance's
// boundVariables alias TARGET (templateFrames[].instances[].overrides[]),
// not a components.sets[] layer binding — e.g. "boundVariables.height".
const BOUND_VARIABLE_PREFIX = "boundVariables.";

function isComponentSetProperty(property) {
  return COMPONENT_SET_PROPERTY_RE.test(property);
}

function isBoundVariableProperty(property) {
  return property.startsWith(BOUND_VARIABLE_PREFIX);
}

// Looks up a component-SET's own property default (assertion kind (a)):
// componentSets[name=component].properties[propertyKey].defaultValue.
// Returns undefined when the set or the property isn't found.
function lookupComponentSetProperty(componentSets, componentName, propertyKey) {
  const set = (componentSets || []).find((cs) => cs.name === componentName);
  const prop = set?.properties?.[propertyKey];
  return prop === undefined ? undefined : prop.defaultValue;
}

// Collects every instance boundVariables alias TARGET (assertion kind (b))
// for `subProperty` (e.g. "height") across every instance of `componentName`
// found in any templateFrame, optionally narrowed to instances whose
// variantProps — formatted as "key=value, key2=value2" to match the same
// substring-filter convention as a components.sets[] variant name — contain
// `variantFilter`. A boundVariables override's value is
// { [property]: { type: "VARIABLE_ALIAS", id } }; only alias entries are
// collected (a raw/unbound value has nothing to compare).
function collectBoundVariableMatches(templateFrames, componentName, subProperty, variantFilter) {
  const matches = [];
  for (const frame of templateFrames || []) {
    for (const inst of frame.instances || []) {
      if (inst.component !== componentName) continue;
      const variantName = Object.entries(inst.variantProps || {})
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      if (variantFilter && !variantName.includes(variantFilter)) continue;
      for (const override of inst.overrides || []) {
        if (override.property !== "boundVariables") continue;
        const target = override.value?.[subProperty];
        if (target && target.type === "VARIABLE_ALIAS" && typeof target.id === "string") {
          matches.push({ variantName, value: target.id, frame: frame.name });
        }
      }
    }
  }
  return matches;
}

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

// Runs entry.assertion against `figmaValue` and the file at entry's
// codeLocation, returning a defect object or undefined when it passes.
// Shared by every lane that ends in an ASSERTIONS[kind] check (the ordinary
// per-variant lane and the componentSets-property lane) so the
// missing-code-location / unsupported-assertion / binding_mismatch shapes
// stay identical regardless of where figmaValue came from.
// Optional figma-side check, orthogonal to the code-side ASSERTIONS check
// below: entry.assertion.figmaExpected, when present, is the value Figma's
// OWN resolved value (componentSets[].properties[].defaultValue today; any
// figmaValue-producing lane tomorrow) must equal. Closes the blind spot a
// plain "literal" assertion has on its own — a "literal" assertion's
// expected string is author-supplied and never derived from figmaValue, so
// it can't detect a Figma-side flip by itself (reviewer finding
// 2026-08-04: HeroText has-spacer-bottom's defaultValue flipping
// true->false in Figma produced zero defects since the code-side literal
// check never looked at figmaValue at all). figmaExpected is compared
// with strict equality — the property types this lane sees today
// (BOOLEAN, TEXT) are exact-match values, not tolerance-band numbers/colors
// like the value lane's tokens.
function checkFigmaExpected(entry, figmaValue) {
  const { component, layer, property, codeLocation } = entry;
  if (entry.assertion?.figmaExpected === undefined) return undefined;
  if (figmaValue === entry.assertion.figmaExpected) return undefined;
  return {
    component,
    layer,
    property,
    codeLocation,
    old: entry.assertion.figmaExpected,
    new: figmaValue,
    type: "figma-value-mismatch",
  };
}

function applyAssertion(entry, figmaValue, mappingPath) {
  const figmaDefect = checkFigmaExpected(entry, figmaValue);
  if (figmaDefect) return figmaDefect;

  const { component, layer, property, codeLocation } = entry;
  const codeFilePath = resolveCodeLocation(mappingPath, codeLocation);
  if (!existsSync(codeFilePath)) {
    return { component, layer, property, codeLocation, type: "missing-code-location" };
  }
  const assertionFn = ASSERTIONS[entry.assertion?.kind];
  if (!assertionFn) {
    return { component, layer, property, codeLocation, type: "unsupported-assertion", kind: entry.assertion?.kind };
  }
  const codeText = readFileSync(codeFilePath, "utf8");
  const { expected, found } = assertionFn(figmaValue, codeText, entry);
  if (!found) {
    return { component, layer, property, codeLocation, old: figmaValue, new: expected, type: "binding_mismatch" };
  }
  return undefined;
}

function resolveCodeLocation(mappingPath, codeLocation) {
  const repoRoot = dirname(dirname(resolve(mappingPath)));
  return join(repoRoot, codeLocation);
}

// Map-lint: every ratifiedVariants item must carry a non-empty citation.
// Runs before any check so a missing citation is caught as an authoring
// error, not silently accepted as an uncited exception.
function validateRatifications(entries) {
  for (const entry of entries) {
    for (const rv of entry.ratifiedVariants || []) {
      if (typeof rv.citation !== "string" || rv.citation.trim() === "") {
        throw new Error(
          `[binding-check] ratifiedVariants entry for ${entry.component} ${entry.layer}.${entry.property} (variant "${rv.variant}") is missing a citation — every ratification must cite the ruling it came from.`
        );
      }
    }
  }
}

// Splits a layer+property's variant matches into ratified vs. ordinary,
// per entry.ratifiedVariants. Ratified matches whose value equals the
// ratification's expected value are pulled out entirely (reported via
// `ratified`, never `defects`); ratified matches whose value has since
// diverged are reported as a `ratified-mismatch` defect (the ratification
// no longer describes reality) and also excluded from the ordinary
// divergence comparison, since they're already flagged on their own terms.
function splitRatifiedMatches(matches, ratifiedVariants) {
  const ordinary = [];
  const ratified = [];
  const mismatched = [];
  for (const match of matches) {
    const rule = (ratifiedVariants || []).find((rv) => match.variantName.includes(rv.variant));
    if (!rule) {
      ordinary.push(match);
    } else if (JSON.stringify(match.value) === JSON.stringify(rule.value)) {
      ratified.push({ ...match, citation: rule.citation });
    } else {
      mismatched.push({ ...match, citation: rule.citation, expected: rule.value });
    }
  }
  return { ordinary, ratified, mismatched };
}

export function runBindingCheck({ capturePath, mappingPath }) {
  if (!existsSync(capturePath)) throw new Error(`capture file not found: ${capturePath}`);
  if (!existsSync(mappingPath)) throw new Error(`mapping file not found: ${mappingPath}`);

  const capture = JSON.parse(readFileSync(capturePath, "utf8"));
  const mapping = JSON.parse(readFileSync(mappingPath, "utf8"));
  const index = buildComponentIndex(capture.components);

  const entries = mapping.components?.entries || [];
  validateRatifications(entries);

  const defects = [];
  const ratified = [];
  let checkedCount = 0;

  for (const entry of entries) {
    const { component, layer, property, variant, codeLocation } = entry;
    checkedCount++;

    // Assertion kind (b): an instance boundVariables alias TARGET
    // (templateFrames[].instances[].overrides[]) — no components.sets[]
    // binding to walk, and no code-side representation to compare against
    // (the code is CSS custom properties, not variable ids), so this lane
    // checks the capture against the map's own expected id instead of code.
    if (isBoundVariableProperty(property)) {
      const subProperty = property.slice(BOUND_VARIABLE_PREFIX.length);
      const matches = collectBoundVariableMatches(capture.templateFrames, component, subProperty, variant);
      if (matches.length === 0) {
        defects.push({ component, layer, property, variant, codeLocation, type: "missing-figma-binding" });
        continue;
      }
      const expectedId = String(entry.assertion?.value ?? "").split(/\s+/)[0];
      const found = matches.some((m) => m.value === expectedId);
      if (!found) {
        defects.push({
          component,
          layer,
          property,
          codeLocation,
          old: expectedId,
          new: matches.map((m) => `${m.variantName}:${m.value}`).join(", "),
          type: "binding_mismatch",
        });
      }
      continue;
    }

    // Assertion kind (a): a component-SET's own property default
    // (componentSets[].properties), not a per-variant layer binding — same
    // downstream code-comparison (applyAssertion) as the ordinary lane
    // below, just a different source for figmaValue.
    if (isComponentSetProperty(property)) {
      const defaultValue = lookupComponentSetProperty(capture.componentSets, component, property);
      if (defaultValue === undefined) {
        defects.push({ component, layer, property, codeLocation, type: "missing-figma-binding" });
        continue;
      }
      const defect = applyAssertion(entry, defaultValue, mappingPath);
      if (defect) defects.push(defect);
      continue;
    }

    const comp = index.get(component);
    if (!comp) {
      defects.push({ component, layer, property, codeLocation, type: "missing-figma-component" });
      continue;
    }

    const allMatches = collectBindingValues(comp, layer, property, variant);
    if (allMatches.length === 0) {
      defects.push({ component, layer, property, variant, codeLocation, type: "missing-figma-binding" });
      continue;
    }

    const { ordinary: matches, ratified: ratifiedMatches, mismatched } = splitRatifiedMatches(
      allMatches,
      entry.ratifiedVariants
    );

    for (const m of ratifiedMatches) {
      ratified.push({ component, layer, property, variant: m.variantName, value: m.value, citation: m.citation });
    }
    for (const m of mismatched) {
      defects.push({
        component,
        layer,
        property,
        variant: m.variantName,
        codeLocation,
        old: m.expected,
        new: m.value,
        citation: m.citation,
        type: "ratified-mismatch",
      });
    }

    if (matches.length === 0) {
      // Every match for this (layer, property) was covered by a
      // ratification (matched or mismatched) — nothing ordinary left to
      // check against code.
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

    const defect = applyAssertion(entry, figmaValue, mappingPath);
    if (defect) defects.push(defect);
  }

  const ok = defects.length === 0;
  const summaryLines = [`Binding check: ${checkedCount} entries checked, ${defects.length} defects, ${ratified.length} ratified.`];
  for (const d of defects) {
    if (d.type === "binding_mismatch") {
      summaryLines.push(`  [binding_mismatch] ${d.component} ${d.layer}.${d.property}: figma expects "${d.old}" ("${d.new}") missing from ${d.codeLocation}`);
    } else if (d.type === "figma-value-mismatch") {
      summaryLines.push(`  [figma-value-mismatch] ${d.component} ${d.layer}.${d.property}: map expects figma default "${d.old}" but the capture now says "${d.new}" — Figma-side drift`);
    } else if (d.type === "ratified-mismatch") {
      summaryLines.push(`  [ratified-mismatch] ${d.component} ${d.layer}.${d.property} (${d.variant}): ratified "${d.old}" (${d.citation}) but figma now says "${d.new}" — ratification no longer holds`);
    } else {
      summaryLines.push(`  [${d.type}] ${d.component} ${d.layer ?? ""}.${d.property ?? ""} (${d.codeLocation})`);
    }
  }
  for (const r of ratified) {
    summaryLines.push(`  [ratified] ${r.component} ${r.layer}.${r.property} (${r.variant}): "${r.value}" — ${r.citation}`);
  }
  return { ok, defects, ratified, summary: summaryLines.join("\n") };
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
