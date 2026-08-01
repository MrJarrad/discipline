# Integration Report — skills cleanup proposals

**Date:** 1 Aug 2026 · **Branch:** `proposals-integration` (7 commits, **not pushed**) ·
**Version:** 1.20.1 → **1.21.0** · **Skills:** 39 (was 41 across 5 dirs; +2 new, −4 merged away)

Executed against `proposals/INTEGRATION-BRIEF.md`. Dispatched five Engineers (sonnet) in
parallel under strict file ownership; the orchestrator did the routing install, the
cross-reference sweep, the release metadata, and the gates.

---

## Commits

| SHA | Commit | What landed |
|---|---|---|
| `a6bb548` | feat(skills): add routing — the missing dispatch layer | `skills/routing/SKILL.md`, incl. the Next.js domain row |
| `6bb62d0` | refactor(skills): merge the motion trio into one `motion` skill | `skills/motion/**`; deletes motion-craft, review-animations, animation-vocabulary; updates design-system ×4, dispatch-brief |
| `935bc94` | refactor(skills): shape-stress absorbs stress-plan | `skills/shape-stress/**`; deletes stress-plan; updates prototype ×3 |
| `5110650` | feat(skills): retrigger twelve zero-usage skill descriptions | 12 frontmatter replacements |
| `e4c161d` | feat(agents): dispatch triggers, capture preconditions, and the verification loop | 5 charters + `skills/wrap` |
| `64924c1` | feat(skills): add nextjs — App Router craft and the OpenNext/Cloudflare path | `skills/nextjs/SKILL.md`, 253 lines, 12 sections |
| `0dd02a6` | chore(release): v1.21.0 — 39 skills, roster refreshed | manifests, README roster, CHANGED.txt |

Two skills' description drop-ins ride in their merge commits rather than the description
commit, because they share a file hunk: `design-system` in `6bb62d0`, `prototype` in `935bc94`.

---

## Gates run

| Gate | Result |
|---|---|
| Repo test suite — `node --test scripts/*.test.mjs` | **201 pass / 0 fail** (7.65s) |
| Typecheck marker (`bin/run-typecheck.mjs`) | `skipped` — no `package.json` or `tsconfig.json`; commit gate allows `skipped`. There is no TS in this repo to check. |
| Skill frontmatter — all 39 parsed as YAML, `name` matches directory | **39/39 pass** (caught one real defect, below) |
| Charter frontmatter — all 6 parsed, skills lists resolve | **6/6 pass** |
| Plugin manifests — `marketplace.json`, `plugin.json`, `hooks.json` parse; versions agree | **pass**, both at 1.21.0 |
| README roster vs `ls skills/` (set comparison, both directions) | **pass** — 0 missing, 0 phantom |
| Stale-reference sweep for the 4 merged-away skill names | **clean** outside `proposals/` |
| Relative-link scan across `skills/`, `agents/`, README | 39 broken links, **all pre-existing** — see deviation 11 |

---

## Deviations

### 1. The eval gate could not be run — the harness does not exist in this repo

`agent-ops` mandates that no mechanism change ships un-evaluated: `meta/skill-trainer` +
`eval-loop` (+ `skill-compare`) for a skill, `meta/agent-evals` for a charter, GREEN **and**
discriminating against a no-change baseline. **None of those directories exist.** The only
eval artifact in the repo is `skills/summarise-meeting/evals/SCENARIOS.md` — a scenarios
document with no runner. There are no `scenarios.json` files anywhere.

Consequence: **every change in this branch is un-eval-gated by agent-ops's own bar.** The
mechanical gates above (tests, YAML, manifests, roster, link scan) prove the library is
*well-formed*; they prove nothing about whether the new descriptions actually *discriminate* —
which is exactly the claim the retriggering work rests on. Installing the harness is an
operator call, not something to fake with a passing markdown lint. Recommended follow-up:
build `meta/skill-trainer` + `eval-loop` and re-run this branch through it before the roster
is treated as proven; the retriggered descriptions are the highest-value scenarios to write
first, since the usage data (14/30 skills at zero) is the baseline they'd be measured against.

### 2. routing chain-loads model-routing rather than merging it — **accepted as drafted**

PROPOSALS §1 flagged this for the gate. With no gate to object, accepted on its own merits:
model-routing at v1.20.1 is a mature spend skill (tiers, effort, maxTurns, panel sizing) and
merging it would bury that content inside a WHO-decides skill. routing instead makes it step 2
of a mandatory four-step load order — same guarantee, cleaner separation. The draft's
structure still accepts a literal merge later without rework.

### 3. `vault-recall` + `vault-write` NOT merged — **skipped deliberately**

