#!/usr/bin/env node
/* template-check — THIRD conformance lane, geometry/structure (the value lane
   and binding lane check only mapped tokens/bindings; this lane measures the
   built site's actual rendered layout against the DS Example templates'
   geometry, catching defects the other two lanes are structurally blind to).

   Renders the built site's template pages via Playwright at each configured
   viewport, and for each top-level block instance measures:
     (a) bounding rect vs expected geometry (a TEMPLATE SPEC, checked in,
         derived from the DS Examples inventory)
     (b) grid conformance — a flagged block's child cells' x/width, snapped
         to the 12-col grid computed from the LIVE page's own --grid-margin/
         --grid-gap custom properties at that viewport (never hardcoded —
         a token restep is picked up automatically)
     (c) computed style probes per block role (nav background transparency,
         spacer heights, font-size steps, ...)
     (d) outer spacer state (spacerTop/spacerBottom) per block instance

   OPINION GRADIENT (design-system-opinion-gradient.md, ratified 2026-07-29 —
   read this before editing template-spec.json or this file):
     (a) A TEMPLATE is a page layout, the top of the gradient: ALL the
         opinion. The Example frame's RESOLVED INSTANCE STATE — every
         override already applied — IS the spec. A per-instance override in
         the spec is the layout's rightful opinion, never drift to reconcile
         toward some lower-level "default".
     (b) AXIS OWNERSHIP: `device` is the one axis a BLOCK owns (its own
         internal adaptation — e.g. NavigationHeader always renders both its
         fixed top bar and its mobile-nav pill in the DOM; CSS breakpoints
         just hide one — see navigation-header.tsx). Every other axis belongs
         to the LAYOUT, one opinion per axis, so a template's D-/M- Example
         frames are ONE layout opinion rendered twice. evaluateDevicePairing
         checks this: same block sequence (minus any block marked
         `deviceOnly: true` — that block's presence IS its own device
         chrome, not a layout decision) and the same non-geometry props
         (styleProbes) on every role shared by both sides. A content-driven
         block (any geometry field "content") is exempt from the sequence
         check too — its repeat count is real-project-driven, not a fixed
         layout opinion, so the D/M Example frames may legitimately demo a
         different count.
     (c) SPACERS: a block's outer spacerTop/spacerBottom is itself a layout
         opinion (token-rulings.md "Blocks carry OUTER spacers; default
         spacer-top = FALSE", 2026-07-29) — the component's own default is
         off; a template only turns one on where the layout needs the gap.
         evaluateSpacerState checks a spec block's declared spacerTop/
         spacerBottom (when present — omitted stays unchecked, the schema's
         standing convention) against the live DOM's actual first/last-child
         `[data-kind="space-vertical"]` presence.
     (d) NAVIGATIONHEADER FILL: its Figma fill is bound-but-unused
         (capability-present-unused, token-rulings.md 2026-07-29) — code
         renders no background on any route. The background-color
         styleProbe expects "transparent" everywhere navigation-header is
         checked; that is the ruling working as intended, not a bug to
         "fix" by asserting a real color.

   Interface (deep module — small surface; the measurement mechanics below
   are all implementation):

     computeGridColumns({ viewportWidth, margin, gap, columns }) -> grid
     evaluateGridConformance({ gridChecks, measuredCells, grid, tolerancePx }) -> defects
     compareBlockGeometry({ blocks, measuredBlocks }) -> defects
     evaluateSpacerState({ blocks, measuredBlocks }) -> defects
     evaluateStyleProbes({ probes, measuredStyles }) -> defects
     evaluateDevicePairing({ templateD, templateM, templateId }) -> defects
       (spec-level, not tied to any live capture — one layout opinion per
       axis across a template's D-/M- pair; see rule (b) above)
     deriveDevicePairs(templates) -> Map<baseName, { D: templateId, M: templateId }>
     computeTemplateDefects({ template, templateId, route, viewportName, measured }) -> defects
       (composes the per-capture pure checks above against one route x
       viewport capture; evaluateDevicePairing runs separately, once per
       spec, not per capture — see runTemplateCheck)
     runTemplateCheck({ specPath, mapPath, baseUrl, startServerDir, measureImpl }) -> { ok, defects, summary }
       (impure orchestrator: reads spec+map, optionally starts a server,
       drives Playwright (or an injected measureImpl — the test seam) per
       route x viewport, runs evaluateDevicePairing once per D/M pair in the
       spec, and appends a `templates` envelope to conformance.jsonl; never
       throws on a defect, only on a hard config error, mirroring
       conformance-check.mjs/binding-check.mjs)

   TEMPLATE SPEC schema (template-spec.json, see scripts/template-spec.json
   for the checked-in DS-Example-derived spec):
     { "$schema": "template-spec/v1",
       "templates": {
         "<templateId>": {
           "viewport": "<viewport name, e.g. D | M>",
           "blocks": [
             { "role", "index"?, "y"?, "x"?, "height"?, "width"?, "tolerance"?,
               "spacerTop"?, "spacerBottom"?, "deviceOnly"? }
           ],
           "gridChecks": [ { "role", "cellSelector" } ],
           "styleProbes": [ { "role", "index"?, "property", "expected", "tolerance"? } ]
         }
       }
     }
   A block/probe field valued the literal string "content" is CONTENT-DRIVEN
   (its real value depends on user content, e.g. a card row's height varying
   with project count/media aspect) and is always skipped, never a defect.

   TEMPLATES MAP schema (a "templates" section in figma-map.json, or a
   sibling templates.json — either is valid; the CLI's --map flag just needs
   to resolve to a file carrying this shape):
     { "templates": {
         "viewports": [ { "name", "width", "height" } ],
         "routes": [ { "route", "templates": { "<viewport name>": "<templateId>" } } ]
       }
     }

   ROLE -> DOM CONVENTION: a block's role string is looked up in the live DOM
   via `[data-kind="<role>"]` (the codebase's own component-root convention —
   see navigation-header.tsx/hero-text.tsx/etc.) unless a spec entry supplies
   an explicit `selector` override. Multiple DOM matches for one role are
   measured in document order and addressed by `index` (0-based); a spec
   entry with no `index` addresses the first (index 0) match.

   REVIEWER INTEGRATION — run all THREE conformance lanes before merging any
   visual/layout change, not just the one this diff seems to touch (a token
   rename can pass the value lane and still break geometry, and vice versa):
     1. conformance-check.mjs — value lane (mapped token -> resolved Figma
        value, per mode)
     2. binding-check.mjs     — binding lane (mapped component layer -> the
        named token/variant/style Figma's own bindings declare)
     3. template-check.mjs    — THIS geometry/structure lane (rendered block
        geometry + grid conformance + computed style probes vs the DS
        Example templates)
   All three append to the same ~/JHD/captures/live/conformance.jsonl sink
   (keyed `binding`/`templates` alongside the value lane's own top-level
   ok/defects/summary — see each script's own header for its exact shape).

   NOT WIRED INTO THE LISTENER: conformance-check.mjs/binding-check.mjs run
   automatically off capture-listener.mjs's live Figma-variable sync hook (opt-
   in via CONFORMANCE_MAP_PATH). This lane deliberately does NOT hook in there
   — it needs a running instance of the BUILT SITE (a dev/build server,
   Playwright, real page loads), which the listener's sync-time hook has no
   business spinning up. Invoke this lane manually or from a merge gate only:
     node template-check.mjs --map <figma-map> --spec <template-spec> \
       --base-url <server>   (or --start-server <repo-dir> to have it start
       one itself, on the first free port from --port, default 3230).
*/
import { readFileSync, existsSync, appendFileSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// ---- grid math -------------------------------------------------------------

// Standard equal-width N-column grid: contentWidth excludes the two outer
// margins; (N-1) gaps sit between N columns inside that content width.
export function computeGridColumns({ viewportWidth, margin, gap, columns = 12 }) {
  const contentWidth = viewportWidth - 2 * margin;
  const totalGap = gap * (columns - 1);
  const colWidth = (contentWidth - totalGap) / columns;
  const cols = [];
  for (let i = 0; i < columns; i++) {
    cols.push({ index: i, x: margin + i * (colWidth + gap), width: colWidth });
  }
  return { colWidth, margin, gap, columns: cols };
}

// Snaps a measured cell's x/width to the nearest whole-column boundary on
// `grid` (from computeGridColumns) and flags it when the nearest snap is
// still further than `tolerancePx` away — the "a non-token pixel value
// pushed this cell off-grid" defect. A cell spanning N columns has
// width = N*colWidth + (N-1)*gap; that's inverted here to find the nearest
// integer span rather than requiring the spec to pre-declare one.
function snapToGrid(x, width, grid) {
  const { colWidth, gap, margin, columns } = grid;
  const step = colWidth + gap;
  const startCol = Math.round((x - margin) / step);
  const expectedX = margin + startCol * step;
  const spanCols = Math.max(1, Math.round((width + gap) / step));
  const expectedWidth = spanCols * colWidth + (spanCols - 1) * gap;
  return {
    startCol: Math.min(Math.max(startCol, 0), columns.length - 1),
    spanCols,
    expectedX,
    expectedWidth,
    deltaXPx: Math.abs(x - expectedX),
    deltaWidthPx: Math.abs(width - expectedWidth),
  };
}

export function evaluateGridConformance({ gridChecks, measuredCells, grid, tolerancePx = 2 }) {
  const defects = [];
  for (const check of gridChecks || []) {
    const cells = measuredCells.filter((c) => c.role === check.role && (check.index === undefined || c.index === check.index));
    for (const cell of cells) {
      const snap = snapToGrid(cell.x, cell.width, grid);
      if (snap.deltaXPx > tolerancePx || snap.deltaWidthPx > tolerancePx) {
        defects.push({
          type: "grid-misaligned",
          role: cell.role,
          index: cell.index,
          x: cell.x,
          width: cell.width,
          expectedX: snap.expectedX,
          expectedWidth: snap.expectedWidth,
          deltaXPx: Number(snap.deltaXPx.toFixed(2)),
          deltaWidthPx: Number(snap.deltaWidthPx.toFixed(2)),
        });
      }
    }
  }
  return defects;
}

// ---- block geometry --------------------------------------------------

const GEOMETRY_FIELDS = ["x", "y", "width", "height"];
const DEFAULT_GEOMETRY_TOLERANCE = 2;

function findMeasuredBlock(measuredBlocks, role, index = 0) {
  return measuredBlocks.find((b) => b.role === role && (b.index ?? 0) === index);
}

// Compares each spec block's declared geometry fields against its measured
// counterpart (matched by role+index). A field valued the literal string
// "content" is content-driven and always skipped — see the module header.
// A spec block with no measured counterpart at all is a structural defect
// (missing-block-instance) independent of any field-level comparison.
export function compareBlockGeometry({ blocks, measuredBlocks }) {
  const defects = [];
  for (const block of blocks || []) {
    const index = block.index ?? 0;
    const measured = findMeasuredBlock(measuredBlocks, block.role, index);
    if (!measured) {
      defects.push({ type: "missing-block-instance", role: block.role, index });
      continue;
    }
    const tolerance = block.tolerance ?? DEFAULT_GEOMETRY_TOLERANCE;
    for (const field of GEOMETRY_FIELDS) {
      const expected = block[field];
      if (expected === undefined || expected === "content") continue;
      const value = measured[field];
      const deltaPx = Math.abs(value - expected);
      if (deltaPx > tolerance) {
        defects.push({
          type: "geometry-mismatch",
          role: block.role,
          index,
          field,
          expected,
          measured: value,
          deltaPx,
          tolerance,
        });
      }
    }
  }
  return defects;
}

// ---- spacer state ------------------------------------------------------

// Compares each spec block's declared spacerTop/spacerBottom (a BLOCK-level
// structural opinion — see design-system-opinion-gradient.md: blocks carry
// outer SpaceVertical wrappers for inter-block page rhythm; the component
// default is always off, so the template's own state is the layout's
// opinion, not drift) against the measured DOM's actual first/last-child
// presence. Either side omitted from the spec block is unchecked, same
// content-skip convention as compareBlockGeometry.
export function evaluateSpacerState({ blocks, measuredBlocks }) {
  const defects = [];
  for (const block of blocks || []) {
    const index = block.index ?? 0;
    const measured = findMeasuredBlock(measuredBlocks, block.role, index);
    if (!measured) continue; // missing-block-instance already reported by compareBlockGeometry
    for (const side of ["spacerTop", "spacerBottom"]) {
      const expected = block[side];
      if (expected === undefined) continue;
      const value = Boolean(measured[side]);
      if (value !== expected) {
        defects.push({ type: "spacer-state-mismatch", role: block.role, index, side, expected, measured: value });
      }
    }
  }
  return defects;
}

// ---- computed style probes ---------------------------------------------

// Parses a leading numeric prefix off a CSS computed-style string (e.g.
// "48.5px" -> 48.5) for tolerance comparison; non-numeric values (colors,
// keywords) return undefined and fall back to exact-match below.
function parseNumericPrefix(value) {
  const match = String(value).match(/^-?[\d.]+/);
  return match ? Number(match[0]) : undefined;
}

function findMeasuredStyle(measuredStyles, role, index, property) {
  return measuredStyles.find((s) => s.role === role && (s.index ?? 0) === index && s.property === property);
}

// getComputedStyle never returns the literal keyword "transparent" for
// background-color — every engine serializes it as "rgba(0, 0, 0, 0)" (found
// live running this check against portfolio's own :3230 server: a spec
// authored with the human-readable keyword flagged every correct page as a
// false style-mismatch). Canonicalize known CSS keyword/serialization pairs
// before the string comparison so a spec can keep reading as intent.
const CSS_VALUE_ALIASES = { transparent: "rgba(0, 0, 0, 0)" };
function canonicalizeCssValue(value) {
  return CSS_VALUE_ALIASES[value] ?? value;
}

// Compares each spec probe's expected computed-style value against the live
// measurement (matched by role+index+property). expected: "content" skips
// the probe (rare, but mirrors compareBlockGeometry's content-skip). A
// numeric `expected` with a numeric measured prefix compares within
// `tolerance` (default 0 — exact); anything else compares as an exact
// string (colors, keywords), after canonicalizing known aliases.
export function evaluateStyleProbes({ probes, measuredStyles }) {
  const defects = [];
  for (const probe of probes || []) {
    const index = probe.index ?? 0;
    if (probe.expected === "content") continue;
    const measured = findMeasuredStyle(measuredStyles, probe.role, index, probe.property);
    if (!measured) {
      defects.push({ type: "missing-style-probe", role: probe.role, index, property: probe.property });
      continue;
    }
    const value = measured.value;
    let mismatched;
    if (typeof probe.expected === "number") {
      const numericValue = parseNumericPrefix(value);
      mismatched = numericValue === undefined || Math.abs(numericValue - probe.expected) > (probe.tolerance ?? 0);
    } else {
      mismatched = canonicalizeCssValue(value) !== canonicalizeCssValue(probe.expected);
    }
    if (mismatched) {
      defects.push({
        type: "style-mismatch",
        role: probe.role,
        index,
        property: probe.property,
        expected: probe.expected,
        measured: value,
      });
    }
  }
  return defects;
}

// ---- device pairing (axis ownership) -----------------------------------

// device is the ONE axis a block owns (its own internal adaptation); every
// other axis — block sequence, props, style — belongs to the layout, and a
// layout holds ONE opinion per axis (design-system-opinion-gradient.md,
// "Axis ownership rule"). So a template's D- and M- Example frames are the
// SAME layout opinion rendered through each block's own device axis: same
// blocks in the same order, same non-geometry props. A block whose very
// presence IS the device's own chrome (e.g. NavigationHeader's mobile-nav
// pill, rendered by the same component instance purely via CSS breakpoint)
// opts out with `deviceOnly: true` — anything else diverging between the
// pair is a defect the device axis can't explain.
// A content-driven block (any geometry field valued "content" — a repeating
// case-study section, a card row) has a count that varies with real project
// content, not a fixed layout opinion; the DS Example frames may legitimately
// demo a different repeat count per device (e.g. 3 FeatureText/SplitContent
// pairs on D-Project's example vs 1 on M-Project's), so its presence/count
// is excluded from the sequence comparison on BOTH sides, same "content
// skips the check" convention compareBlockGeometry already applies per-field.
function isContentDriven(block) {
  return GEOMETRY_FIELDS.some((field) => block[field] === "content");
}

function devicePairingSignature(template) {
  return (template?.blocks || [])
    .filter((b) => !b.deviceOnly)
    .filter((b) => !isContentDriven(b))
    .map((b) => ({ role: b.role, index: b.index ?? 0 }));
}

function styleProbeMap(template) {
  const map = new Map();
  for (const p of template?.styleProbes || []) {
    map.set(`${p.role}#${p.index ?? 0}#${p.property}`, p.expected);
  }
  return map;
}

export function evaluateDevicePairing({ templateD, templateM, templateId }) {
  const defects = [];
  if (!templateD || !templateM) return defects; // no full D/M pair to compare — not this check's job

  const seqD = devicePairingSignature(templateD);
  const seqM = devicePairingSignature(templateM);
  const sameSequence =
    seqD.length === seqM.length && seqD.every((entry, i) => entry.role === seqM[i].role && entry.index === seqM[i].index);
  if (!sameSequence) {
    defects.push({
      type: "device-pairing-sequence-mismatch",
      templateId,
      d: seqD.map((e) => `${e.role}#${e.index}`),
      m: seqM.map((e) => `${e.role}#${e.index}`),
    });
  }

  const sharedRoleKeys = new Set(
    seqD.map((e) => `${e.role}#${e.index}`).filter((key) => seqM.some((e) => `${e.role}#${e.index}` === key))
  );

  const probesD = styleProbeMap(templateD);
  const probesM = styleProbeMap(templateM);
  for (const key of new Set([...probesD.keys(), ...probesM.keys()])) {
    const [role, index, property] = key.split("#");
    if (!sharedRoleKeys.has(`${role}#${index}`)) continue; // role isn't shared (device-only) — device explains the gap
    const dExpected = probesD.get(key);
    const mExpected = probesM.get(key);
    if (dExpected !== mExpected) {
      defects.push({
        type: "device-pairing-style-probe-mismatch",
        templateId,
        role,
        index: Number(index),
        property,
        d: dExpected,
        m: mExpected,
      });
    }
  }

  return defects;
}

// Groups a spec's template ids ("D-Home"/"M-Home", ...) into { D, M } pairs
// keyed by the shared base name, for evaluateDevicePairing to walk.
export function deriveDevicePairs(templates) {
  const pairs = new Map();
  for (const id of Object.keys(templates || {})) {
    const dashIdx = id.indexOf("-");
    if (dashIdx === -1) continue;
    const prefix = id.slice(0, dashIdx);
    const base = id.slice(dashIdx + 1);
    if (prefix !== "D" && prefix !== "M") continue;
    if (!pairs.has(base)) pairs.set(base, {});
    pairs.get(base)[prefix] = id;
  }
  return pairs;
}

// ---- one route x viewport capture -----------------------------------------

// Composes the three pure checks against one template's spec + one live
// measurement, tagging every defect with which template/route/viewport it
// came from (a defect from computeTemplateDefects always carries all three,
// regardless of which of the three checks produced it — the field a reader
// needs to reproduce the failure).
export function computeTemplateDefects({ template, templateId, route, viewportName, measured }) {
  const grid = computeGridColumns({
    viewportWidth: measured.viewportWidth,
    margin: measured.gridVars.margin,
    gap: measured.gridVars.gap,
  });

  const defects = [
    ...compareBlockGeometry({ blocks: template.blocks, measuredBlocks: measured.blocks }),
    ...evaluateSpacerState({ blocks: template.blocks, measuredBlocks: measured.blocks }),
    ...evaluateGridConformance({
      gridChecks: template.gridChecks,
      measuredCells: measured.gridCells || [],
      grid,
      tolerancePx: template.gridTolerancePx,
    }),
    ...evaluateStyleProbes({ probes: template.styleProbes, measuredStyles: measured.styles || [] }),
  ];

  return defects.map((d) => ({ ...d, templateId, route, viewport: viewportName }));
}

// ---- orchestration -----------------------------------------------------

const DEFAULT_CONFORMANCE_PATH = join(homedir(), "JHD", "captures", "live", "conformance.jsonl");

function routeUrl(baseUrl, route) {
  return new URL(route, baseUrl).toString();
}

// Appends one `templates`-keyed envelope to conformance.jsonl, matching the
// shape capture-listener.mjs nests a `binding` result under (see this file's
// header comment) — but as its own top-level record, since template-check is
// a standalone/manual lane, not merged into the value lane's own envelope.
// Never throws: a write failure (missing dir, permissions) is logged and
// swallowed, matching conformance-check.mjs/binding-check.mjs's own
// never-crash-the-caller discipline for the conformance sink.
function appendTemplatesEnvelope(conformancePath, result) {
  try {
    mkdirSync(dirname(conformancePath), { recursive: true });
    const record = { ts: new Date().toISOString(), templates: { ok: result.ok, defects: result.defects, summary: result.summary } };
    appendFileSync(conformancePath, JSON.stringify(record) + "\n", "utf8");
  } catch (err) {
    console.error(`[template-check] failed to append conformance.jsonl: ${err.message}`);
  }
}

// Drives one (route, viewport) capture -> tagged defects, catching a
// measureImpl failure (navigation timeout, server not ready, ...) as a
// `measurement-failed` defect rather than aborting the whole run — one
// broken route shouldn't blind the check to every other route's defects.
async function checkOneCapture({ spec, route, viewport, templateId, baseUrl, measureImpl }) {
  const template = spec.templates?.[templateId];
  if (!template) {
    return [{ type: "missing-template-spec", templateId, route: route.route, viewport: viewport.name }];
  }
  try {
    const measured = await measureImpl({ url: routeUrl(baseUrl, route.route), viewport, template, templateId, route: route.route });
    return computeTemplateDefects({ template, templateId, route: route.route, viewportName: viewport.name, measured });
  } catch (err) {
    return [{ type: "measurement-failed", templateId, route: route.route, viewport: viewport.name, detail: err.message }];
  }
}

// Impure orchestrator: reads the spec + map, drives measureImpl (the real
// CLI plugs in Playwright + a started server here; tests inject a fixture
// measurement directly — the mock-DOM-measure seam) across every route x
// viewport the map declares, and appends the aggregate result to
// conformance.jsonl. Never throws on defects or on a per-capture failure;
// only a malformed spec/map file (JSON.parse) propagates, matching
// conformance-check.mjs's own contract for a hard config error.
export async function runTemplateCheck({
  specPath,
  mapPath,
  baseUrl,
  measureImpl,
  conformancePath = DEFAULT_CONFORMANCE_PATH,
  appendEnvelope = true,
}) {
  if (!existsSync(specPath)) throw new Error(`template spec not found: ${specPath}`);
  if (!existsSync(mapPath)) throw new Error(`map file not found: ${mapPath}`);

  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const map = JSON.parse(readFileSync(mapPath, "utf8"));
  const viewports = map.templates?.viewports || [];
  const routes = map.templates?.routes || [];

  const defects = [];
  let checkedCount = 0;
  for (const route of routes) {
    for (const viewport of viewports) {
      const templateId = route.templates?.[viewport.name];
      if (!templateId) continue; // this route has no template declared for this viewport — not a defect, just out of scope
      checkedCount++;
      defects.push(...(await checkOneCapture({ spec, route, viewport, templateId, baseUrl, measureImpl })));
    }
  }

  // Spec-level check, independent of any live capture: does each D/M pair in
  // the spec hold to ONE layout opinion per axis (device pairing rule)? Runs
  // once per pair regardless of which routes the map actually declares.
  for (const [base, pair] of deriveDevicePairs(spec.templates)) {
    if (!pair.D || !pair.M) continue; // no full pair — not this check's job
    const pairingDefects = evaluateDevicePairing({
      templateD: spec.templates[pair.D],
      templateM: spec.templates[pair.M],
      templateId: base,
    });
    defects.push(...pairingDefects.map((d) => ({ ...d, route: "(spec)", viewport: "D+M" })));
  }

  const ok = defects.length === 0;
  const summaryLines = [`Template check: ${checkedCount} route x viewport captures checked, ${defects.length} defects.`];
  for (const d of defects) {
    summaryLines.push(`  [${d.type}] ${d.templateId} ${d.route} (${d.viewport}): ${d.field ?? d.property ?? d.role ?? d.detail ?? ""}`);
  }
  const result = { ok, defects, summary: summaryLines.join("\n") };

  if (appendEnvelope) appendTemplatesEnvelope(conformancePath, result);

  return result;
}

// ---- server lifecycle (real CLI use only — not exercised by node --test) --

// Probes ports sequentially from `startPort`, returning the first one this
// process can bind to. Not a reservation — a race is possible between the
// probe and the server's own bind — acceptable for a manual/gate-invoked
// dev-server helper, not a production port allocator.
export async function findFreePort(startPort, maxAttempts = 20) {
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    const free = await new Promise((resolve) => {
      const srv = createServer();
      srv.once("error", () => resolve(false));
      srv.once("listening", () => srv.close(() => resolve(true)));
      srv.listen(port, "127.0.0.1");
    });
    if (free) return port;
  }
  throw new Error(`no free port found starting at ${startPort}`);
}

