# Do's and Don'ts — define-terms

---

## Do

| Do | Why |
|----|-----|
| **Challenge** terms that conflict with `CONTEXT.md` | Ubiquitous language stays consistent |
| **Sharpen** vague or overloaded terms into one canonical name | Prevents drift and ambiguity |
| Invent **concrete scenarios** for edge cases | Forces boundary clarity between concepts |
| **Cross-reference code** when domain behavior is stated | Model must match reality |
| Update `CONTEXT.md` **inline** the moment a term resolves | Don't lose crystallised decisions |
| Keep `CONTEXT.md` to **one or two sentences per term** | Definitions stay scannable, not essays |
| Offer an **ADR** only when hard-to-reverse + surprising + real trade-off | ADRs are expensive attention |

---

## Don't

| Don't | Why |
|-------|-----|
| Put **implementation details** in `CONTEXT.md` | Glossary only, not a spec |
| Use `CONTEXT.md` as a scratch pad or design doc | Wrong artifact for that content |
| Offer an ADR for obvious or easily reversed choices | Noise nobody will read later |
| Batch glossary updates until end of session | Terms get forgotten or drift |
| Add general programming terms (timeouts, retries, error types) to the glossary | CONTEXT.md is domain-specific, not a programming primer |
| Split into multiple `CONTEXT.md` files before the domain actually splits | Premature structure; default to one file |

---

## Branch: no CONTEXT.md yet

**Do:** Create the root `CONTEXT.md` lazily, on the first resolved term.

**Don't:** Pre-create an empty file with section headers and no content.

---

## Branch: user wants a spec or schema folded into CONTEXT.md

**Do:** Redirect — glossary stays in `CONTEXT.md`; specs, API designs, and
schemas go in a PRD, issue, or `docs/`.

**Don't:** Expand `CONTEXT.md` into an implementation document because it's
convenient to have "one doc."

---

## Branch: a decision comes up mid-conversation

**Do:** Check it against all three ADR criteria before offering to record it.
If it passes, offer briefly — don't force it into the conversation.

**Don't:** Write an ADR for a naming choice, a typo fix, or anything the team
would reverse without a second thought.
