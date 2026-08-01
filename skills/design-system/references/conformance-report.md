# Conformance report — the sign-off evidence

The [conformance checklist](conformance.md) tells you how to *review* UI. This doc tells you how to
turn that review into a **report you attach to the issue as evidence** — the thing the operator
approves in the visual sign-off.

The point is not "it looks nice." The point is to **prove the design system was applied correctly**:
every value on a token, every component from the library, accessibility intact. That proof is what
the operator signs off on. A visual change that reaches sign-off without this report is incomplete —
the Reviewer bounces it back (see `charters/reviewer.md`, `operator-review-gate.md`).

## When to produce it

Whenever you do **visual work** (anything a user would see — layout, colour, type, spacing, motion)
and are about to request review. Produce the report as part of your definition-of-done, alongside the
rendered before/after. The UXDesigner owns this; any agent shipping visual output produces it.

## Step 1 — gather the raw evidence

Inspect the **rendered** element, not just the source — the same read a devtools inspector gives you
(`bg-card`, `rounded-xl`, computed `background-color`, etc.):

1. **Classes + computed styles** of the changed element(s). The class list tells you the *intended*
   token (`bg-card`); the computed style tells you what actually rendered (catches a raw value that
   slipped in via inline style or a bespoke CSS rule).
2. **Run the anti-pattern greps** from [conformance.md](conformance.md#grep-able-anti-patterns) over
   the diff — raw hex, `oklch()`/`rgb()`/`hsl()`, `dark:` colour overrides, `rounded-[`, raw `z-`,
   raw `shadow-{sm,md,lg,xl,2xl}`, arbitrary `p-[`/`gap-[`, bare `bg-white`/`text-zinc-500`. Each hit
   in shipped UI is a raw value that should be a token.
3. For each raw hit, resolve its **nearest token** (Step 2). A flag names *both* the raw value and
   the token it should be — so the operator's "Use token" fix is one click and stays on-system.

## Step 2 — map each raw value to its nearest token

A flag is only useful if it names where to go. Resolve nearest by **role first, then value**:

| Axis | Raw value found | Nearest token | How to pick |
|---|---|---|---|
| **Colour** | `#1D9E75`, `oklch(...)`, `bg-emerald-500` | a **semantic** token | Match by *role/intent* first (a success-green CTA → `--success`; a brand action → `--primary`; a quiet surface → `--muted`), then confirm perceptual proximity. Never map to a `--chart-N` (categorical ≠ semantic). |
| **Radius** | `rounded-[7px]` | `rounded-sm/md/lg/xl/2xl/3xl/4xl` | Nearest step on the one radius root (10px × {0.6, 0.8, 1, 1.4, 1.8, 2.2, 2.6}). 7px → `rounded-md` (8px). |
| **Spacing** | `p-[7px]`, `gap-[13px]` | `p-*`, `gap-*` on the 4px scale | Nearest scale step. 7px → `p-2` (8px); 13px → `gap-3` (12px). |
| **Elevation** | `shadow-md`, `shadow-lg` | `shadow-raised/overlay/modal` | By role: card/input → `shadow-raised`; popover/menu → `shadow-overlay`; dialog/sheet → `shadow-modal`. |
| **Z-index** | `z-50`, `z-[999]` | `z-dropdown/sticky/overlay/modal/toast` | By stacking role, not number: dropdown 30 < sticky 40 < overlay 50 < modal 60 < toast 70. |
| **Type** | `text-[15px]`, invented weight | a role from the ramp | Map to the nearest of the four roles: title (`text-lg/xl` semibold), body (`text-sm` medium), meta (`text-xs` muted), label (`text-xs` medium). |

Reach for the **correct** token, not the nearest-looking one — a `muted-foreground` that happens to
match is not a substitute for a real `warning` (see SKILL.md, *Extending the system*). If the contract
genuinely lacks the value, the flag is "extend the system," not "use `<nearest>`."

## Step 3 — write the report

The report is a set of **named dimension groups**, a derived **verdict**, and the **creative choice**.
This maps 1:1 to what the sign-off panel renders — each check is a ✓ (`status: "ok"` = on-system) or a
⚠ (`status: "flag"`, carrying the raw `value` + the on-system `token`); the panel's "Use token" button
and token-constrained tweak flow read the `token` field. Exact JSON shape: *The report contract* below.

### The dimensions (check every one that the change touches)

| Dimension | On-system row reads like | Flag row reads like |
|---|---|---|
| **Components** | "Card and Button from the library" | "bespoke dropdown where `Select` exists" |
| **Spacing** | "on the scale (`gap-2`, `p-6`)" | "`p-[7px]` off the scale · nearest `p-2`" |
| **Type** | "`text-sm`, `font-medium`, on the ramp" | "`text-[15px]` invented · nearest role `text-sm`" |
| **Colour** | "surfaces + text on semantic tokens" | "CTA fill raw `#1D9E75`, not a token · nearest `--success`" |
| **Radius** | "`rounded-lg` from the root" | "`rounded-[7px]` off-scale · nearest `rounded-md`" |
| **Elevation** | "`shadow-raised` role token" | "`shadow-md` raw step · nearest `shadow-raised`" |
| **Z-index** | "`z-overlay` from the scale" | "`z-50` raw · nearest `z-overlay`" |
| **A11y** | "role `<button>`, focus-visible ring, ≥44px hit target, reduced-motion honoured" | "clickable `<div>` — no role, not focusable · use `<button>`" |

**A11y is a first-class row, not a footnote** — token-checking proves the *look* is on-system;
the a11y read proves it's *usable*. Cover: real semantic element / role, keyboard focusability +
the shared `focus-visible` ring, hit target (≥44px touch / smaller-with-spacing dense desktop),
and non-essential motion gated behind `prefers-reduced-motion`.

### The overall verdict

The verdict is **derived from the flag count**, not a field you set — the sign-off panel computes it
(`countFlags`): **all N pass** when nothing is flagged, else **N to check**. It's a *check*, not a
hard fail — some flags are justified exceptions (a `--chart-N` hex in `index.css`, a documented
`dark:` structural tweak). Name the exception in the row's `label` rather than hiding it, and state
the human verdict in `summary`.

### The creative choice

Name **what you chose, the alternative you rejected, and why** — "chose deep teal for the CTA, over
the brand blue, because it's warmer and lifts off the card." This is the *creative* half of the
sign-off; the conformance rows are the *correctness* half. Both ride on the card.

## The report contract (data shape)

The intelligence is here. This is the **exact shape** downstream tooling parses — match it
field-for-field or a consumer drops what it can't read. Emit it as an issue **document** under the key `design-signoff` with this JSON
body:

```json
{
  "version": 2,
  "summary": "On-system except the CTA fill — 1 to check.",
  "components":    [{ "label": "Card, Button from the library", "status": "ok" }],
  "spacing":       [{ "label": "gap-2, p-6 on the scale", "status": "ok" }],
  "type":          [{ "label": "text-sm, font-medium on the ramp", "status": "ok" }],
  "colour":        [{ "label": "CTA fill is a raw hex, not a token",
                      "status": "flag", "value": "#1D9E75", "token": "bg-success" }],
  "radius":        [{ "label": "rounded-xl from the root", "status": "ok" }],
  "elevation":     [{ "label": "shadow-raised role token", "status": "ok" }],
  "zIndex":        [{ "label": "z-overlay from the scale", "status": "ok" }],
  "accessibility": [{ "label": "CTA is a real <button>", "status": "ok",
                      "detail": "focus-visible ring, 44px target" }],
  "creativeChoice": {
    "chosen": "deep teal for the CTA",
    "rejected": "the brand blue",
    "why": "warmer, lifts it off the card"
  }
}
```

Field rules — the panel's parser is strict about these:

- **Groups are named arrays**, one per dimension: `components`, `spacing`, `type`, `colour`,
  `radius`, `elevation`, `zIndex` (each a `{ label, status, value?, token? }`), plus `accessibility`
  (`{ label, status, detail? }`). Only include the groups the change actually touches — but never
  drop `accessibility` on interactive UI.
- **`status` is `"ok"` (= on-system ✓) or `"flag"`.** A flagged conformance check **must** carry
  `value` (the raw/off-token value found) and `token` (the on-system token to use) — that pair drives
  the panel's "Use token" button. Use `token: "extend-system"` when the contract genuinely lacks the
  value.
- **`label` is the human sentence** shown on the row — put the finding + any justified-exception note
  here.
- **`creativeChoice` is `{ chosen, rejected, why? }`** — structured, not a single string.
- **No `verdict` field** — it's derived from the flags; carry the human verdict in `summary`.

## Attach it as evidence

Post the report as an issue **document** keyed `design-signoff` (JSON body above), alongside the
rendered before/after. The Reviewer verifies it's real and complete, then routes the sign-off card to
the operator's Inbox, where the panel renders it. A report with a flagged value and no `token`, or a
missing `accessibility` group on interactive UI, is incomplete — fix it before requesting review, the
same as any other quality gap.