async function waitForServer(url, { timeoutMs = 60_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`server at ${url} did not become ready within ${timeoutMs}ms${lastErr ? `: ${lastErr.message}` : ""}`);
}

// Starts `npm run dev -- -p <port>` in `dir` (the built site's dev server —
// fast startup, sufficient for a geometry/structure measurement; pass
// --server-cmd to run a production build+start instead when that
// distinction matters for a given check).
function startServer(dir, port, serverCmd) {
  const [cmd, ...args] = serverCmd ? serverCmd.split(" ") : ["npm", "run", "dev", "--", "-p", String(port)];
  return spawn(cmd, args, { cwd: dir, stdio: "ignore" });
}

// ---- Playwright measurement (real CLI use only) -------------------------

// Measures exactly what one template's spec asks for: every [data-kind]
// element matching a spec-referenced role (blocks), the live page's own
// --grid-margin/--grid-gap custom properties (gridVars — never hardcoded,
// so a token restep is picked up automatically), each gridCheck's cells,
// and each styleProbe's computed property. Runs inside the page via
// page.evaluate — DOM APIs only, no closures over the Node-side spec object.
async function measureWithBrowser(browser, { url, viewport, template }) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    return await page.evaluate((tmpl) => {
      const rectFor = (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height };
      };

      // A block/probe's own `selector` overrides the [data-kind="role"]
      // convention default — needed to reach a role that isn't itself a
      // unique component root (e.g. one specific data-size spacer instance
      // nested inside a repeated block).
      const selectorFor = (entry) => entry.selector || `[data-kind="${entry.role}"]`;

      const seenBlockSelectors = new Map(); // role -> selector, first entry wins
      for (const b of tmpl.blocks || []) {
        if (!seenBlockSelectors.has(b.role)) seenBlockSelectors.set(b.role, selectorFor(b));
      }
      // A block's outer spacer is its first/last DOM child rendering the
      // shared SpaceVertical primitive (data-kind="space-vertical") — see
      // design-system-opinion-gradient.md: blocks own this ONE structural
      // opinion, toggled per-instance, default off.
      const hasSpacer = (el, child) => child?.getAttribute?.("data-kind") === "space-vertical";

      const blocks = [];
      for (const [role, selector] of seenBlockSelectors) {
        document.querySelectorAll(selector).forEach((el, index) => {
          blocks.push({
            role,
            index,
            ...rectFor(el),
            spacerTop: hasSpacer(el, el.firstElementChild),
            spacerBottom: hasSpacer(el, el.lastElementChild),
          });
        });
      }

      // getComputedStyle(...).getPropertyValue("--x") returns the RAW
      // cascaded value (e.g. "clamp(2rem, calc(3.125vw + 0.5rem), 3rem)"),
      // not a resolved pixel number — custom properties don't get resolved
      // the way a real CSS property does. Force resolution by applying the
      // var() to an actual layout property on a throwaway probe element and
      // reading that property's own (real, resolved) computed value.
      const resolvePxVar = (varName) => {
        const probe = document.createElement("div");
        probe.style.position = "absolute";
        probe.style.visibility = "hidden";
        probe.style.width = `var(${varName})`;
        document.body.appendChild(probe);
        const px = parseFloat(getComputedStyle(probe).width);
        probe.remove();
        return px;
      };
      const gridVars = { margin: resolvePxVar("--grid-margin"), gap: resolvePxVar("--grid-gap") };

      const gridCells = [];
      for (const check of tmpl.gridChecks || []) {
        document.querySelectorAll(`[data-kind="${check.role}"]`).forEach((blockEl, index) => {
          const cellEls = check.cellSelector ? Array.from(blockEl.querySelectorAll(check.cellSelector)) : [blockEl];
          for (const cellEl of cellEls) {
            const r = rectFor(cellEl);
            gridCells.push({ role: check.role, index, x: r.x, width: r.width });
          }
        });
      }

      const styles = [];
      for (const probe of tmpl.styleProbes || []) {
        const el = document.querySelectorAll(selectorFor(probe))[probe.index ?? 0];
        if (!el) continue;
        const value = getComputedStyle(el).getPropertyValue(probe.property);
        styles.push({ role: probe.role, index: probe.index ?? 0, property: probe.property, value });
      }

      return { viewportWidth: window.innerWidth, blocks, gridCells, styles, gridVars };
    }, template);
  } finally {
    await page.close();
  }
}