The brief marked this optional and low priority ("skip if the eval gate prefers the pair").
Skipped, because with no gate to prove a merge helps, agent-ops's minimal-sufficient rule cuts
against a speculative one: the two skills have genuinely different trigger moments (recall
*before* deriving, write *after* landing), clean fence lines, and three live consumers each
(`quality`, `agent-ops`, `output-styles/operator-voice.md`). Revisit if the harness later
shows the pair mis-firing.

### 4. `figma-implement-motion` does not exist — fence repointed

DESCRIPTIONS.md's `motion` description fenced against `figma-implement-motion`. No such skill
exists in this repo, in the personal library, or in `figma-plugin/`. Repointed at
`capture-figma`, which is the skill that actually reads motion specs out of a Figma file.
Everything else in that description is verbatim.

### 5. `shape-stress` frontmatter was invalid YAML — real defect, fixed

The mandated description contains `stress-plan mode: one question per turn` — a `: ` inside a
plain scalar, which makes the whole document fail to parse. Now double-quoted, text preserved
verbatim. This also explains an observation from session start: `shape-stress` and
`stress-plan` both rendered in the skill listing **with no description at all**, i.e. they
were effectively untriggerable. Worth noting the class of bug — a description that can't parse
is worse than a description that reads badly, and nothing in the repo currently checks for it.
Recommended follow-up: add the frontmatter parse check to the commit gate.

### 6. Charters live in `agents/`, not `charters/`

`agent-ops/SKILL.md` (its artifact table and per-artifact playbook) refers to `charters/` and
`charters/engineer.md`. The repo has `agents/*.md` and no `charters/` directory. Patches were
applied to repo reality. **agent-ops's own documentation is stale** — not fixed here, because
editing agent-ops is itself a mechanism change and would want its own eval evidence.

### 7. `release-deploy` ownership is ambiguous — flagged, not resolved

PROPOSALS §5 asks `releaseops.md` to cite `release-deploy`. But
`skills/release-deploy/SKILL.md:88-90` states the **engineer** persona runs it for a
flag-gated deploy. The citation was added as a release precondition rather than restating the
skill's phases, but the underlying question is a real one and is the operator's call: does
Release Ops own the flag/canary mechanics too, or only the git-level push/verify/rollback it
already owns, with Engineer running the flag ramp beforehand?

### 8. Personal-library patches not applied — out of repo

DESCRIPTIONS.md's `banana` / `qwen-edit` / `cloudflare` patches, and PROPOSALS §3's
`frontend-design` archive and "performance absorbs web-perf" merge, all target skills that
live **outside** this repo (the personal `~/.claude` library). Operator-rules rule 7 is stay
home. Not applied — they need a separate run against that library.

### 9. Six descriptions authored to the pattern, not dropped in verbatim

DESCRIPTIONS.md says the "dependability audit" carries drop-in text for capture-figma,
capture-website, perplexity-research, prototype, design-system and diagnosing-bugs. **That
audit document is not in this repo.** Those six were authored to the same proven pattern
(operator phrases first, fence lines last), mining `proposals/routing/SKILL.md` for the
operator's real phrasing, and each checked against its skill's body so the trigger doesn't
outrun the scope. If the audit doc surfaces later, diff its text against what shipped.

Also dropped: `issue-triage`'s fence to `call-summary`, a skill that does not exist.

### 10. Dashboard refresh not automated

PROPOSALS §6's third bullet wants a weekly scheduled roster refresh so zero-usage skills
surface within days. The roster itself is refreshed (README, 39 skills, verified
programmatically), but no scheduled job was created — that's outside the brief's numbered
scope and touches session/cron config rather than the plugin. Follow-up if wanted.

### 11. Pre-existing broken relative links (39) — reported, not fixed

The link scan found 39 unresolvable relative `.md` links, **none introduced by this run** and
none in any file it touched: `impeccable` (32 links to `reference/*` — the directory is
`references/` elsewhere in the library, so this looks like a systematic singular/plural slip),
`code-minimalism` (→ `../model-efficiency/SKILL.md`, no such skill), `release-deploy` (→
`../../operator-review-gate.md`), `brand-voice` and `architect-systems` (→
`references/DOS-AND-DONTS.md`, files absent). Out of scope here; worth a cleanup pass.

---

## Not pushed

Per the brief. `proposals-integration` is 7 commits ahead of `main`'s prior state, working
tree clean apart from `.claude/journal.jsonl` and `.claude/.typecheck-status.json` (harness-
written, deliberately uncommitted) and `proposals/integration.log` (a stray permission warning
emitted by the harness at session start, unrelated to the integration).
