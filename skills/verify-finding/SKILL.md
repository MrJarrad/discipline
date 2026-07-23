---
name: verify-finding
description: Ground a claim about how code works or how to implement a change with a 0-100 confidence score, typed sources citing path:line, and a short why. Use before tracing behaviour, choosing an implementation approach, answering "does X exist / what calls Y", or acting on any assumption about the codebase. Loops — gathering a new primary source each pass — when confidence is below 40, capped at 3 loops before escalating.
---

# Verify Finding

quality says "verify before claiming — no should work." This skill is the
mechanism: score the claim **0–100**, back it with **typed sources**
(project code as `` `path:line` ``), and loop when the score is too low to act on.

**Not for:** pure formatting, obvious syntax fixes, or applying a preference the
user already stated — that's normal work, not a finding.

---

## When this applies

- Tracing how an existing feature behaves
- Choosing where or how to implement a change
- Answering "does X already exist?" or "what calls Y?"
- Forming assumptions about the codebase before writing code against them
- Summarizing investigation before handing off to implementation or triage

---

## The finding block

For each claim that affects the next action, emit one block:

```markdown
### Finding: <one-line claim>

| Field | Value |
| ----- | ----- |
| **Confidence** | <0–100>/100 |
| **Sources** | 1. `[code]` `path/from/repo.ext:line` - <takeaway><br>2. `[test]` `path/to/test.ext:line` - <takeaway> |
| **Why** | <2-4 sentences tying sources to the claim; name `path:line` for project code; note gaps> |

**Next action:** proceed | loop (missing: …) | ask user
**Score delta:** <only on loop iterations, e.g. 20/100 → 48/100>
```

Multiple claims → multiple blocks, load-bearing one first. Don't merge unrelated
claims into one block — split them.

---

## Confidence bands

Default to **15/100** before you've opened any primary source. Score lower when
in doubt, and let the score fall as sources conflict rather than round up.

| Band | Score | Action |
| ---- | ----- | ------ |
| **Insufficient** | 0–39 | Mandatory research loop. Do not implement, recommend merge, or close triage on this finding alone. |
| **Partial** | 40–69 | State the gaps explicitly. Loop before irreversible work, or get the user to acknowledge and proceed. |
| **Grounded** | 70–100 | Proceed — still list sources with `path:line` so the work is auditable. |

**85–100** requires all of: primary `[code]` at the definition (not a caller) with
`path:line`, or `[test]`/`[runtime]` confirming behaviour this session; the source
directly supports the specific claim, not something adjacent; no unresolved
contradiction from anything else you checked; and the **Why** names the actual
paths. **70–84** is the same shape with a minor untested edge case. Below 70,
you're relying on secondary sources (callers/usage, not the definition), a single
stale-looking source, or a behaviour claim backed by code-reading alone with no
test or runtime confirmation. Below 40 means no primary source at all this
session, inference from file/folder naming, unresolved conflicts, or "probably" /
"I think" without a citation.

If sources conflict: state the conflict in **Why**, cap the score at **35 or
below** until resolved, prefer the definition over its callers and
`[test]`/`[runtime]` over comments, and if still unresolved after 3 loops, ask the
user which source wins.

---

## The research loop

```
Assess → below 40? → add a new primary source → re-score → repeat → ≥70, or 40-69 with ack → act
```

Each iteration must add **at least one new primary source**, not a reworded
version of the same one. Typical jumps: +15–25 for a new `[code]` citation at the
definition, +10–20 for a new `[test]`/`[runtime]` result, +10–15 for a second
agreeing source, +5–10 for resolving a conflict with a stronger primary. Show the
score delta each pass.

**Cap: 3 loops.** Still below 40 after three passes → stop acting and tell the
user exactly what's missing (which file to read, which test to run, what access
you lack). Guessing past the cap defeats the point.

---

## Typed sources

Every source is tagged by type and, for project code, carries a repo-relative
`path:line`.

| Tag | When | Example |
| --- | ---- | ------- |
| `[code]` | File you opened in this repo | `` [code] `src/checkout/PayButton.tsx:18` - debounceMs=300 `` |
| `[test]` | Test file or run output | `` [test] `tests/pay.test.ts:44` - asserts single charge `` |
| `[runtime]` | Command you actually ran | `` [runtime] `curl localhost:3000/health` - 200, body … `` |
| `[doc]` | In-repo doc (ADR, README, CONTEXT.md) | `` [doc] `docs/adr/0007-refunds.md` - partial refunds allowed `` |
| `[external]` | Outside the repo | `` [external] Stripe API docs - idempotency keys on POST `` |
| `[chat]` | User message, issue title, Slack | `` [chat] user message - unverified until `[code]` `` |

**Project code rule:** never cite a module, class, or folder name alone — always
`path:line`. If you only know the file, open it and find the line before scoring
above 40. `[chat]` and other weak sources cannot alone justify **≥ 70**.

List strongest first: `[code]`/`[test]`/`[runtime]` at the definition, then
callers, then docs, then `[chat]`.

---

## Research priority

1. **Primary** — the definition in `[code]` at `path:line`, or `[test]`/`[runtime]` output
2. **Secondary** — callers and usage sites (still cite `path:line`)
3. **Tertiary** — `[chat]`, issue titles — never sufficient alone for ≥ 70

Read, grep, or run before writing "probably."

---

## Anti-patterns

- Scoring ≥ 70 without a `[code]` `path:line` or `[test]`/`[runtime]` you produced this session
- Implementing below 40 "to find out"
- Citing project code by folder or class name only, no line
- Listing sources with no **Why** tying them to the claim
- Rewording the same source across loop iterations instead of adding a new one
- One giant finding mixing unrelated claims — split them
- Running a full verify pass on a trivial syntax fix or a preference the user already stated

See [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) for the condensed checklist.
