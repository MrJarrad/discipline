---
name: architect-systems
description: Software architecture discipline in the large — decomposing a system into modules along the right seams, directing the dependencies between them, and tracing data flow across them. Use when splitting a system or feature into services/packages/modules, deciding where a process or service seam goes, resolving a dependency cycle or wrong-way dependency, or choosing between two ways to carve up a system. Not for shaping a single module's interface — that's design-modules; not for UI/visual design — that's design-craft; not for project scope — that's discover-scope/shape-stress.
---

# Architect Systems

Extends `quality`'s Build/Review discipline with the moves for shaping a **system** — the set of modules and the relationships between them — before any single module is shaped. Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying this skill.

This is architecture **in the large**: where the seams go across the whole system, and which way dependencies point across them. Its complement is [`design-modules`](../design-modules/SKILL.md) — architecture **in the small**, which shapes the deep interface *behind* one seam. The two share one vocabulary and compose at the **seam**: this skill decides *where the seams go and how the pieces relate*; `design-modules` decides *what goes behind each seam*. When you finish decomposing here, each module you named is handed to `design-modules` to shape its interface.

## When this fires vs. its neighbours

- **This skill** — more than one module in play, and the question is how they split and relate.
- **`design-modules`** — exactly one module in play, and the question is its interface shape. If you're down to one module, you're done here; hand off.
- **`shape-stress` / `discover-scope`** — the question is *what to build and why* (scope, outcomes, constraints), not the technical structure. Structure comes after shape.
- **Trivial change** (one file, one function, a config tweak) — no decomposition decision exists. Just make the change.

## Vocabulary

Reuse `design-modules`' terms exactly — **module**, **interface**, **seam**, **adapter**, **depth** — they carry over unchanged. This skill adds the *between-modules* terms:

- **System** — the set of modules under design plus the relationships among them. The unit this skill reasons about; a module is the unit `design-modules` reasons about.
- **Dependency direction** — which module depends on which. An arrow from A to B means A breaks if B's interface changes. The graph of these arrows is the primary object you are designing here.
- **Axis of change** — a reason the system changes (a feature area, a team, a deploy cadence, an external contract). Seams belong *on* axes of change: things that change together live behind one seam; things that change independently get their own.
- **Data flow** — how data and control move across seams. Distinct from dependency direction: A can depend on B's interface while data flows B→A (a callback, an event). Name both.
- **Source of truth** — for each piece of state, the one module that owns it. Every other module holds a derived copy or asks. Two modules claiming to own the same state is a design defect, not a detail.

Say **seam**, not "boundary" — `design-modules` rejects "boundary" (overloaded with DDD's bounded context) and this skill honours that one canonical vocabulary.

## Principles

- **Seams follow axes of change, not the org chart or the layer diagram.** What changes together lives behind one seam; what changes independently gets its own. A layer split (UI / logic / data) that cuts across every feature is usually the wrong seam — every feature change touches every layer.
- **Dependencies point toward stability.** The volatile module depends on the stable one, never the reverse. When they point the wrong way, invert at the seam (define the interface on the stable side; the volatile side implements or is injected). This is dependency inversion applied to the *system* graph.
- **The dependency graph is acyclic.** A cycle between modules means they are really one module with an internal seam drawn wrong — merge them or move the seam until the cycle breaks. There is no "resolve the cycle later."
- **Introduce a system seam only when something real varies across it.** Two deployables, two teams, two rates of change, two trust levels — a *real* reason. This is `design-modules`' two-adapters rule at system scale: one hypothetical reason to split is a hypothetical seam. A premature service split buys you a distributed monolith — all the coupling, plus a network in the middle.
- **Every piece of state has exactly one source of truth.** Decide it per state, up front. Duplicated ownership is the defect that shallow module design can't see and integration tests catch too late.

## The moves

Run these in order for any non-trivial decomposition. Each has a completion criterion you can check yes/no.

1. **List the modules and the axes of change.** Name the candidate modules and, for each seam between them, the axis of change it sits on. *Done when:* every seam names the real thing that varies across it — no seam justified only by "separation of concerns."
2. **Draw the dependency graph and make it acyclic, pointing toward stability.** Draw the arrows. Break every cycle (merge or move the seam). Flip every arrow that points from stable to volatile (invert at the seam). *Done when:* the graph is a DAG and no stable module depends on a volatile one.
3. **Trace data flow and fix a source of truth per state.** Overlay how data moves (it may run opposite to the dependency arrows). For each piece of state, name the one owning module. *Done when:* every state has exactly one owner and every cross-seam flow is named (call, return, event, callback).
4. **Design it twice.** Sketch at least two genuinely different decompositions — not variations on one. Force divergence: split by feature vs. by layer; collapse to one module vs. isolate the volatile part; owned-service seam vs. in-process seam. Compare on coupling, cohesion, dependency direction, and blast radius (what a change to each module forces to change elsewhere). Recommend one, opinionated — not a menu. See [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md#branch-specific) for the comparison format. *Done when:* two real alternatives are on the table and one is recommended with its trade-off named.
5. **Hand off and record.** Hand each module to [`design-modules`](../design-modules/SKILL.md) to shape its interface. If the decision was consequential or contested, record it as a lightweight ADR — the mechanics live in [`define-terms`](../define-terms/SKILL.md), which owns ADRs; don't restate them here. *Done when:* each module has an owner for its interface design, and any consequential split has an ADR.

## Composition — the seams to neighbouring skills

- **→ `design-modules`** (downward, always). This skill stops at the module boundary; `design-modules` starts there. The output of move 5 *is* the input to `design-modules`. If, while shaping a module's interface, `design-modules` finds the module is entangled with the whole system (its interface can't be made small because the seam is in the wrong place), it escalates *back* here to move the seam. The seam is the shared object; neither skill redraws the other's side of it.
- **→ `define-terms`** (for ADRs). Architecture decisions are sticky and consequential; when one crystallises, record it via `define-terms`' ADR mechanics rather than in prose here.
- **← `shape-stress` / `discover-scope`** (upstream). Those skills settle *what* to build; this one settles *how it's structured*. Don't start decomposing before the scope is shaped — you'll architect the wrong system.

## Rejected framings

- **Layers as the default decomposition** (UI / service / data across every feature). Splits along a non-axis: every feature change touches every layer, so the seams carry no isolation. Split by axis of change first; layer *within* a module if it helps.
- **"Microservices make it modular."** A service seam is a deployment/scaling/team decision, not a modularity one. Modularity is the dependency graph and the seams; you get it in a monolith or lose it in microservices. Split into services only when something real varies across the process boundary (move-4 blast-radius wins), never for modularity alone.
- **"Boundary" / "bounded context" as the unit.** Overloaded with DDD; collides with `design-modules`' vocabulary. Say **seam**.
- **Resolving cycles "later."** A cycle is a decomposition error visible now; deferring it ships the coupling. Break it in move 2.

---
Composes with `quality` (base discipline) and `design-modules` (architecture in the small). Builds on John Ousterhout's *A Philosophy of Software Design* (deep modules, design it twice), Robert Martin's dependency-inversion and acyclic-dependencies principles, and Michael Feathers' seam concept — applied at system scale rather than module scale.
