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

**"Release follows merge" means the product's own live path: read the product handover's release note before dispatching release-ops.** Portfolio main merges go live on preview.jarrad.design via Workers Builds; `release:promote` only updates jarrad.design (go-live, PF-797), so there is no per-merge release lane for it (s73: one was dispatched).


## After a discipline release tag: bump the setup-script refresh line (DISC-299, s81)

A cloud session loads the plugin as of the Default environment image, which is rebuilt only when its setup script changes (DISC-298). After each discipline release tag, the releasing session runs `node <plugin>/hooks/scripts/setup-refresh-line.mjs --date <today> --release <version> --line` and gives the printed `# plugin refresh <date> (discipline <version>)` line to the parent, who reads the environment's script with `get_environment` and proposes the one-line change (first line of the script) to the operator; the environment is never edited by the helper. Once approved (the parent proposes it to the operator), the next fresh session starts on the new release. DON'T: edit the environment from a release lane, or skip the line because the previous one is still in place.
