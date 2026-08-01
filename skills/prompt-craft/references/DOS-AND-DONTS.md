# Do's and Don'ts — prompt-craft

---

## Do

| Do | Why |
|----|-----|
| **Choose the altitude first** — execution work order vs strategy brief — then tune specificity | The two have opposite failure modes; the same prompt can't serve both |
| **Run the colleague test** — a minimally-briefed teammate could execute it without a question | Anthropic's golden rule; ambiguity that confuses a human confuses the model |
| **Open the execution prompt with a one-sentence job-to-be-done** | Anchors everything that follows; forces you to know the point |
| **Write acceptance criteria as pass/fail checks** (tests, lint, typecheck, observable behaviour) | "Done" becomes verifiable, not a guess |
| **Set Always / Ask-first / Never boundaries** on execution tasks | Agents over-act (refactors, new deps, destructive actions) without them |
| **Point at house conventions and the surrounding code** | The doer matches the repo instead of guessing a style |
| **For strategy: state givens, pose the whole question, invite the unknown, name exemplars** | The DES-218 shape — surfaces the real question, not a sub-slice |
| **Give 3–5 diverse examples incl. one counter-example** | Locks format/decisions; a counter-example teaches the boundary |

---

## Don't

| Don't | Why |
|-------|-----|
| **Use vibe words** — "clean", "modern", "robust", "make it great" — with no operational meaning | Two implementers diverge; nothing is verifiable |
| **Under-specify an execution task** (missing edge cases, missing definition of done) | The dominant, costly failure mode — large empirical quality drops |
| **Over-specify a strategy brief** — hand it the approach then ask it to "evaluate" | Premature convergence; kills the exploration you asked for |
| **Slice the big question thin** for a strategy/design ask | A narrow brief answers a sub-slice and misses the real question |
| **Bury actionable lines inside a stakeholder narrative** | The agent can't reliably tell inspirational from actionable |
| **Mix data and instructions in one blob** | Data gets read as a constraint (or vice-versa); separate the sections |
| **Paste execution-style acceptance tests into a strategy brief** | Forces shallow compliance instead of exploration |
| **Over-scope an execution task** ("build the whole dashboard") | Won't fit one agent session; slice it vertically (see "Slicing the work" in the skill) |

---

## Branch-specific

### Writing an execution work order (the *what* is decided)
**Do:** job-to-be-done first line → deliverable + output format → pass/fail acceptance criteria → Always/Ask/Never → operational facts & conventions → phase only if steps depend on each other.
**Don't:** leave "done" implicit, or prescribe implementation detail the doer should own.

### Framing a strategy / design brief (the *what* is the question)
**Do:** state givens as fixed context → pose the whole open question (both halves) → invite the unknown → name exemplars without pre-deciding → outcome-level criteria → require options/tradeoffs/recommendation/fallback.
**Don't:** pre-decide the answer, or narrow to a sub-query.

### Ambiguous ask ("write a prompt to make the app better")
**Do:** name the altitude decision, refuse vibe words, and pull for the missing specifics (execution: deliverable + ACs; strategy: the decision + givens + criteria).
**Don't:** produce a vague prompt that inherits the ambiguity.

### The board mechanics (fields, slicing, routing)
**Do:** that is dispatch mechanics — this skill writes the *description*; pair it with `dispatch-brief`.
**Don't:** restate task-setup's field list or slicing rules here.

---

## The tell (good vs bad)

- **Good execution prompt:** a teammate runs it without questions; "done" is a pass/fail check; two implementers converge.
- **Bad execution prompt:** you can't write ACs without inventing requirements; two implementers diverge.
- **Good strategy brief:** poses the decision, states givens, invites the unknown, asks for options.
- **Bad strategy brief:** pre-decides the answer then asks the agent to "evaluate"; slices the question narrow.
