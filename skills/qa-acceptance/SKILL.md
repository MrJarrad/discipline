---
name: qa-acceptance
description: The acceptance-criteria gate before shipping — walk every AC on an issue, verify each with evidence, and refuse to close or move to review while any AC is unmet or unverified. Use when marking an issue done, closing out an increment, or asked to confirm a change is ready to ship.
---

# QA Acceptance

An increment is not done because the code was written. It's done when every
acceptance criterion (AC) on the issue is **verified with evidence**. This
skill is the gate that sits between "I made the change" and "close the issue"
— it is the AC-specific application of `flux-quality`'s "verify before
claiming" bar, applied at the moment of shipping. See `flux-quality` for the
general discipline and `verify-finding` for how to back a claim with typed,
cited evidence; this skill doesn't restate either — it's what runs them
against an issue's AC list before close.

## Code written is not AC verified

These are different claims, and collapsing them is the most common way a
broken increment ships:

- **"Code written"** — the diff exists, it compiles, it looks right.
- **"AC verified"** — you ran it, tested it, or checked it, and observed the
  specific behavior the AC describes.

Never report an AC as met on the strength of the diff alone. "Should work,"
"looks correct," and "the logic is there" are claims about code written, not
about ACs verified — treat them as unverified, full stop.

## The AC gate

### 1. Enumerate the ACs

Pull the numbered acceptance criteria straight from the issue. If
the issue has no explicit ACs, do not invent lenient ones after the fact —
either derive them from the issue description as it was written before you
started, or flag the issue as under-specified and ask before closing it as
done.

### 2. Verify each one with evidence

Walk the list one AC at a time. For each:

- State the AC.
- Do the thing that proves it — run the test, execute the command, open the
  page, inspect the output, read the actual result. Use `verify-finding`'s
  typed-source discipline (`[code]`, `[test]`, `[runtime]`) to cite what you
  checked.
- Record the evidence next to the AC, not in a separate place the reviewer
  has to go hunting for.

An AC with no evidence attached is an unverified AC, regardless of how
confident the implementation feels.

### 3. Block the close on any unmet or unverified AC

If any AC is unmet, or you haven't actually verified it this session, **stop
— do not mark the issue done and do not move it to review as complete**. Name
the specific gap: which AC, what's missing, what would prove it. Two honest
outcomes when a gap exists:

- **Defer** — the user/reviewer explicitly accepts shipping with a named gap
  (out of scope this increment, tracked separately).
- **Block** — go back and do the work needed to close the gap, then re-run
  the gate.

Never silently mark "done" with an open AC and never round a partial pass up
to a full pass.

### 4. Report against every AC, not just the ones that passed

When you do close the gate, the report lists **all** ACs — met with evidence,
deferred with explicit sign-off, or (if the gate failed) blocked with the gap
named. A report that only mentions the ACs that went well is not a gate, it's
a highlight reel.

## Anti-patterns

- Marking an issue done because the branch exists or the diff looks plausible
- Reporting "should work" / "looks right" / "the code handles this" as if it
  were verification
- Skipping an AC because it's inconvenient to test, without naming the gap
- Inventing ACs after the fact to match whatever got built
- Closing with a partial pass and no explicit defer/block decision
- A shipped summary that lists only the passing ACs and omits the rest
