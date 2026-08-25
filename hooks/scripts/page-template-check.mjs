#!/usr/bin/env node
/* page-template-check — FOURTH conformance lane: does a page's call-site
   expectation (the props a route passes into a template's instances) agree
   with the READY_FOR_DEV Figma template's own resolved per-device
   variantProps/properties?

   Born 2026-08-02 (vault projects/capture-figma/decisions/page-template-
   conformance-lane-2026-08-02.md): the /projects audit found 5 real
   divergences (D-Projects height, two LayoutGrid columns mismatches, two
   has-spacer-* booleans) that conformance-check.mjs (token VALUE lane) and
   binding-check.mjs (component BINDING lane) are structurally blind to —
   both operate at component level; nothing previously diffed "what a page
   passes" against "what the ready-for-dev template resolves."

   SCOPE RULE (operator signal 2026-08-02): "ready for dev" IS the contract
   activation. Only templateFrames whose devStatus.type === "READY_FOR_DEV"
   participate — a template with no devStatus (null, the plugin's null-is-
   unknown default, capture-figma-primer.md §3) or any other status is
   exempt, never flagged, since a work-in-progress design isn't a contract
   yet. A map entry naming a template that genuinely doesn't exist in the
   capture at all is still a defect (missing-figma-template) — "not ready"
   and "not there" are different failure shapes.

   Interface (deep module — small surface):

     runPageTemplateCheck({ capturePath, mappingPath }) -> { ok, defects, ratified, summary }

   Mapping schema (page-template-map.json — a standalone sibling file, same
   convention as template-map.example.json for template-check.mjs's map;
   NOT the same file or key as that lane's "templates" section, a different
   lane with a different shape):

     { "$schema": "page-template-map/v1",
       "entries": [
         { "template", "instance", "prop", "expect", "citation"?, "ratifiedVariants"? }
       ],
       "unmappable": [ { template, reason } ]   // documentation only, never checked
     }

   entries[].template  — a templateFrames[] `name` in the capture (e.g.
     "D - Projects" — device-prefixed, since D-/M- Example frames are
     separate templateFrames entries).
   entries[].instance  — a `name` among that frame's instances[].
   entries[].prop       — a key to look up first in the instance's
     variantProps, falling back to properties (the split buildTemplateFrames
     already performs — see schema-v2-transform.mjs).
   entries[].expect     — the page call-site's asserted literal value for
     that prop. Map-asserted, not source-parsed (spec's explicit design
     call, mirroring binding-check.mjs's literal assertion kind) — no code
     file is read; the map itself carries the expectation as data. A Figma-
     side change is caught automatically because the FIGMA side is always
     re-read fresh; only the page's own committed intent lives in the map.
   entries[].ratifiedVariants — OPTIONAL array of { value, citation },
     mirroring binding-check.mjs's ratifiedVariants pattern: an operator-
     ratified divergence between the map's `expect` and the template's
     actual resolved value. `citation` is MANDATORY, non-empty — an entry
     missing one is a map-lint error thrown before any check runs (same
     validateRatifications discipline as binding-check.mjs). A resolved
     value equal to a ratification's `value` is downgraded to an
     informational `ratified[]` row (excluded from defects); one that no
     longer matches (Figma moved again) is a `ratified-mismatch` defect —
     the ratification no longer holds.

   FOURTH LANE: siblings are conformance-check.mjs (VALUE — does a mapped
   token's resolved value match?), binding-check.mjs (BINDING — does a
   layer bind to the named token/variant?), template-check.mjs (rendered-
   DOM geometry against a DS-Example-derived spec). This lane is the only
   one comparing a PAGE's call-site props against a template's resolved
   variantProps directly off the capture — no browser, no rendered DOM.
   Reviewers run all four before merging a visual/layout change.

   EXAMPLE map header (portfolio's real map is a separate dispatch — this
   is illustrative only):
     { "$schema": "page-template-map/v1",
       "entries": [
         { "template": "D - Projects", "instance": "ProjectsGrid", "prop": "height", "expect": "large" },
         { "template": "D - Projects", "instance": "LayoutGrid", "prop": "columns", "expect": "4" }
       ] }
*/
import { readFileSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { applyAnnotations, loadAnnotationRegistry, summarizeAnnotations } from "./annotations.mjs";

function buildFrameIndex(templateFrames) {
  const index = new Map(); // name -> frame (only READY_FOR_DEV frames)
  const allNames = new Set();
  for (const frame of templateFrames || []) {
    allNames.add(frame.name);
    if (frame.devStatus?.type === "READY_FOR_DEV") {
      index.set(frame.name, frame);
    }
  }
  return { index, allNames };
}

function findInstance(frame, instanceName) {
  return (frame.instances || []).find((inst) => inst.name === instanceName) || null;
}

// prop is looked up in variantProps first (the common case — height,
// columns, device — buildTemplateFrames's own split), falling back to
// properties (booleans like has-spacer-top, text/instance-swap values).
// Returns { found, value }, distinguishing "found undefined" from "not
// present at all" so a genuinely-absent prop is its own defect type.
function resolveInstanceProp(instance, prop) {
  if (Object.prototype.hasOwnProperty.call(instance.variantProps || {}, prop)) {
    return { found: true, value: instance.variantProps[prop] };
  }
  if (Object.prototype.hasOwnProperty.call(instance.properties || {}, prop)) {
    return { found: true, value: instance.properties[prop] };
  }
  return { found: false, value: undefined };
}

// Map-lint for the RETIRED ratifiedVariants field (operator ruling
// 2026-08-14, annotate-never-suppress). It no longer diverts anything out of
// the comparison; a map still carrying it is carrying a ruling in the wrong
// place, reported as an item rather than thrown so the lane still runs. Same
// discipline as binding-check.mjs's retiredMapFieldItems.
function retiredMapFieldItems(entries) {
  const items = [];
  for (const entry of entries) {
    for (const rv of entry.ratifiedVariants || []) {
      items.push({
        lane: "map-lint",
        type: "retired_map_field",
        template: entry.template,
        instance: entry.instance,
        prop: entry.prop,
        detail: `ratifiedVariants is retired (operator ruling 2026-08-14, annotate-never-suppress) and no longer suppresses anything — move "${rv.citation}" into scripts/annotations-registry.json as an annotation and delete the field from the map.`,
      });
    }
  }
  return items;
}

const DEFAULT_ANNOTATIONS_PATH = new URL("./annotations-registry.json", import.meta.url).pathname;

function valuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function runPageTemplateCheck({ capturePath, mappingPath, annotationsPath = DEFAULT_ANNOTATIONS_PATH }) {
  if (!existsSync(capturePath)) throw new Error(`capture file not found: ${capturePath}`);
  if (!existsSync(mappingPath)) throw new Error(`mapping file not found: ${mappingPath}`);

  const capture = JSON.parse(readFileSync(capturePath, "utf8"));
  const mapping = JSON.parse(readFileSync(mappingPath, "utf8"));
  const { index: readyFrames, allNames } = buildFrameIndex(capture.templateFrames);

  const entries = mapping.entries || [];
  const annotationEntries = loadAnnotationRegistry(annotationsPath);

  // Every difference this lane finds, before any ruling is consulted.
  const defects = retiredMapFieldItems(entries);
  let checkedCount = 0;
  let notReadyCount = 0;

  for (const entry of entries) {
    const { template, instance, prop, expect } = entry;

    const frame = readyFrames.get(template);
    if (!frame) {
      if (allNames.has(template)) {
        // Exists in the capture but not READY_FOR_DEV — out of this lane's
        // scope, not a suppressed difference: a work-in-progress design isn't
        // a contract yet, so there is nothing to compare against. Counted and
        // stated in the summary rather than passed over in silence.
        notReadyCount++;
        continue;
      }
      defects.push({ template, instance, prop, type: "missing-figma-template" });
      continue;
    }

    checkedCount++;

    const inst = findInstance(frame, instance);
    if (!inst) {
      defects.push({ template, instance, prop, type: "missing-figma-instance" });
      continue;
    }

    const { found, value } = resolveInstanceProp(inst, prop);
    if (!found) {
      defects.push({ template, instance, prop, type: "missing-figma-prop" });
      continue;
    }

    // EVERY mismatch is emitted (operator ruling 2026-08-14): the previous
    // implementation matched entry.ratifiedVariants HERE and `continue`d, so
    // a ratified value never reached the defect list at all. Rulings are
    // applied once, after the comparison, through applyAnnotations.
    if (!valuesEqual(value, expect)) {
      defects.push({
        template,
        instance,
        prop,
        old: expect,
        new: value,
        value,
        nodeId: inst.id || null,
        type: "page_template_mismatch",
      });
    }
  }

  const { items, needs_action, annotated } = applyAnnotations({
    items: defects.map((d) => ({ lane: "page-template", ...d })),
    entries: annotationEntries,
    lane: "page-template",
    capture,
  });

  const ok = needs_action.length === 0;
  const summaryLines = [
    `Page-template check: ${checkedCount} entries checked, ${needs_action.length} needing action, ${annotated.length} annotated, ${notReadyCount} entries skipped (template not READY_FOR_DEV).`,
    ...(needs_action.length ? ["NEEDS ACTION:"] : []),
  ];
  for (const d of needs_action) {
    if (d.type === "page_template_mismatch") {
      summaryLines.push(`  [page_template_mismatch] ${d.template} ${d.instance}.${d.prop}: page expects "${d.old}" but the template resolves "${d.new}" (${d.nodeId})`);
    } else if (d.annotation) {
      summaryLines.push(`  [${d.classification}] ${d.type} ${d.template} ${d.instance ?? ""}.${d.prop ?? ""} — ${d.annotation.reason} (${d.annotation.ruling})`);
    } else {
      summaryLines.push(`  [${d.type}] ${d.template} ${d.instance ?? ""}.${d.prop ?? ""}${d.detail ? ` — ${d.detail}` : ""}`);
    }
  }
  if (annotated.length) {
    summaryLines.push("ANNOTATED (reported every sync, no action while the ruling holds):");
    summaryLines.push(...summarizeAnnotations(annotated));
  }
  return { ok, items, needs_action, annotated, summary: summaryLines.join("\n") };
}

// ---- CLI --------------------------------------------------------------

// realpath-normalizes both sides before comparing: import.meta.url resolves
// symlinks (e.g. macOS's /tmp -> /private/tmp) while process.argv[1] does
// not, so a script invoked through a symlinked path used to fail this check
// and silently no-op its CLI block. Falls back to the raw path if realpath
// itself fails (e.g. a path that no longer exists).
function isMainModule() {
  const realpath = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  };
  const invoked = process.argv[1];
  return Boolean(invoked) && realpath(fileURLToPath(import.meta.url)) === realpath(invoked);
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  const getArg = (flag, fallback) => {
    const idx = args.indexOf(flag);
    return idx === -1 ? fallback : args[idx + 1];
  };
  const capturePath = getArg(
    "--capture",
    join(process.env.HOME, "JHD", "figma-plugins", "main", "capture-figma", "captures", "live", "jhd-spec-designsystem-variables-styles.json")
  );
  const mappingPath = getArg("--map", join(process.env.HOME, "JHD", "portfolio", "design", "page-template-map.json"));

  try {
    const result = runPageTemplateCheck({ capturePath, mappingPath, annotationsPath: getArg("--annotations", DEFAULT_ANNOTATIONS_PATH) });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(`[page-template-check] ${err.message}`);
    process.exit(2);
  }
}
