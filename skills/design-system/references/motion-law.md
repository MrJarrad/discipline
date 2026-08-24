# House motion law — JHD web

**Status:** current house contract for JHD web products on `@jhd/design-system`.  
**Reader:** [`motion`](../motion/SKILL.md) → [LAW.md](../motion/references/LAW.md).  
**Tokens:** `~/JHD/design-system/main/src/styles.css` §10 (`--duration-*`, `--delay-*`, `--easing-*`).

Products adopt this law when they join the house system. Product-specific chrome (nav column order, hero flight, floor bars, cold-load gates) stays in the product until promoted — not in this document.

Client or reference work uses the **captured** `motion-law.md` from capture-website, not this file, unless the brief says otherwise.

---

## Grammar (locked)

| Row | Rule |
| --- | --- |
| **Families — overlap** | Distinct animation families **overlap**: follower delay **<** leader duration; next starts while last is still travelling. Perceptible gap or exclusive handoff sold as overlap is a defect. |
| **Siblings — pile** | Identical siblings **pile**: stagger step ≈ **4–20%** of the item's own duration; commonly **~75ms** where no token exists yet. Full handoff between siblings is a defect. |
| **Visual raster** | Layout columns **left → right**; within a column, **top → bottom**. **Unit = cell contents** (one authored line, card, or tile = one mask). Defects: **raster-soup**, **glyph-stagger** (letter/word stagger inside a line). |
| **Clear the stage** | Before the next *readable* family, extras are gone / shared slot driven to floor — no finished readable content under leftovers; no crossfade in the slot. |
| **Hold still** | At least one element in a sequence holds position and changes only exposure (opacity/dim) while others move. |
| **Enter from nothing** | Element with no on-screen predecessor: last in on entry, first out on exit; exit **2–4× faster** than entry. |
| **Flash-before-enter** | First painted frame of any enter is the **from-state** — craft Block via motion skill; not optional. |
| **Hidden-complete** | Full travel plays while visible — craft Block via motion skill; not optional. |

---

## Type enter (locked)

**Mechanism:** clip-wipe — hard `overflow` clip + translate rise. **Not** opacity fade for primary type enter. **Not** split-layout as the type-enter contract.

| Property | House binding |
| --- | --- |
| Duration | `--duration-500` (0.5s) |
| Easing | `--easing-expo-out` (`cubic-bezier(0.2, 1, 0.22, 1)`) — nearest package expo-out |
| Stagger step | **35ms** — literal until a stagger token lands in Figma/package |
| Travel | **105%** of line box — literal until a motion-distance token exists |
| One wrap line | One mask — a visual wrap = **n** masks, not one blob |

---

## Clocks (token-bound)

Use package motion tokens; do not hand-copy raw ms in components when a token exists.

| Use | Token | Value |
| --- | --- | --- |
| Short UI feedback | `--duration-100` … `--duration-200` | 0.1s … 0.2s |
| Standard enter / clip-wipe | `--duration-500` | 0.5s |
| Longer view-scale | `--duration-700` … `--duration-900` | 0.75s … 1s |
| Stagger / short delay | `--delay-100` | 0.1s |
| Named breath / handoff | `--delay-200` … `--delay-400` | 0.375s … 0.75s |

Products may define a **tempo module** (e.g. `site-tempo.ts`) that maps beat-grid helpers to these tokens — the module is executable; **this file is the human contract**.

---

## Out of house law (product until promoted)

These are **not** house rows. Portfolio and other products may lock them in vault decisions or product tempo — do not Block house conformance for their absence here:

- Nav load column order (e.g. four columns LTR)
- Secondary floor / view switcher chrome
- Hero route flight duration and curve
- Cold-load vs in-app timing gates
- Scroll-linked header mechanism (opacity fade both ways, fixed bars)

When a product promotes a row to house, add it here and bind tokens — do not leave it only in the motion skill.

---

## Conformance

JHD web motion is reviewed with the [`motion`](../motion/SKILL.md) skill against **this document** plus craft (frequency, t90, GPU, accessibility). See [conformance.md](conformance.md) eyeball row.

Captured reference sites: compare via capture `motion-law.md` — do not score references against this house law unless the brief is an adopt/adapt decision.
