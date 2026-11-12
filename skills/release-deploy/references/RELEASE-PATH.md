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


## A plugin schema bump releases the checker first, and shipped strings are checked at the source (s83)

A plugin's schema test reads the installed checker, so a schema bump ships only after the checker release is out. Text a plugin ships to the public (a note, a label, a message) is checked at its source for tracker ids and internal names, not at the toolkit import. DO: release the checker, then bump the schema; guard shipped text with a test (figma-plugins `shipped-text.test.mjs`). DON'T: bump first (figma-plugins' schema test read the old checker), or let an id reach the import (it surfaced there).

## After a discipline release: propose the setup-script refresh line (DISC-299, DISC-303, s81)

Operator ruling `2026-11-12-every-session-on-latest-plugin`: *"every new session should always be on the latest version of the plugin"*. This route does NOT meet that ruling: it needs one operator approval per release, because personal plans have no server-managed settings (the operator's admin page: "Organization settings are available on Claude Team and Enterprise plans"). The operator chose it anyway (2026-11-12, "yes to both"; DISC-303). A cloud session loads the plugin as of the Default environment's cached image (DISC-298), and any edit to the environment's setup script rebuilds the image.

**The step.** After each discipline release tag the parent runs `node <plugin>/hooks/scripts/setup-refresh-line.mjs --date <today> --release <version> --line`, reads the script with `get_environment`, and proposes the one-line change (the script's first line becomes `# plugin refresh <date> (discipline <version>)`) with `update_environment`: one approval card. The release lane never edits the environment. **Batch:** at most one discipline release a day, so the card costs the operator one approval a day at most; merged work waits for the day's release.

**Check it.** In a fresh cloud session after the bump, `~/.claude/plugins/installed_plugins.json` names the released version with `installedAt` at session start, and no PLUGIN STALE line appears. A session that started before the bump stays on its old image.

Proved (s81): editing the setup script rebuilt the Default image. A fresh cloud session after the `# plugin refresh 2026-11-12` edit had discipline 1.199.0 installed at session start (`installedAt` the session's start time), while a session on the 8 Nov image had 1.184.0.

Unconfirmed (the docs do not say, nothing here tested): the image also rebuilds after about seven days (a model-extracted summary of a truncated page); `autoUpdate` runs in a cloud session (it did nothing in a headless start); a project plugin under `.claude/skills/` loads in a cloud session (the s81 probe saw it NOT load, while plain project skills and a repo SessionStart hook did, in a single-repo session); that a session started before the bump is never served the old image after it. DON'T: edit the environment from a release lane, release more than once a day to feel current, or describe this route as meeting the ruling.
