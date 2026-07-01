---
name: design-modules
description: Software architecture discipline for designing deep modules — small interfaces, clean seams, testable through the interface. Use when designing a new module or interface, splitting a shallow pass-through, deciding where to place a test seam, or any non-trivial software design that needs the interface shaped before the code is written. Not for UI/visual design — that's design-craft.
---

# Design Modules

Extends `flux-quality`'s Build/Review discipline with the specific vocabulary and moves for shaping a **module's interface** before writing its implementation. Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying this skill.

Design **deep modules**: a lot of behaviour behind a small interface, placed at a clean seam, testable through that interface. The aim is leverage for callers, locality for maintainers, and testability for everyone. This is software architecture — module and interface shape — not UI or visual design.

## Vocabulary

Use these terms exactly; don't substitute "component," "service," "API," or "boundary" — shared vocabulary is the point.

- **Module** — anything with an interface and an implementation: a function, class, package, or tier-spanning slice. Scale-agnostic; a one-function module is still a module.
- **Interface** — everything a caller must know to use the module correctly: type signature, invariants, ordering constraints, error modes, required configuration, performance characteristics. This is the **test surface** — callers and tests cross the same seam.
- **Implementation** — what's inside the module. Distinct from **adapter**: a thing can be a small adapter with a large implementation (a Postgres repo) or a large adapter with a small implementation (an in-memory fake).
- **Depth** — leverage at the interface: how much behaviour a caller (or test) can exercise per unit of interface they have to learn. Deep = much behaviour behind a small interface. Shallow = the interface is nearly as complex as the implementation, usually a pass-through.
- **Seam** *(Michael Feathers)* — the place where a module's interface lives; where you can alter behaviour without editing in that place. Where to put the seam is its own design decision, separate from what goes behind it.
- **Adapter** — a concrete thing that satisfies an interface at a seam. Describes role, not substance. **One adapter means a hypothetical seam. Two adapters means a real one** — don't introduce a seam unless something actually varies across it.
- **Internal seam** — a seam private to the implementation, used by the module's own tests, not part of the public interface. A deep module can have many internal seams while keeping one small external interface.

## Deep vs shallow

**Deep module** = small interface + lots of implementation:

```
┌─────────────────────┐
│   Small Interface   │  ← Few methods, simple params
├─────────────────────┤
│                     │
│  Deep Implementation│  ← Complex logic hidden
│                     │
└─────────────────────┘
```

**Shallow module** = large interface + little implementation (avoid):

```
┌─────────────────────────────────┐
│       Large Interface           │  ← Many methods, complex params
├─────────────────────────────────┤
│  Thin Implementation            │  ← Just passes through
└─────────────────────────────────┘
```

When designing an interface, ask:

- Can I reduce the number of methods?
- Can I simplify the parameters?
- Can I hide more complexity inside?

## Principles

- **Depth is a property of the interface, not the implementation.** A deep module can be internally composed of small, mockable, swappable parts — they just aren't part of the interface.
- **The deletion test.** Imagine deleting the module. If complexity vanishes, it was a pass-through — shallow. If complexity reappears across N callers, it was earning its keep — deep.
- **The interface is the test surface.** Callers and tests cross the same seam. If you want to test *past* the interface, the module is probably the wrong shape — deepen it or move the seam.
- **Design the interface before the code.** Decide entry points, params, invariants, and error modes first. Writing the implementation before the interface is settled tends to shallow it out — the interface ends up mirroring whatever the code happened to need internally, instead of what callers actually need.

## Designing for testability

Good interfaces make testing natural:

1. **Accept dependencies, don't create them.**

   ```typescript
   // Testable
   function processOrder(order, paymentGateway) {}

   // Hard to test
   function processOrder(order) {
     const gateway = new StripeGateway();
   }
   ```

2. **Return results, don't produce side effects.**

   ```typescript
   // Testable
   function calculateDiscount(cart): Discount {}

   // Hard to test
   function applyDiscount(cart): void {
     cart.total -= discount;
   }
   ```

3. **Small surface area.** Fewer methods = fewer tests needed. Fewer params = simpler test setup.

## Deepening a shallow module

When a candidate module looks shallow, classify its dependencies — the category determines how the deepened module gets tested across its seam:

1. **In-process** — pure computation, in-memory state, no I/O. Always deepenable: merge the modules and test through the new interface directly. No adapter needed.
2. **Local-substitutable** — dependencies with local test stand-ins (an in-memory database, a fake filesystem). Deepenable if the stand-in exists; the seam stays internal, no port at the external interface.
3. **Remote but owned** (ports & adapters) — your own services across a network boundary. Define a port at the seam; the deep module owns the logic, the transport is injected as an adapter. Tests use an in-memory adapter, production uses the real one.
4. **True external** (mock) — third-party services you don't control (payment processors, email providers). The deepened module takes the dependency as an injected port; tests provide a mock adapter.

**Replace, don't layer, when deepening.** Old unit tests on the shallow module become waste once tests exist at the deepened interface — delete them, don't keep both. Write new tests that assert on observable outcomes through the new interface, not internal state, so they survive refactors.

## Exploring alternative interfaces

Your first interface idea is rarely the best (Ousterhout's "design it twice"). For a consequential interface decision, don't settle for the first shape that occurs to you:

1. State the constraints any interface would need to satisfy, the dependencies it relies on (and their category, above), and a rough illustrative sketch to make the constraints concrete.
2. Sketch at least two genuinely different shapes for the same interface — not variations on one idea. Useful axes to force divergence: minimize the interface to 1–3 entry points; optimize for the most common caller; design around ports & adapters if a real cross-seam dependency exists.
3. Compare them on depth (leverage at the interface), locality (where change concentrates), and seam placement. Recommend one, opinionated — not a menu. If pieces of different designs combine well, propose a hybrid and say so.

## Rejected framings

- **Depth as ratio of implementation-lines to interface-lines** (Ousterhout's original formulation): rewards padding the implementation. Use depth-as-leverage instead.
- **"Interface" as a language keyword or a class's public methods**: too narrow — interface here includes every fact a caller must know, not just the type-level surface.
- **"Boundary"**: overloaded with DDD's bounded context. Say **seam** or **interface** instead.

---
Adapted from the "design-modules" skill in the [skill-z](https://github.com/backnotprop/skill-z) collection, itself building on John Ousterhout's *A Philosophy of Software Design* and Michael Feathers' seam concept.
