# Do's and Don'ts — stress-plan

## Do

| Do | Why |
|----|-----|
| Ask **exactly one question** per response | Multiple at once lets the user cherry-pick the easy branch and skip the hard one |
| Pair every question with **your recommended answer** | A bare question isn't a stress-test — the user needs something concrete to react to |
| Walk the **design tree** one branch at a time | Parent decisions (auth model, data ownership) constrain children (sync strategy, UI states) |
| Wait for the answer before asking the next question | One-at-a-time is the entire mechanism |
| **Explore the codebase** first when the answer is discoverable in code | Don't ask the user to restate what a `grep` would show you |
| Ask what to stress-test when "grill this" arrives with no plan | Can't walk a design tree that doesn't exist yet |
| Stop at **shared understanding** — major branches resolved | Not every micro-decision needs resolving before build starts |

## Don't

| Don't | Why |
|-------|-----|
| Ask multiple questions in one message | The core anti-pattern this skill exists to prevent |
| Run the full interview on a **bugfix or clear implementation request** | Out of scope — that's normal work, not a plan to grill |
| Assume a detailed plan exists when the user gave none | Clarify what to stress-test before opening a design-tree walk |
| Ask the user something the codebase already answers | Wastes their time and skips legwork you could do yourself |
| Start building or editing code during the interview | The job is stress-testing the plan, not implementing it |

## Examples

**Good:**

```
Real-time sync needs a single user identity across devices first.

How should users sign in so todos stay attached to one account on every device?

My recommendation: require sign-in from day one with OAuth (Google + Apple);
skip anonymous-only mode unless offline-first is a hard requirement.
```

**Bad — batched questions:**

```
What's your auth strategy? And how will you handle conflicts? Also what database?
```

**Bad — grilling a bugfix:**

```
User: Fix the TypeScript error in utils.ts line 42.
→ Let's stress-test your plan for shared understanding...  ❌
```
