# Do's and Don'ts — verify-finding

## Do

| Do | Why |
|----|-----|
| Score 0–100 as `N/100` | Precise, comparable, no vague labels |
| Cite project code as `` [code] `path:line` `` | The next reader can jump straight to it |
| Tag every source — `[code]`, `[test]`, `[runtime]`, `[doc]`, `[external]`, `[chat]` | The evidence class is visible at a glance |
| Read the definition, not just a caller, before scoring high | Callers only prove usage, not behaviour |
| Show the score delta on each loop pass (e.g. 25/100 → 55/100) | Makes confidence growth visible, not asserted |
| Add a genuinely new primary source every loop iteration | Evidence must grow, not get reworded |
| Escalate after 3 loops still below 40, naming what's missing | Stops indefinite guessing |
| Name the actual paths in **Why** | Keeps reasoning auditable, not decorative |
| Split unrelated claims into separate finding blocks | One falsifiable claim per block |

## Don't

| Don't | Why |
|-------|-----|
| Implement, recommend merge, or close triage below 40/100 | Prevents building on a guess |
| Score ≥ 70 on a `[chat]`/issue-title source alone | Weak sources can't carry high confidence |
| Cite project code without a line number | A file or folder name isn't actionable |
| Skip the loop because the answer "seems obvious" | Obvious is often wrong |
| Inflate the score on a loop pass without a new source | Theater, not verification |
| Run a full verify pass on a trivial syntax fix or a preference the user already gave | Anti-trigger — this is overhead there |
| Treat 40–69 as safe for irreversible work without an explicit user ack | Partial evidence still has gaps |

## Branch-specific

**Implementation decision** — keep "how it works today" and "how we should
change it" as separate findings; they carry different evidence and different risk.

**User says "just do it"** — record the score and the missing sources anyway;
note the override in the finding block so it's visible later.

**Runtime behaviour claim** — target ≥ 85 backed by `[test]` or `[runtime]`;
code-reading alone caps around 75 for claims about what actually happens at runtime.

## Examples

**Good**

> **Confidence:** 88/100. **Sources:** `[code]` `` `src/checkout/PayButton.tsx:18` `` — debounceMs=300; `[test]` `` `tests/pay-button.test.ts:44` `` — double-click produces one charge. **Why:** Both agree; no other debounce logic exists in the checkout path.

**Bad**

> **Confidence:** High. **Sources:** checkout code. **Why:** should debounce.
