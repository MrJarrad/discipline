# Do's and Don'ts — design-modules

---

## Do

| Do | Why |
|----|-----|
| Use the vocabulary exactly (**module**, **interface**, **seam**, **adapter**, **depth**) | Shared vocabulary is the point — substitutes break the design conversation |
| Apply the **deletion test** on suspected pass-through modules | Finds shallow wrappers before they ship |
| Ask: fewer methods? simpler params? hide more complexity? | Deepens an interface that's drifting shallow |
| Place a **seam** only when two adapters are justified | Avoids hypothetical indirection |
| Test through the **interface** — the same seam callers use | Interface is the test surface; tests survive refactors |
| Match interface names to the project's own domain vocabulary | Keeps the interface legible to the team, not just the author |
| Design it twice for consequential interfaces | The first idea is rarely the best one |
| Design the interface before writing the implementation | Interfaces settled after the fact tend to mirror the code, not the caller's needs |

---

## Don't

| Don't | Why |
|-------|-----|
| Substitute "component", "service", "API", "boundary" for the skill's terms | Breaks the shared language this skill exists to establish |
| Introduce a port for a **single** adapter | Hypothetical seam — indirection with no payoff |
| Expose **internal seams** through the public interface | Leaks implementation detail callers shouldn't depend on |
| Measure depth as a line-count ratio (implementation lines ÷ interface lines) | Rewards padding the implementation instead of real leverage |
| Apply this skill to **trivial** edits (typo, one-line fix, config tweak) | Wrong tool — adds ceremony with no payoff |
| Layer new tests on top of old ones after deepening a module | Replace, don't layer — old tests on the shallow shape become waste |
| Jump straight to code before the interface is decided | Skips the actual design decision this skill is for |

---

## Branch-specific

### When the user wants alternative interfaces

**Do:** Frame the problem space (constraints, dependencies, a rough sketch) → produce two or more genuinely different interface shapes → compare on depth, locality, and seam placement → recommend one.

**Don't:** Present one option and ask "which do you prefer?" without a real alternative to compare it to.

### When the dependency is in-process

**Do:** Merge the modules and test through the new interface directly.

**Don't:** Add ports and adapters for a dependency that never varies — that's indirection, not design.

---

## Output format

For interface proposals:

1. **Interface** — entry points, params, invariants, error modes.
2. **What it hides** — behaviour behind the seam.
3. **Depth read** — leverage vs. shallow signals.
4. **Seam placement** — where adapters live, if any.
5. **Recommendation** — opinionated, not a menu.

---

## Examples

**Good:**

```
This OrderService wrapper is shallow — deletion test: logic would move to 4 callers.
Deepen: checkout(cartId) → Result; hide validation + pricing behind one seam.
```

**Bad:**

```
Let's add an IOrderRepository port with one Postgres adapter.
→ Single-adapter hypothetical seam.
```
