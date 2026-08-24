# Motion law template — capture output

Stage 2 **must** bank `motion-law.md` in the capture folder using this shape. Same shape as [`motion`](../motion/references/LAW.md) skill LAW.md — **their law**, not house law. Mark each row `observed` or `inferred`; cite evidence (`motion-samples.json`, `motion-environment.json`, `scroll.webm`, frame tape).

**Canvas/WebGL:** if `motion-environment.json` has `tapeRequired: true`, motion law **cannot** be marked complete from CSS/GSAP samples alone — cite tape; name unobserved canvas motion as a gap.

---

## Evidence

| Source | Role |
| --- | --- |
| `motion-environment.json` | Engines observed (css / gsap / canvas-js); tapeRequired |
| `motion-samples.json` | Measured clocks (construction per row) |
| `scroll.webm` | Scroll-through tape |
| Operator / dedicated recording | Load, transition, hover-under-scroll when CSS misses canvas |

---

## Motion law (site instance)

### Families — overlap

| Field | Value |
| --- | --- |
| Rule | … |
| Confidence | observed / inferred |
| Evidence | … |

### Siblings — pile

| Field | Value |
| --- | --- |
| Stagger step | … |
| Overlap % | … |
| Confidence | observed / inferred |
| Evidence | … |

### Visual raster

| Field | Value |
| --- | --- |
| Column order | LTR / other / unobserved |
| Within column | TTB / other / unobserved |
| Unit | line / card / tile / … |
| Confidence | observed / inferred |
| Evidence | … |

### Clear the stage

| Field | Value |
| --- | --- |
| Rule | … |
| Confidence | observed / inferred |
| Evidence | … |

### Hold still

| Field | Value |
| --- | --- |
| Element / role | … |
| Confidence | observed / inferred |
| Evidence | … |

### Type enter

| Field | Value |
| --- | --- |
| Mechanism | clip-wipe / fade / scale-in / … |
| Duration | … |
| Stagger step | … |
| Travel | … |
| Easing | … |
| Confidence | observed / inferred |
| Evidence | … |

### Clocks

| Family | Duration | Delay | Easing | Trigger | Evidence |
| --- | --- | --- | --- | --- | --- |
| … | … | … | … | load/hover/… | … |

### Cold vs in-app

| Gate | Rule | Confidence | Evidence |
| --- | --- | --- | --- |
| Reload | … / unobserved | … | … |
| In-app | … / unobserved | … | … |

### Scroll / chrome

| Surface | Mechanism | Confidence | Evidence |
| --- | --- | --- | --- |
| … / unobserved | … | … | … |

### Route / hero

| Transition | Duration | Overlap with next family | Confidence | Evidence |
| --- | --- | --- | --- | --- |
| … / unobserved | … | … | … | … |

---

## Gaps

List motion the capture could not decode (canvas without tape, sign-in wall, etc.).
