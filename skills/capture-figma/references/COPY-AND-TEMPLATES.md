# capture-figma — the copy and template-layout lanes in full

The mechanics behind the two lanes SKILL.md keeps as headings: where copy comes from,
how the listener diffs it, the manual fallback, and what a template read owes beyond a
component inventory. Nothing here was rewritten — it is the 1.78.0 SKILL.md body, moved.

## Copy lane — mandatory, equal to variables and geometry

Text content is a fifth layer, not a footnote to the visual ones. A live audit missed a
designed nav copy change entirely because the bank's copy was never read as its own
lane — it got waved through as "just a content difference," exempt from the same
scrutiny a token or a geometry value gets. That exemption is never available.

- **The bank's top-level `copy` array is the source.** The active exporter's export
  carries `copy: [{ id, path, text }]` at the top level (`id` optional, `path` the same
  Page/Frame/Component path convention as every other named entry, `text` the verbatim
  string) — read it as a full inventory, not a spot-check.
- **The listener diffs copy automatically — this is the primary path.** The listener's
  `diffCopy()` (`~/JHD/figma-plugins/main/capture-figma/listener/capture-listener.mjs`)
  correlates `copy` entries id-first, falling back to `path` when an id is missing on
  either side — the same id-first/path-fallback pattern as every other bucket — and
  emits three change records into `changes.jsonl`'s `changed.copy` array: `copy_changed`
  (`{ path, old, new }`, a matched entry whose `text` differs), `copy_added` (`{ path,
  text }`, a new-side-only path), and `copy_removed` (`{ path }`, an old-side-only path).
  `summary.copy` totals the count. Read a copy delta from `changes.jsonl` exactly as you
  would read a `layer_binding_*` delta (Change taxonomy, below) — the listener already
  classified it, don't re-derive it by eye.
- **Manual keyed diff — only when no listener/sync record exists.** When the read is
  MCP-only or REST-only (no active listener session, no banked `changes.jsonl` covering
  the capture window — e.g. a one-off file nobody has synced), there is no automated
  `copy_*` record to read. In that narrow case, and only that case, diff the current
  `copy` array against the prior capture by hand: key on `path` (or `id` when present),
  same rename-detection logic as variables/styles/components, and report every changed/
  added/removed string explicitly — never summarize a text diff as "content updated."
  This manual path is the fallback, not the default; reach for `changes.jsonl` first
  whenever the listener has been running.
- **Text is never exempt.** A string that reads as "just copy" can be the entire
  designed change (a nav label, a CTA, a section header) — extract it **verbatim**
  (Step 4's rule already says this for screenshots; the copy lane is where it becomes
  systematic instead of incidental) and hold it to the same before/after scrutiny as a
  spacing token. If a capture's audit report has a copy section with zero findings, that
  section still exists and says so explicitly — it's never silently omitted because
  "nothing changed."

## Template-layout lane — read layouts, not just component inventories

Reading a design file's templates (project pages, marketing layouts, any page-level
frame meant to ship) means reading them as **layouts** — structure, instances, geometry,
and states expressed as sibling frames per the operator's naming pattern (e.g.
`default`/`hovered`/`disabled` as separate authored frames, not a toggled prop) — not
stopping at a component-set inventory of what exists on the page.

- **A template read is Step 3's "Reading a page layout" four-pass contract**, applied to
  every template/project-page frame the brief touches, not just nav chrome. A live audit
  read a project-page template only for nav geometry and missed the template's own
  layout entirely — the fix is applying the four-pass read (context, composition, blocks
  as instances, values as chains) to the whole template frame, every time one is in
  scope, not narrowing to whichever region prompted the read.
- **States-as-frames is a first-class pattern, not noise.** When a component/template
  author expresses states as sibling frames with a `state=` naming axis, capture each
  sibling as its own state's layout (own geometry, own instance set) — collapsing them
  into "the same layout" loses the state-specific structure the frames exist to record.
  The bank keeps this page tier structurally separate from component variants: state
  frames live in the export's `exampleStructure` bucket (group "Examples"), a distinct
  top-level key from `templateFrames` — the same page-tier/component-tier split the
  layer model draws between blocks/templates and components.
- **Component-set inventory is necessary but not sufficient.** Listing which components a
  template instantiates answers "what's used here"; it doesn't answer "how is this page
  built" — the ordered block sequence, the frame's mode vector, and prop tables per
  instance (Step 3/4) are still required for a template read to count as complete.
