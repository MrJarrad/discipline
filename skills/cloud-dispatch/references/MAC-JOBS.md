# Mac jobs — review-first jobs and repo checkouts

The queue itself (filing, `mac-job-check.mjs`, the no-background line) is `cloud-dispatch` § Mac-only work; the runner is vault `estate/mac-queue/`.

- **A job that needs review first is filed in `queue/mac/review/`**: the runner reads `review/` on origin/main only, so it runs once its PR merges, never before (DISC-233: a `pending/` job on a `claude/*` branch ran before its review).
- **A job brief that builds or tests a repo** clones it fresh into a temp tree (never the operator's checkout: an uncommitted edit there stopped a job), names the commit it needs and checks the remote head carries it before queueing (`git ls-remote`), checks out with `git fetch origin <sha>` then `git worktree add <dir> FETCH_HEAD`, and frees ports with the macOS form `lsof -ti tcp:A -ti tcp:B` (s45, DISC-230).
- **A job that needs the operator's login is queued only after he signs in and confirms** (s67: two Safari runs measured the Access login page, then a signed-out Safari). The ask is a queue row: what to sign into, where, and "say done".
