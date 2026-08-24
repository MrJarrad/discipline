# Do's and Don'ts — grilling

---

## Do

| Do | Why |
| --- | --- |
| Ask the **whole frontier** each round — every decision whose prerequisites are settled | Independent decisions in one round; dependent ones wait for the next |
| Number each question; pair with **one recommended answer** | Concrete to react to, not a bare quiz |
| Ask at **experience altitude** — what the user sees, feels, owns | Operator is a designer, not an engineer |
| **Translate** experience answers into technical meaning in Locked decisions | Doer gets one translation, not a vibe word |
| **Look up facts** in code/docs/vault yourself | Facts are never the operator's job |
| Compose **`define-terms`** when a repo is open | Vocabulary stays sharp as decisions land |
| Confirm **shared understanding** before dispatch | Empty frontier alone is not permission to build |
| Emit **Locked decisions** verbatim before `Agent` | Briefs quote operator words, not paraphrase |

---

## Don't

| Don't | Why |
| --- | --- |
| Ask **engineering fork** questions (stack, pattern, library names) | Operator can't answer; agent decides or reframes as experience |
| Put **dependent** questions in the same round as their prerequisites | Cherry-picking — user answers easy ones, hard dependency stays open |
| Offer a **menu** of technical options | One rec + named alternative rejected, per operator-voice |
| Ask the operator to **restate what code shows** | Wastes their time; do the read |
| **Dispatch** while the frontier is non-empty (unless explicit skip) | Root cause of many-round rework |
| **Paraphrase** locked decisions in the brief | Translation drops; quote verbatim |
| Grill a **bugfix with repro** or **just implement this** | Wrong tool |

---

## Branch-specific

### Thin context / vague ask

**Do:** Draft the implicit tree from context; mark Assumption on unsettled branches;
grill the frontier anyway.

**Don't:** Dispatch hoping the doer will figure it out.

### Operator says skip grill

**Do:** Name what's still open once; proceed if they insist.

**Don't:** Re-litigate after they've overridden.

### Technical question feels unavoidable

**Do:** Reframe as experience ("what should happen when X fails?") or decide it in
Locked decisions without asking.

**Don't:** Ask "Redis or Postgres?" and wait.

---

## Output format

Each round:

1. **Frontier** — count of open decisions this round.
2. **Questions** — numbered, experience-level, each with recommended answer.
3. **After answers** — what settled, what moved to next round's frontier.

When done:

4. **Locked decisions** table — operator verbatim + technical translation.
5. **Confirm** — shared understanding before dispatch.
