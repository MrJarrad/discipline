# Cloud-first projects, Drop intake, the Mac bridge

Moved verbatim from `skills/cloud-dispatch/SKILL.md` (DISC-351 step 8); the skill points here.

Operator, 2026-09-30 (`2026-09-30-cloud-first-intake-and-mac-queue`): *"ideally we solve cloud
agents"* · *"i would expect local agents to be dispatched from the orchestrator … so automatic i
guess"*. Long-running doer work for cloud-eligible projects (portfolio, hoverboard) runs in Claude
cloud sessions; each repo's `CLAUDE.md` "Cloud sessions" holds its recipe.

- **Asset intake:** `~/JHD/Drop` syncs to private R2 `jhd-drop` (objects expire after 7 days, so a
  re-upload of an expired unchanged file does not happen); Drive My Drive/JHD/Drop is secondary
  (connector caps downloads at 10 MB). Read R2 by REST `/r2/buckets/jhd-drop/objects` — `wrangler r2
  object list` does not exist — with `CLOUDFLARE_ACCOUNT_ID` in the environment and in the brief.
- **Mac-only work returns by queue:** a job file in `queue/mac/pending/` on origin/main is claimed
  by the Mac runner (`estate/mac-queue/`, `claude -p --permission-mode auto` in the job's `repo:`
  under `$HOME`) and lands in `done/` or `failed/`. Session-branch jobs sat unclaimed: merge to
  main first (`routing` rule 9). Run `hooks/scripts/mac-job-check.mjs <file>` before filing — it
  mirrors the runner's exit 97 (`repo:`), 98 (empty brief) and requires the next line.
  **Every job brief says "no background tasks, no subagents"** — a headless job that backgrounds
  long work is killed at the 600 s background-wait ceiling (2026-09-30, 2026-10-07).
  Previews need no Mac: cloud cannot `upload` portfolio versions, but a `preview/*` push
  publishes the Workers Builds alias (`present-for-review`). **Every job brief
  opens "You ARE the job; the `running/` entry is your own claim"** — a job once saw its own claim
  on main, concluded another run was live and exited "done" unprobed. The runner injects that line
  itself (vault-side, `skipped(other-repo)` here).
