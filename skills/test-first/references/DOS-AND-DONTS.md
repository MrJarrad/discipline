# Do's and Don'ts — test-first

---

## Do

| Do | Why |
|----|-----|
| **Vertical slices** — one test, one minimal implementation, repeat | Tracer bullets; tests match actual behavior |
| **Confirm** the public interface and priority behaviors before coding | Can't test everything; focus on critical paths |
| Test through **public interfaces** only | Survives refactors |
| Match test names to the project's own domain vocabulary | Aligns with project language |
| **Run tests** after each refactor step | Refactor only when green |
| Mock only at **system boundaries** (external APIs, DB, time, filesystem) | Keeps tests behavior-focused |

---

## Don't

| Don't | Why |
|-------|-----|
| **Horizontal slice** — all tests then all code | Produces tests for imagined, not actual, behavior |
| Refactor while **red** | Get to green first |
| Mock **internal** collaborators | Tests implementation, not behavior |
| Test **private** methods | Couples tests to structure |
| Add **speculative** features beyond the current failing test | One behavior per cycle |
| Force red-green ceremony on **trivial**, non-behavioral edits | Wrong tool for typo/format fixes |

---

## Branch-specific

### When asked for test-first feature work

**Do:** Plan behaviors -> tracer bullet test -> minimal green -> loop.

**Don't:** Skip planning; write a full test suite upfront.

### When asked to write all tests first

**Do:** Explain vertical slices; offer to do one behavior at a time.

**Don't:** Comply with horizontal slicing, even if asked directly.

### When asked to mock an internal collaborator to verify it was called

**Do:** Redirect to testing the observable outcome through the public interface.

**Don't:** Write the internal mock, even if it's the faster path to a passing test.

---

## Output format

Each cycle, state:

1. **Behavior under test** — one sentence, user-facing.
2. **RED** — the test (code or file path), confirmed failing.
3. **GREEN** — the minimal implementation that passes it.
4. **Next** — the next behavior, or refactor once the relevant suite is green.

---

## Examples

**Good:**

```
Behavior: empty cart rejects checkout
RED: test fails — checkout throws on empty cart
GREEN: minimal guard in checkout()
Next: test checkout with one item
```

**Bad:**

```
I'll write tests for all 12 endpoints first, then implement.
-> Horizontal slice; forbidden
```
