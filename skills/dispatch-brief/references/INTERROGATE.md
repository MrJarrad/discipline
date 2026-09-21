# Interrogate the brief

Operator ruling 2026-09-20, `brief-is-the-lever`: *"there's generally nothing that complex
about frontend work that the right and accurate brief... wouldn't be easy enough for cheaper
models."* The lever is the brief, not the model. Before any dispatch above trivial/small-fix,
the brief is read as the doer would — pointers followed, nothing assumed — and answered
against a fixed set. Findings fix the brief; only then does the lane open.

## The fixed question set

1. Can every contract item — design (node ids, tokens, example frames) or build (the
   files/components/selectors touched, each named, never a glob) — be enumerated from the
   brief and its pointers alone?
2. Which numbers lack a source or knob?
3. Which mechanisms are unnamed?
4. Where would the doer be forced to assume?
5. Is done-when measurable at the operator's framing?
6. Is there exactly one contract unit?
7. Which named skills are missing for the domain?
8. Model above sonnet: is the justification written, and does it name one of the two
   cases (`model-routing`: adversarial review of a change with fleet-wide blast radius, or
   novel architecture with no contract to point at)?

## Who runs it

**Above trivial/small-fix:** a read-only `haiku` agent, findings only, never `Agent`s further.
**Trivial/small-fix:** the parent, inline.

Template:

```
Read <brief path/pasted brief> and its pointers only, as the doer would. Answer the eight
questions in `dispatch-brief/references/INTERROGATE.md` § The fixed question set. Findings
only, one line each, no fixes.
```

## Recording the result

Findings fix the brief. It carries:

```markdown
## Interrogated
<finding summary, fixes applied> | or: "inline, clear"
```

A brief with no `## Interrogated` field is malformed — the same footing as a brief that
restates the contract instead of pointing at it.
