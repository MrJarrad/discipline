---
name: define-terms
description: Actively sharpen a project's domain vocabulary — challenge fuzzy or colliding terms, maintain the CONTEXT.md glossary, record lightweight ADRs when decisions crystallise. Trigger on "just to be clear", "need to be clear on this one", "what I mean by X is", "I've renamed X to Y", naming disputes (component/variable/block names), or whenever the operator corrects terminology mid-task. Not for document templates — that's doc-formats.
---

# Define Terms

Sits under `quality` (the bar for verification, evidence, and honesty). This
skill doesn't restate that loop — it adds the one discipline vocabulary work
needs on top of it: **actively changing the domain model, not just reading it.**

Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) before applying this skill.

Merely reading `CONTEXT.md` for background is not this skill — any skill can do
that in passing. This skill is for when you're **changing** the model: a term is
fuzzy, two words mean the same thing, one word means two things, or a decision
just crystallised and needs recording.

---

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with `CONTEXT.md`, call it out
immediately. *"Your glossary defines 'cancellation' as X, but you seem to mean
Y — which is it?"*

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term.
*"You're saying 'account' — do you mean Customer or User?"* When two words mean
the same thing, pick one and drop the other from active use.

### Discuss concrete scenarios

Stress-test domain relationships with specific scenarios. Invent edge cases
that force precise boundaries between concepts — "When a guest checks out
mid-stay and the host cancels the same night, is that a Booking or a Dispute?"

### Cross-reference with code

When the user states how something works, check whether the code agrees.
Surface contradictions: *"Your code cancels entire Orders, but you said partial
cancellation is possible — which is right?"*

### Update CONTEXT.md inline

When a term is resolved, update `CONTEXT.md` immediately — don't batch to end
of session. Delayed writes lose nuance and let the wrong word spread into
specs, tickets, and code.

`CONTEXT.md` is **glossary only** — one canonical term per concept, a tight
definition, and what to avoid. No implementation details, no specs, no scratch
notes. If the user wants a fuller design doc, that belongs elsewhere (a PRD,
an issue, `docs/`) — keep CONTEXT.md to vocabulary.

**Shape** (create the file lazily, on the first resolved term — never
pre-create empty boilerplate):

```md
# {Context Name}

{One or two sentence description of what this context is and why it exists.}

## Language

**Order**:
A confirmed request to purchase one or more items.
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request
```

Rules: be opinionated (when several words compete, pick the best and list the
rest under `_Avoid_`); keep each definition to one or two sentences, defining
what the term IS, not what it does; only include terms specific to this
project's domain — general programming concepts (timeouts, error types, retry
policies) don't belong even if heavily used; group under subheadings once
natural clusters emerge, otherwise a flat list is fine.

Most repos need only one `CONTEXT.md` at the root. If the domain genuinely
splits into separate bounded areas (a monorepo with distinct services, say),
use a `CONTEXT-MAP.md` at the root that lists each context, where it lives, and
how the contexts relate — then one `CONTEXT.md` per area. Don't split
prematurely; a single file is the default.

### Offer ADRs sparingly

Offer a lightweight Architecture Decision Record only when **all three** are
true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why on earth
   did they do it this way?"
3. **Real trade-off** — there were genuine alternatives, rejected for stated
   reasons

Skip if any leg fails — that decision belongs in CONTEXT.md prose or a PR
comment, not a standalone record. Qualifying examples: architectural shape,
integration patterns between contexts, technology choices that carry lock-in,
explicit boundary/scope decisions, deliberate deviations from the obvious
path, constraints invisible in the code. Non-qualifying: anything easily
reversed, anything unsurprising, anything with no real alternative considered.

**Shape** (create `docs/adr/` lazily, on the first qualifying decision; number
sequentially — `0001-slug.md`, `0002-slug.md`, scanning for the highest
existing number and incrementing):

```md
# {Short title of the decision}

{1-3 sentences: what's the context, what did we decide, and why.}
```

That's the whole template — an ADR can be a single paragraph. The value is in
recording *that* a decision was made and *why*, not in filling out sections.
Add a `Status` line, `Considered Options`, or `Consequences` only when they add
genuine value; most ADRs won't need them.

---

## References

- [DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) — concise dos/don'ts and branch guidance
