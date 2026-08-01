# meta/skill-eval

The one eval harness for the discipline plugin (collapses the five harness names
`agent-ops` used to promise — `skill-trainer`, `eval-loop`, `skill-compare`,
`agent-evals`, `model-routing-eval` — into one; operator decision, 2026-08-01).
Scores whether a prompt triggers the right skill(s) and routes to the right
persona, on transcript evidence, never self-report.

- Case file: `cases.json` — `route` / `trigger` / `fence` cases (shape:
  `~/JHD/vault/documents/eval-harness-shape-2026-08-01.md` §5.1).
- Runner + scorer: `../../scripts/skill-eval.mjs` (`node --test
  scripts/skill-eval.test.mjs` for the unit suite; `node scripts/skill-eval.mjs
  meta/skill-eval/cases.json --live --baseline-plugin-dir <worktree>` for a real
  gate run).

## Out of scope for v1

Output-quality scoring (was `skill-compare`), charter-quality-once-loaded (was
`meta/agent-evals`), and model-tier/effort routing (was
`meta/model-routing-eval`) are not covered — v1 answers "did the right skill
load", not "was the resulting work better" or "was the right model used". See
the shape doc §7 for the full list and rationale.

## Validity fixes landed (T6-v2, 2026-08-01)

The three gaps the first live T6 run (`~/JHD/vault/documents/skill-eval-t6-first-run-2026-08-01.md`)
found are closed:

- **Route-case scoring now reads the `--json-schema` structured output.**
  `runArms` captures each agent's `result` off `runWorkflow`'s `log` callback
  and, for any agent that carried a `jsonSchema` (route cases), parses it
  with `parseRouteResult` into `observed.persona` — `sampleOutcome` scores
  route cases against that field, not `Skill` tool_use blocks. Route verdicts
  are trustworthy now; the earlier "scorer ignores --json-schema" caveat no
  longer applies.
- **Session-ID collisions across separate `--live` invocations are fixed.**
  `workflow.mjs`'s `runClaude` accepts an optional `sessionSalt`, folded into
  the deterministic-session-id seed only when present — every other spec's
  `buildArgs` output is byte-identical to before. `skill-eval.mjs` generates
  one random `runNonce` per CLI invocation and threads it onto every
  generated agent as `sessionSalt`, so two separate runs of the same case
  set never collide.
- **Trigger fixtures were rebuilt as grounded task prompts.** Each `trigger`
  case in `cases.json` now poses a real, task-anchored ask (a concrete file
  in `~/JHD/vault`, a real decision to make) instead of a bare phrase, still
  without ever naming the target skill (fixture lint enforces this).
  `maxTurns` for trigger cases was raised to 8 (from the harness default 4)
  to give the model room to actually engage the task before the run caps
  out. Whether this closes the T5/T6 empirical finding — that short,
  context-free prompts never spontaneously invoke a skill at low `maxTurns`
  — is what the T6-v2 re-run tests; see the re-run's own results record for
  the outcome, including if it turns out to be a genuine resolution limit of
  the harness rather than a fixture problem.
