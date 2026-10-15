# Release path (DISC-172, session 25)

A release comes only from `main`, by `pnpm release:promote` in the product repo: it promotes, waits for
the build to settle, runs 12 real-Chromium repetitions against live, and rolls back on its own if they fail. No
hand-pushed `release` branch, no promote from a branch. Helper PRs open as **drafts**, so un-drafting is a
planned step the parent takes after the gates and review (never the helper). The gate evidence is the one
gate-run tail comment (`doer-rules.md` § Gate-run tail): one format, parsed by `merge-after-review.mjs` and
`lane-end.mjs`.

