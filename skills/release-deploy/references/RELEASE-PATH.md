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


## Every new session on the latest plugin: server-managed settings (DISC-299, s81)

Operator ruling `2026-11-12-every-session-on-latest-plugin`: *"every new session should always be on the latest version of the plugin"*. A cloud session otherwise loads the plugin as of the Default environment's cached image (DISC-298), and a plugin cannot update itself before it loads. So the operator puts the marketplace in his claude.ai **server-managed settings** once (Organization settings > Claude Code > Managed settings, `https://claude.ai/admin-settings/claude-code`; Teams or Enterprise, Owner role), and a cloud session fetches them before it installs plugins (`code.claude.com/docs/en/plugins/org.md`):

`{"extraKnownMarketplaces":{"discipline":{"source":{"source":"github","repo":"MrJarrad/discipline"},"autoUpdate":true}},"enabledPlugins":{"discipline@discipline":true}}`

There is no per-release step. **Prove it in a fresh session, not by reading the settings:** `~/.claude/plugins/installed_plugins.json` names the version `.claude-plugin/plugin.json` holds on main, `known_marketplaces.json` lists `discipline`, and the SessionStart freshness hook prints no PLUGIN STALE line. If the first turn still shows an older plugin, the install landed after session start (the docs say it downloads in the background): run `/reload-plugins` and note it. Fallback only, if the managed route fails the proof: `node <plugin>/hooks/scripts/setup-refresh-line.mjs --date <today> --release <version> --line` prints the setup script's first line (`# plugin refresh <date> (discipline <version>)`); any edit to the Default environment's setup script rebuilds its cached image, but the edit needs the operator's approval every release, so the ruling is not met by it. DON'T: edit the environment from a release lane, or make the fallback the routine.
