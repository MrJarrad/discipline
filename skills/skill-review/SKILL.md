---
name: skill-review
description: Evaluate an external skill, plugin, MCP server, or repo before adopting it into the estate — read the actual code, not the README; check security posture and maintenance signals; map overlap against named estate pieces; land one adopt/adapt/dismiss verdict with one sentence why. Use when the user asks "should we adopt this skill/plugin", "is this repo worth installing", "review this before we add it", "would this conflict with what we already have", or points at a GitHub skill/plugin/MCP server and asks if it's worth taking. Not for reviewing our own code before merge — that's `reviewer`; not for scoring a single in-repo claim's confidence — that's `verify-finding`; not for open-ended market research with no adopt/dismiss decision pending — that's `research-synthesis`.
---

# Skill Review

Candidates arrive faster than they can be vetted by feel. Installing on README
marketing produces two failure modes, both costly: adopting something that
duplicates or conflicts with the estate (a second memory loop next to
rulings + auto-memory + wrap; a capability that contradicts a standing
ruling), or dismissing something with a genuinely missing capability because
nobody read past the pitch. This skill is the checklist that keeps the
verdict grounded in what the candidate actually does, not what it says it
does.

Pairs with `research-synthesis` (decompose/fan-out/source-or-stop) for method and
live lookup (WebSearch + WebFetch), and
`verify-finding` for the confidence/typed-sources discipline the verdict
block below reuses.

## Classify first

Before judging anything, name what the candidate actually is — the category
changes what "adopt" even means:

- **Skill** — markdown instructions, invoked on demand, no code executes.
- **Plugin** — a bundle of skills/hooks/MCP servers/agents.
- **Standalone product** — has its own CLI, server, or daemon; a "skill" in
  the repo is just its remote control, not the thing being evaluated.

## Read code, not README

Fetch the actual manifest (`package.json`, `plugin.json`, `SKILL.md`), the
actual hook/entry-point wiring (e.g. `hooks.json`), and at least one
representative source file. README claims — star counts, contributor
counts, feature lists — are marketing until a primary source confirms them.
Use `[code]`/`[doc]`/`[external]` typing per `verify-finding` throughout.

## Security posture, mechanically

Check, don't assume:

- Does it execute on install (read any `postinstall`/setup script in full)?
- Does it run a persistent process or daemon?
- Does it phone home by default, or only on explicit opt-in?
- Does it want credentials or API keys, and how are they handled (logged,
  plaintext, file permissions)?
- Is there a stated disclosure process (`SECURITY.md`) and supply-chain
  tooling (lockfiles, dependency/secret scanning)?

Flag — don't just note — anything that executes remote code or exfiltrates
data without explicit opt-in.

## Maintenance signals from the API, not the badge

Pull real repo metadata (`gh api repos/<owner>/<repo>`): `pushed_at`
recency, open issue count, archived flag, license. Cross-check stars/forks
against the actual contributor list and commit cadence — do they agree? A
repo whose top-line popularity doesn't match its commit history is a signal
to slow down, not an automatic disqualifier.

## Live reputation check

One targeted web research pass per candidate (`research-synthesis`: search + fetch
independent corroboration or red flags — marketplace listing, community thread, known
incident). A repo's own numbers are never independent evidence of its own legitimacy.

## Map against the estate, by name

Never compare against "our system" in the abstract. Name the specific
estate piece the candidate competes with or extends (e.g. "the auto-memory
directory + `wrap`'s Learn step," not "our memory stuff"), and check
`fleet/rulings/` for anything the candidate's core function might
contradict outright.

## The three-question gate — in this order

1. **Does it add a capability the estate lacks?** No → **DISMISS**, nothing
   left to check.
2. **Would adopting it whole stand up a second, parallel system next to one
   we already have** (two truth stores, two review cadences, two logs)?
   Yes → **ADAPT**: pull the missing idea into the existing mechanism,
   don't install a second one.
3. **Does its core function conflict with a standing, named ruling?** Yes →
   **DISMISS**, regardless of build quality.

## Output contract

One verdict, one sentence why, one alternative named and rejected — never
present adopt/adapt/dismiss as open options; the review commits.

```markdown
### Finding: <candidate> — ADOPT | ADAPT | DISMISS

| Field | Value |
| ----- | ----- |
| **Confidence** | <0-100>/100 |
| **Sources** | 1. `[code]` `<manifest/entry-point path>` - <what it showed><br>2. `[doc]` `<estate piece this maps to>` - <what it showed><br>3. `[external]` <reputation check> - <what it showed> |
| **Why** | <2-4 sentences: what it is, what estate piece it overlaps, which of the three gate questions decided it> |

**Alternative considered:** <the other verdict, and why it was rejected>
**What wasn't read:** <reference files, runtime behavior, or source not fetched — cap confidence accordingly, per `verify-finding`'s bands>
```

Bank the verdict via `vault-write` once it's final — it's a record we
produced, so it's an artifact (project-scoped) or `fleet/` doc (cross-
project), not a `references/` entry, per `vault-write`'s own did-we-make-it
test.

## Anti-patterns

- Judging from the README's feature list or star count alone
- Skipping the postinstall/hook script and assuming "it's just a skill"
- Comparing against "our system" instead of a named estate piece or ruling
- ADOPT verdict on something that duplicates an existing mechanism instead
  of ADAPT
- A verdict with no alternative named and rejected
- Rounding confidence up when reference files or runtime behavior went
  unread
