# Mechanical scripts — parent-only, never a doer dispatch

`scripts-not-agents`, 2026-09-22 (operator: "is there anything else we use agents for that
could just be a script?" → "let's do it"). Four mechanical lane shapes are deterministic
scripts under `hooks/scripts/`; the parent calls them directly, as standalone Bash calls,
never inside a brief.

| Trigger | Script | Replaces |
|---|---|---|
| "Build main to a preview version" | `release-build.mjs --repo <path> [--sha <sha>] [--dry-run]` | the haiku "build main to a preview version" lane |
| A repo's `doer-rules.md` copy is due a resync | `rulebook-sync.mjs --source <discipline main> --repos <list> [--dry-run]` | the five-repo sync lane |
| A design-handoff export needs vending into a DS repo | `ds-regen.mjs --export <zip\|dir> --repo <DS path> [--dry-run]` — prints the export's `changes` block + VALUE-DRIFT count; the parent still reads and rules on it | the DS regen lane |
| A reviewed PR is green and ready to land | `merge-after-review.mjs --pr <owner/repo#n> --repo <path> [--dry-run] [--then-build]` — refuses unless CI is all SUCCESS and mergeable | the parent's manual merge chain |

Each script accepts `--dry-run` and has its own law test driving it against a scratch git
repo (never a real remote) with `gh`/`pnpm` stubbed on `PATH`. Boundaries: a script never
edits product source; a non-zero exit prints exactly what it did not do. `lane-end.mjs`
chains `--then-merge <owner/repo#n> --repo <path> [--then-build]` to call
`merge-after-review.mjs` (then `release-build.mjs`) after a landed lane's queue-row write.