// ---- CLI --------------------------------------------------------------

export function parseArgs(argv) {
  const args = argv.slice(2);
  const getArg = (flag, fallback) => {
    const idx = args.indexOf(flag);
    return idx === -1 ? fallback : args[idx + 1];
  };
  return {
    mapPath: getArg("--map", join(homedir(), "JHD", "portfolio", "design", "figma-map.json")),
    specPath: getArg("--spec", join(import.meta.dirname, "template-spec.json")),
    baseUrl: getArg("--base-url", null),
    startServerDir: getArg("--start-server", null),
    serverCmd: getArg("--server-cmd", null),
    portRangeStart: Number(getArg("--port", "3230")),
  };
}

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

async function main(argv) {
  const { mapPath, specPath, startServerDir, serverCmd, portRangeStart } = parseArgs(argv);
  let { baseUrl } = parseArgs(argv);

  let serverProcess;
  let browser;
  try {
    if (startServerDir) {
      const port = await findFreePort(portRangeStart);
      baseUrl = `http://localhost:${port}`;
      serverProcess = startServer(startServerDir, port, serverCmd);
      await waitForServer(baseUrl);
    }
    if (!baseUrl) throw new Error("--base-url is required (or pass --start-server <dir> to start one)");

    const { chromium } = await import("playwright");
    browser = await chromium.launch();
    const measureImpl = (args) => measureWithBrowser(browser, args);

    const result = await runTemplateCheck({ specPath, mapPath, baseUrl, measureImpl });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  } catch (err) {
    console.error(`[template-check] ${err.message}`);
    process.exitCode = 2;
  } finally {
    if (browser) await browser.close();
    if (serverProcess) serverProcess.kill();
  }
}

if (isMainModule()) {
  main(process.argv);
}
