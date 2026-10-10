# discipline — Claude Code plugin

This repo is the **discipline plugin** (`.claude-plugin/plugin.json`): skills, agent
charters, an always-on output style and event hooks, installed from the plugin
marketplace. It is the canonical home of the library; products consume it, they do not
fork it.

## Layout
| Path | What it is |
|---|---|
| `skills/<name>/SKILL.md` (+ `references/`) | Auto-triggered craft and delivery skills; the description is the trigger surface |
| `agents/` | Doer charters (engineer, reviewer, researcher, ux-designer, project-manager, releaseops) |
| `doer-rules.md` | Standing rules every dispatched doer reads whole; `operator-rules.md` is the operator-facing counterpart |
| `output-styles/discipline.md` | The always-on orchestrator persona |
| `hooks/hooks.json` + `hooks/bin/` | Event handlers only (commit gate, typecheck marker, progress floors) |
| `hooks/scripts/` | Dev tools, their tests, and the container clone script `jhd-container-clone.sh` (the directory name is historical; none are hooks) |
| `CHANGED.txt` | Release log, newest first |

## Working here
- One rule, one owner: state a rule in one file and link to it elsewhere
  (`skills/skill-authoring`, `agents/` point at `doer-rules.md`).
- Tests: `node --test hooks/scripts/<name>.test.mjs` or `node --test hooks/bin/<name>.test.mjs`;
  there is no single runner yet. Skill body ceilings: `hooks/scripts/skill-ceilings.test.mjs`.
- A release bumps `version` in `.claude-plugin/plugin.json` and `marketplace.json` together
  and adds a `CHANGED.txt` entry; the commit gate checks the lesson ledger on a version bump
  (`DISCIPLINE_VAULT_ROOT`, skipped when no vault is present).
- After editing `doer-rules.md`, sync product repos:
  `node hooks/scripts/sync-doer-rules.mjs <target-repo-path> [...]` writes
  `.cursor/rules/doer-rules.mdc` in each target. `.cursor/rules/` is
  the always-on layer's path regardless of editor — the directory name is historical,
  not an editor dependency.

## Resuming
Read this project's handover in the vault (`projects/jhd-discipline/`) and
`orchestrator/cockpit.md`. If the vault is absent (cloud), say so and use the in-repo docs;
do not invent a handover.

## Boundary
Implement product work in the product repo, not here. Improvements to rules and skills
discovered during product work are PRs to this repo.
