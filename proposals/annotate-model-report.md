# Report — rulings annotate, never suppress (branch `feat/annotate-model`)

Operator ruling implemented: `~/JHD/vault/fleet/rulings/2026-08-14-rulings-annotate-never-suppress.md`.
Branch `feat/annotate-model` off `main`, 4 commits, not pushed.

| commit | what |
|--------|------|
| `9e17b59` | `scripts/annotations.mjs` — the mechanism — plus the seeded registry, 17 tests |
| `1c43ced` | binding + page-template lanes rewired; listener/jsonl carry the split |
| `f05296c` | plugin axis rulings annotate; ui.html splits NEEDS-ACTION from ANNOTATED |
| `b699756` | representation-mappings audit + the name-projection fixtures |

Tests: **700/700 green** (`node --test "scripts/*.test.mjs" "figma-plugin/capture-figma/*.test.mjs"`).
Typecheck: the repo has no typecheck (`.claude/.typecheck-status.json`: `"skipped" — no typecheck script or tsconfig.json found`); the commit gate accepted all four commits.

## What changed, mechanically

1. **Every difference emits.** Each lane computes its differences as if no
   ruling existed, then makes one call — `applyAnnotations()` — that classifies
   and splits. No lane can filter; the returned item list is always the same
   length as the input.
2. **Registry** (`scripts/annotations-registry.json`): `id`, `lane`,
   `classification` (ratified-exception / anticipated-update /
   suspected-false-positive), a mandatory `ruling` citation, a mechanical
   `match`, and an optional **closure condition** — a predicate over the
   capture (`instance_bound_variable`, `component_binding_value`). Lint rejects
   an uncited annotation, an anticipated-update with no closure, an unknown
   classification or closure kind, and duplicate ids.
3. **Closure conditions are evaluated every sync.** Met → the item flips to
   `closure-condition-met` and returns to NEEDS-ACTION ("reconcile now").
   Unobservable → `unknown`, never quietly `open` — a condition that can't be
   seen can't announce its own closure.
4. **Output splits** `needs_action` from `annotated`, in the lane results, in
   `conformance.jsonl` (via `summarizeConformance`, which now carries annotated
   samples with their closure state), and in the plugin panel (a new ANNOTATED
   section under FIGMA HYGIENE, same rows, ruling stated verbatim).
5. **Representation-mappings audit**:
   `references/representation-mappings-audit-2026-08-14.md` — every equality
   rule in the lanes, classified, with fixtures.

## Live evidence — the 2026-08-14T12:26 capture (`~/JHD/captures/live`, read-only)

**Axis lane, before vs after, same capture, same 21 template frames:**

```
BEFORE (main): {"ratified_axis_exception":7}     rendered in the panel BEFORE: 0
AFTER:         9 items, 0 needing action, 9 annotated — all 9 rendered
  [ratified-exception] Home/layout               NavigationHeader   navigationheader-mobile-layout-split
  [ratified-exception] Project/layout            NavigationHeader   navigationheader-mobile-layout-split
  [ratified-exception] Project - Landing/layout  NavigationHeader   navigationheader-mobile-layout-split
  [ratified-exception] Projects/layout      x2   NavigationHeader   navigationheader-mobile-layout-split
  [ratified-exception] Projects - Landing/layout x2  NavigationHeader  navigationheader-mobile-layout-split
  [ratified-exception] Projects/columns           LayoutGrid        layoutgrid-columns-device-owned
  [ratified-exception] Projects - Landing/columns LayoutGrid        layoutgrid-columns-device-owned
```

The 7 NavigationHeader items existed in the export but the panel dropped every
one. The **2 LayoutGrid `columns` divergences did not exist at all** — that
table emitted nothing, silently. All 9 are now visible with their ruling.

**Binding lane, before vs after:**

```
BEFORE (main): 3 defects — HeroText binding_mismatch, PaginationPage binding_mismatch,
               SplitContent ratified-mismatch;  ratified[] 0
AFTER:         2 needing action, 2 annotated
  NEEDS ACTION  retired_map_field  SplitContent content.itemSpacing   (figma-map.json still carries ratifiedVariants)
  NEEDS ACTION  binding_mismatch   HeroText …title.textStyle          (unchanged, genuine drift)
  ANNOTATED     binding_mismatch   PaginationPage boundVariables.height  [anticipated-update]
  ANNOTATED     annotation_unmatched  splitcontent-split-text-row-gap    [ratified-exception]
```

### The PaginationPage closure condition, evaluated against the fresh sync

**Result: OPEN — the file has *not* caught up.** Verbatim from the run:

```
closure [open]: closes when a device=sm PaginationPage instance binds height to
                VariableID:163:90 (device/screen-height/500)
  -> still M - Project (device=sm): unbound;
     M - Project - Landing (device=sm): VariableID:163:91
```

So the 12:26 sync did **not** produce the first live closure flip. The
condition is now stated in every sync's output, and the sync it does flip, the
item moves itself into NEEDS-ACTION.

### The split-text ratification is spent

The 12:26 capture binds `layout/grid/gap` on **all 28** SplitContent variants —
including `device=sm, layout=split-text`. The divergence the 2026-08-02 ruling
ratified no longer exists in the file, so the annotation reports as
`annotation_unmatched`: *"matched no difference this sync — the difference it
covers is gone; retire the annotation or check why the lane stopped seeing
it."* Under the old mechanism this same fact showed up as a confusing
`ratified-mismatch` defect.

**Follow-up, not fixed here (out of scope, different repo):** because that map
entry's assertion is a code-side `literal`, the lane cannot see that code still
applies `gap-lg` where Figma now says `gap`. The entry needs a `figmaExpected`
(the mechanism that exists for exactly this blind spot). Filed, not done.

## Migration honesty

- `NavigationHeader` and `LayoutGrid` ratified exceptions are **converted, not
  deleted** — same rulings, same citations, now visible under ANNOTATED.
- `ratifiedVariants` in a map suppresses nothing. `~/JHD/portfolio/design/figma-map.json`
  still carries one (SplitContent), which is why the live run reports a
  `retired_map_field` item pointing at the registry. **That map lives in the
  portfolio repo — deleting the field is a portfolio-side change I did not
  make** (stay-home rule).
- The `ratified_axis_exception` warning type and its guide entry are retired.
  Any consumer keying on that type sees `axis_ownership_violation` with
  `classification: "ratified-exception"` instead.

## ⚠️ Re-import required

`figma-plugin/capture-figma/code.js` and `ui.html` changed. **The plugin must be
re-imported in Figma** before any of the plugin-side behaviour above appears in
a real sync — until then the running plugin still emits the old
`ratified_axis_exception` type and still drops those rows from the panel. The
scripts lanes (binding, page-template, listener/jsonl) take effect immediately,
no re-import needed.

## Operator call, surfaced not decided

The **`device`-axis skip** (audit §B1/§D) is the one remaining coded rule that
stops a comparison without being one of the ruling's four representation
classes. Recommendation: keep it — it is the diff's pairing key (an M-frame
instance is `device=sm` and its D counterpart `device=md+` by construction), and
surfacing it adds one item per instance per sync saying the mobile frame is
mobile. If you read the law more strictly, it is a one-line change plus a
registry entry per component.
