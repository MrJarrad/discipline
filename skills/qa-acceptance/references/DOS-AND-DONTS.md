# Do's and Don'ts — qa-acceptance

---

## Do

| Do | Why |
|----|-----|
| Pull **numbered ACs** straight from the issue before doing anything else | AC text is the source of truth, not memory |
| Verify **each AC** with evidence — run/test/check, cite what you observed | "Code written" is not "AC verified" |
| Attach the evidence **next to** each AC in the report | Reviewer shouldn't have to hunt for it |
| **Block the close** when any AC is unmet or unverified | The gate exists to prevent false-done states |
| Name the **specific gap** when an AC fails — which one, what's missing | Turns a vague "not ready" into an actionable next step |
| Get an explicit **defer** decision when shipping with a known gap | Silent gaps become invisible debt |
| Report on **every AC**, not just the ones that passed | A partial report hides the real state |

---

## Don't

| Don't | Why |
|-------|-----|
| Mark an issue done because the **diff looks right** | Looking right is not the same as verified |
| Say "**should work**" / "looks correct" / "the logic is there" | Unverified claims dressed as verified ones |
| Skip an inconvenient AC **silently** | Silent skips are how broken increments ship |
| **Invent ACs** after the fact to match what got built | Reverses the gate — it exists to hold work to a pre-set bar |
| Close with a **partial pass** and no defer/block decision | Ambiguity here is exactly what the gate prevents |
| Report only the **passing ACs** | Omission reads as "all clear" when it isn't |

---

## Branch-specific

### Issue has no explicit ACs

**Do:** Derive them from the issue description as originally written, or flag the issue as under-specified and confirm before closing as done.

**Don't:** Invent lenient ACs retroactively so the current diff passes.

### One AC is unverifiable in this environment (e.g. needs prod access)

**Do:** Say so explicitly, name what verification would require, and get an explicit defer sign-off.

**Don't:** Mark it met on the assumption that it probably works.

### Multi-increment issue, some ACs deferred to a later slice

**Do:** Ship the verified ACs; list deferred ones with the reason; keep the issue open or spin a follow-up for the rest.

**Don't:** Close the issue as fully done while ACs are still outstanding.

---

## Output format

For each AC:

1. **AC** — the criterion as written on the issue.
2. **Evidence** — what you ran/checked/observed, with a typed source (`[code]`, `[test]`, `[runtime]`) per `verify-finding`.
3. **Verdict** — met / deferred (with sign-off) / blocked (with gap named).

Then a summary line: all ACs met → ready to close. Any gap → gate blocks close, gap named.

---

## Examples

**Good:** Issue has 3 ACs. AC1 and AC2 verified by running the test suite and citing the passing output. AC3's error-toast copy was never actually rendered — flagged as unverified, gate blocks close, user asked to confirm the copy before shipping.

**Bad:** "All three ACs are handled in the diff, marking done." — no test run, no evidence cited, AC3 never actually observed.
