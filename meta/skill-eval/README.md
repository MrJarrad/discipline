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

## Known limitations (as of the T3-T6 build, 2026-08-01)

- **Route-case scoring does not yet read the `--json-schema` structured output.**
  `sampleOutcome` currently scores every case type off `Skill` tool_use blocks
  in the transcript; `route` cases ask the model to *state* a persona/skills
  decision via a JSON schema without loading a persona, so nothing fires a
  `Skill` tool and every route case reads RED regardless of the actual
  decision quality. Fix: parse the run's structured JSON result into
  `observed.persona`/`observed.skills` and score route cases against that
  field instead of tool_use.
- **Session ID collisions across separate invocations.** `workflow.mjs`
  derives each agent's session id deterministically from `${spec.name}:
  ${label}`, and `skill-eval.mjs` always names the spec `skill-eval-<arm>` —
  so two separate `--live` runs using the same case ids collide on the same
  session ids and the second run's colliding agents fail outright ("Session ID
  ... already in use"). Fix: fold a run nonce (timestamp or random suffix)
  into the spec name before dispatch.
- **Short, context-free `trigger` prompts under-fire.** Empirically (T6 live
  run, 2026-08-01), a bare phrase with no surrounding task — even one that
  reproduces a skill's own trigger language verbatim — does not spontaneously
  invoke the Skill tool at maxTurns 4, haiku *or* sonnet, low or default
  effort: the model asks a clarifying question instead of reaching for a
  skill it has no work to apply. Case prompts likely need real task framing
  (a concrete file, a real decision to make) to exercise triggering
  meaningfully, not just the phrase itself.
