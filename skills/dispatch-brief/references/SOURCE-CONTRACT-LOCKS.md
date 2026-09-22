# Lock rows under a Source contract (Change 1, 2026-09-22)

Operator 2026-09-22: *"there were some things that did need some guidance right. the custom
default cursor built for example."*

The `Means technically` column in § Locked decisions is a parent-authored interpretation — the
exact shape a Source-contract lock row must never take. Under a Source contract the table uses
a **Source** column instead, and every row is one of three kinds, quote plus its source,
nothing else:

```markdown
| # | Operator said (verbatim) | Source |
| - | --- | --- |
| 1 | "<quote>" | export-silent |
| 2 | "<quote>" | export-vs-ruling |
| 3 | "<quote>" | operator-round |
```

- **`export-silent`** — the export states nothing here; the row is the operator's own answer
  filling the gap.
- **`export-vs-ruling`** — the export and a banked ruling disagree; the row quotes **both** and
  the operator's tie-break.
- **`operator-round`** — the operator's words from this round, verbatim.

**Banned, whatever the source:** a parent-authored mechanism, a function/token/easing name, a
raw value, or a "recommended" answer promoted to a rule.

**Gate-enforced.** `hooks/bin/agent-dispatch-gate.mjs` denies a Source-contract dispatch
whose Locked-decisions Source cell is anything outside the three kinds above, whose header
still reads `Means technically`, or whose quote cell carries a backticked mechanism identifier
(a `--custom-prop`, a `name()` call, an easing curve/token, or a code-file path) — that
identifier could only have been authored by the parent.
