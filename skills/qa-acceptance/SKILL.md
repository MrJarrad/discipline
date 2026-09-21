---
name: qa-acceptance
description: The acceptance-criteria gate before shipping — enumerate the contract into a coverage ledger (one row per item, a missing row is red), walk every AC on the task/brief, verify each with evidence, and refuse to close or move to review while any AC is unmet or unverified. Use when marking an issue done, closing out an increment, writing the coverage ledger or evidence return for any lane, or asked to confirm a change is ready to ship. Not for the mechanics of driving a browser or test run — that's webapp-testing; not for scoring a single codebase claim's confidence — that's verify-finding.
---

# QA Acceptance

An increment is not done because the code was written. It's done when every
acceptance criterion (AC) on the issue is **verified with evidence**. This
skill is the gate that sits between "I made the change" and "close the issue"
— it is the AC-specific application of `quality`'s "verify before
claiming" bar, applied at the moment of shipping. See `quality` for the
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

Pull the numbered acceptance criteria straight from the task/brief. If
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
confident the implementation feels. **An AC verified by a value copied out of the contract
into the test is unverified** — the check must read the contract at run time and assert
the mechanism (grid placement, token binding, the ruling's constant), never a number, stamp
or hash carried into the assertion by hand (operator ruling, 2026-09-19).

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

## The coverage ledger — one row per contract item

**Ledger depth follows size class** (`doer-rules.md` § Size class): **line** — one row, no
ledger; **component** — the full coverage ledger below plus its covering tests; **system** —
today's full process. Naming the wrong depth for the class is a defect, not a shortcut.

**Enumeration is the gate.** A list of what went wrong cannot show what was never looked at:
the return carries a **coverage ledger** — one row per item in the lane's contract, written
**before** the work, not assembled from the findings afterwards.

| item | source ref | built at `file:line` | measured value | mode | status |
| --- | --- | --- | --- | --- | --- |

- **A contract item with no row is red.** Not an omission for the reviewer to catch.
- **Status carries the deviation** — met · deviated (with the ruling ref) · not-built ·
  unreached. There is no second table of deviations.
- **Variance never collapses.** Where the contract states a different value per device, page,
  state or mode, that is a row per mode (or a filled mode column); one literal covering
  several contract modes is red even when one mode measures right.
- **Measured means measured** — read off the running build, never copied from your own source.
- **Tokens carry a `mode` column** — light/dark/bttf (or whatever modes the contract
  declares); a token row with the column blank or collapsed to one mode is the same
  variance-collapse defect as a missing per-device row.

### The eight row classes

**Every ledger, at component or system depth, carries all eight classes — each present with
its rows, or marked "none in scope."** A class silently dropped is the same defect as a
missing row (operator ruling 2026-09-21, `eight-class-ledger`: the nav rebuild's "complete"
ledgers covered classes 1–2 only; misses on tokens-per-mode, copy, behaviour and absence
reached the live site).

1. **Geometry and placement** — per device.
2. **Tokens** — per mode (light/dark/bttf column, see above).
3. **Copy** — every text string in the export and its layout examples, export vs built, per
   route.
4. **Links and targets** — href, mailto, clipboard payloads.
5. **States, variants and prototype flows** — per instance.
6. **Behaviour annotations** — every Interaction/Development note as a row with its proving
   test or probe.
7. **Semantics and a11y hints.**
8. **Absence** — every retired lock row and every node the new export removed, proven not
   present by test or grep, never assumed from the diff alone.

The reviewer's spot check **samples across classes, never several rows from one** — one
row per class at minimum, never five rows from class 1 standing in for the other seven
(`agents/reviewer.md`).

What an *item* is, per contract — the skill named owns the specialisation, this section owns
the rule and the row shape:

| Contract | One item is | Skill |
| --- | --- | --- |
| Design Handoff export pair | every node id in scope, plus composition per page × state × device | `handoff-to-code` (`references/coverage-ledger.md`) |
| A live Figma file + node | every node read under the named file+node | `capture-figma` |
| A captured website | every captured region and measured token | `capture-website` |
| A motion source | every cue and its timing | `capture-motion-source` |
| Plain code, native, docs | every acceptance criterion on the brief | this skill, § The AC gate |

## Figma-contracted UI reviews: the screenshot pair

When a UI AC is contracted against a Figma design (the design is the spec, not just
inspiration), rendered evidence alone is not enough — attach a **side-by-side pair**: the
Figma frame exported as PNG via the REST API, and a production/rendered screenshot at
**matched dimensions**, both at the same viewport. A single screenshot with a verbal "matches
the design" claim is not verified — it's the same "looks right" anti-pattern this skill
already blocks, applied to visuals instead of behavior.

- **Exempt:** media-slot content (photos, video, user-generated imagery) where the design
  frame uses placeholder art — compare composition/layout, not the placeholder pixels.
- **Pairs are agent evidence** — they live with the AC verification, not just handed to the
  operator raw. The operator gets a preview link, not a pair of attachments to eyeball.
- Source: operator process rulings 2026-08-25, recorded in the orchestrator's memory and
  exercised in every S-slice review since.

## Anti-patterns

- Marking an issue done because the branch exists or the diff looks plausible
- Reporting "should work" / "looks right" / "the code handles this" as if it
  were verification
- Skipping an AC because it's inconvenient to test, without naming the gap
- Inventing ACs after the fact to match whatever got built
- Closing with a partial pass and no explicit defer/block decision
- A shipped summary that lists only the passing ACs and omits the rest
