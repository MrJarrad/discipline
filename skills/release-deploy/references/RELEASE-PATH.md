# Release path (DISC-172, session 25)

A release comes only from `main`, by `pnpm release:promote` in the product repo: it promotes, waits for
the build to settle, runs 12 real-Chromium repetitions against live, and rolls back on its own if they fail. No
hand-pushed `release` branch, no promote from a branch. Helper PRs open as **drafts**, so un-drafting is a
planned step the parent takes after the gates and review; a helper may do it itself only under ruling
`2026-10-15-agents-may-undraft-reviewed-prs` (passing gate run and reviewer verdict with no red finding; `routing` HARD-RULES 22). The gate evidence is the one
gate-run tail comment (`doer-rules.md` § Gate-run tail): one format, parsed by `merge-after-review.mjs` and
`lane-end.mjs`.


## Release follows merge (DISC-178, ruling `2026-10-15-release-follows-merge`)

Operator, 2026-10-15, on a "Release again?" row: "yes, ( can we fix this type of thing so i don't need to be involved)". When main holds changes already merged under the merge condition (gates green, reviewer verdict, and for a look change his yes), the **parent starts the release without asking**: release <- main PR, gate run, LIGHT review, then `pnpm release:promote` (settle, Chromium reps, auto-rollback). The operator hears the outcome after, in one line; it is never a `Needed from you` row. `row-add.mjs` refuses a queue row (or a `waiting on operator` backlog row) whose only ask is a release, and `needed-from-you.mjs` does not print one.

**Still the operator's:** anything that changes what production visitors may see (SITE_MODE holding -> live, a new public route, removing the holding page), and a release whose promote checks fail and auto-roll back twice. A row that carries one of these passes the guard; name the call in the row. Applies to jhd-portfolio now, other products once their release path has the same auto-rollback.
