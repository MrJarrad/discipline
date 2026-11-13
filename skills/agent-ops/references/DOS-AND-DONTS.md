# agent-ops — Dos & Don'ts

The quick reference beneath the skill. When applying `agent-ops`, these are the observable
behaviours that separate a change that makes the system better from one that just *reads*
better.

## Do
- **Diagnose from real runs first** — name the failure mode and the artifact that owns it before editing.
- **Change one lever at a time** — skill *or* prompt *or* model, never two in a pass.
- **Gate every change with an eval** — GREEN *and* a baseline that shows it discriminates.
- **Keep one canonical home** — reference a skill from charters/tool-descriptions; never copy the procedure.
- **Write tool descriptions as prompts** — state WHAT and WHEN, plus the anti-trigger for when *not* to fire.
- **Turn each correction into a scenario** — so the gate catches the regression next time.
- **Name the sync step** — merging to `skills/` is publish; importing to the store + `desiredSkills` is what makes it live.
- **State the per-use cost when you tighten a gate** (s84: the archive guard grew until 27 finished helpers could not be archived in a session). A PR about a gate or guard carries `Per-use cost: <calls one use takes now, and before>`; `pr-row-gate.mjs` refuses it without. A check costing more than a few calls needs a cheaper evidence source (DISC-315: one open-PR lookup).

## Don't
- **Don't ship a mechanism change un-evaluated** — "reads better" is not evidence.
- **Don't weaken a scenario to force GREEN** — fix the artifact or escalate at the cap.
- **Don't tune the skill and swap the model together** — you lose attribution and can't gate it.
- **Don't duplicate procedure** into a charter or tool description — that's drift; fix the source.
- **Don't keep an unused skill/charter/tool** "just in case" — no live consumer means delete.
- **Don't treat a tool description as documentation** — it's the only thing steering the model's tool choice.
- **Don't assume merge = live** — the company store is synced separately from the repo.
- **Don't tighten a gate round by round without pricing a use** — each added requirement multiplies the calls a lane pays; the guard that cannot be passed in a session has failed its job.
