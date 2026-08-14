# Handover — skills cleanup & integration (from Cowork orchestrator session, 1 Aug 2026)

You are taking over as orchestrator in `~/JHD/discipline`. Everything below is done and verified unless marked OPEN. Follow operator-rules.md; vault is the canonical home for durable knowledge (see `~/JHD/vault/memories/skill-library-maintenance-lessons.md`).

## State — done and verified

- **Branch `proposals-integration`** in `~/JHD/discipline`: 7 commits, NOT pushed, NOT merged. v1.20.1 → v1.21.0, 41 → 39 skills. Gates passed: 201/201 repo tests, 39/39 frontmatter parse, manifest + roster verified, diff +1,171/−649 across 44 files. Full detail + 11 logged deviations: `proposals/INTEGRATION-REPORT.md`.
- **What landed on the branch:** new `skills/routing` (persona table: who handles what; chain-loads model-routing → dispatch-brief → prompt-craft; domain-library table incl. a Next.js row) · new `skills/nextjs` (App Router craft + OpenNext/Cloudflare path, built from `proposals/nextjs-research-brief.md`) · motion-craft + review-animations + animation-vocabulary merged → `skills/motion` · stress-plan absorbed into shape-stress · 12 zero-usage skill descriptions retriggered (operator-phrases-first, fence lines) · agent charter patches (dispatch triggers, capture preconditions) · Reviewer brief-mandated-skills evidence check + wrap dispatch-vs-routing report line.
- **Root-cause find:** shape-stress and stress-plan had invalid YAML frontmatter (unquoted `: ` in description) — they were untriggerable, not unwanted. A frontmatter parse check belongs in any commit gate touching `skills/`.
- **Personal library (`~/.claude/skills`)**: 5 archived to `~/.claude/skills-archive/` (design-craft, perplexity-research, research-synthesis, flux-quality — plugin duplicates; frontend-design — superseded by design-taste-frontend + impeccable). Proposed description patches for banana/qwen-edit boundary and cloudflare umbrella→index are in `proposals/DESCRIPTIONS.md` — NOT yet applied (stay-home rule; apply on operator nod).
- **Live usage dashboard:** `~/JHD/claude-usage/index.html` — launchd job `com.jhd.claude-usage` runs `generate.py` every 15 min over all `~/.claude` transcripts (1,185 sessions / 52 days at handover); page auto-reloads. This is the scoreboard for whether the retriggered descriptions actually fire — watch the zero-usage panel over 2–3 weeks.
- **Vault records written** (1 Aug): `decisions/skills-cleanup-2026-08.md`, `memories/skill-library-maintenance-lessons.md`, `artifacts/skills-integration-v1-21-0.md`. Vault cron handles commits — never git in the vault.

## OPEN — needs the operator (Jarrad), then you execute

1. **Merge `proposals-integration` → main** on his word. Don't push unless he says so.
2. **`release-deploy` ownership:** releaseops vs engineer — one-line charter patch once he calls it.
3. **Eval harness (the real next project):** agent-ops mandates meta/skill-trainer, eval-loop, meta/agent-evals — none exist in the repo; only a scenarios doc with no runner. The integration substituted mechanical gates, which prove well-formedness, not that the new triggers discriminate. If he greenlights: shape it via shape-stress, then build — that's what turns "looks right" into "proven right."
4. **Settings fix (his file):** `~/.claude/settings.json` rule `NotebookEdit(~/JHD/vault/**)` is ignored by permission checks — should be `Edit(~/JHD/vault/**)`.
5. **Deferred, low priority:** apply DESCRIPTIONS.md personal-library patches on his nod; fold web-perf content into `performance` then archive it; optional vault-recall/vault-write merge was evaluated and rejected — don't redo without new evidence.

## Standing orders learned this session

- Vault-first: decisions/memories/artifacts get typed records when produced; repo folders like `proposals/` are working state.
- Persona-per-task now lives in routing's table — dispatch by it, and wrap reports drift against it.
- Descriptions that fire: operator's real phrases first, fence lines last; verify with the dashboard, not vibes.
- Cancel scheduled check-ins at report time if the lane they watch has already completed.
