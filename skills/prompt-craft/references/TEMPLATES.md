# Templates & worked examples — prompt-craft

Skeletons are a starting point, not a form to fill blindly. XML tags are optional — headings work as well; the point is *separated sections* so data isn't read as instruction.

## 1) EXECUTION task prompt (work order)

```xml
<role>You are a {role} specializing in {domain}. Follow repo conventions; prioritize correctness over cleverness.</role>

<context>
Why this matters: {1–3 sentences — the point of the change}.
Repo/stack facts: {languages, frameworks, versions, paths, the conventions to match}.
</context>

<task>
Job to be done (one sentence): {…}
Deliverable: {exact artifact — e.g. "one PR + patch list"}.
Non-goals: {what NOT to touch}.
</task>

<constraints>
<always>{read files, run tests, match existing patterns}</always>
<ask_first>{schema/API/dependency changes, anything destructive}</ask_first>
<never>{force-push, delete data, add deps without approval}</never>
</constraints>

<instructions>
1) … 2) … 3) …   (ordered only if steps depend on each other)
</instructions>

<success_criteria>
- [ ] {observable behaviour}
- [ ] {test / lint / typecheck command that must pass}
- [ ] {edge cases A/B/C covered}
Before finishing: run the checks; if failing, iterate; then re-verify against this list.
</success_criteria>

<examples>
<example>Happy path: input → expected output</example>
<example>Edge case: input → expected output</example>
<example>Counter-example: what a BAD result looks like</example>
</examples>
```

### Before → after (execution)

**Bad (under-specified, vibe words):**
> Clean up the pagination helper and make it robust.

**Good:**
> Fix the off-by-one in `paginate()` in `src/lib/pagination.ts` — it returns one extra item on the last page.
> Deliverable: one PR. Non-goals: don't change the public signature or touch callers.
> Done when: new test `returns exact pageSize on the final page` passes, `npm test` and `npm run typecheck` are green, no other files changed.
> Never: add a dependency or alter the API.

Two implementers now converge; "done" is a pass/fail check.

## 2) STRATEGY / design brief (open exploration)

```xml
<role>You are a {strategy role}: rigorous, options-oriented, constraint-aware.</role>

<givens>
Settled context — do NOT re-litigate: {the facts that are fixed}.
</givens>

<question>
What should we do about {the decision}? Do not assume a preferred solution.
{If it has two halves, ask both openly.}
Tell us what we're missing.
</question>

<evaluation_criteria>
Rank options against outcome-level criteria: {e.g. operational complexity, time-to-MVP, privacy}.
Call out assumptions and unknowns.
</evaluation_criteria>

<exemplars>
Draw on (as inspiration, not the answer): {Anthropic, named competitors, prior art}.
</exemplars>

<output_format>
- Options (3–5), each summarized
- Tradeoffs vs the criteria
- Risks + mitigations
- Recommendation + a fallback
- Next-step experiments to validate the key unknowns
</output_format>
```

### Before → after (strategy)

**Bad (pre-decides, slices narrow):**
> Firm up the video-gen tool list for the workflow.

**Good (the DES-218 shape):**
> Givens (don't re-litigate): orchestrator + doer subagents, multi-project, model-efficient, prompts/skills matter as much as the model.
> Question: what does a best-in-class agent setup look like, and what skills — shared and per-role — do we need to perform best-in-class? Tell us what we're missing.
> Draw on: Anthropic, Cognition, AutoGen, CrewAI, MetaGPT — as reference, not the answer.
> Return: options with tradeoffs, a recommendation, and the gaps you'd close next.

The narrow version answers a sub-slice; the wide version surfaces the real question.
