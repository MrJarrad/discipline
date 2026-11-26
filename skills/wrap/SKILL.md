---
name: wrap
description: >-
  Use when ending an orchestration session, asked to hand over, wrap up or close
  out this session, or context fill reaches 70%: patch the cockpit, replace
  handovers, land rulings, commit everything. A quick stop is pause-resume.
---

# Wrap

## Hard fail (non-negotiable)

- Closing a **non-trivial** product session with **handover-only** (skipping other wrap sections) is a wrap/routing failure — not a shortcut.
- **Forbidden** to tell the operator: "partial wrap is enough", "handover update is probably enough", or any equivalent heuristic.
- **MUST** load this skill file and follow it end-to-end; do not improvisationally Write vault files.
- Vault notes, lessons, rulings → read and follow **`vault-write`** first (placement, hub-link, lint). Ad-hoc vault Write without vault-write is a defect.
- Lint exit ≠ 0 → wrap has **not** succeeded; do not claim wrapped.
- **Operator-facing report:** compact outcomes only (what's banked, what's next); the section walk is internal.

## Orchestrator self-check (before ending a turn where a product was touched)

```
[ ] Handover current?
[ ] If closing: wrap skill complete (not handover-only)?
[ ] No parent product edits?
[ ] Vault writes went through vault-write?
```

**Claude note:** the vault **working tree** is `~/JHD/vault/main`. The toolkit is the plugin
repo `~/JHD/ai/discipline/main` plus its marketplace/cache mirror — verify the installed
plugin matches the repo at wrap.

Wrap is the gate: nothing "should be fine"; everything below is verified before the session is called closed.

## When to wrap

**Wrap at 70% context, unprompted — wrapped or wrapping by 90%** (operator, 2026-10-09: *"bring it
down from 90% to 70%"*). `hooks/bin/context-fill.mjs` reads the context-window count from the
transcript and reports it on every prompt past 70%, and after an automatic summary. On that line:
finish in-flight merges, run `wrap`, tell the operator in one line. No reading → wrap at a natural break.

**Follow-ups ship before wrap**; **lists are never stale** (`list-drift-check.mjs`); **a discipline session ends with DISC Open empty** (`--discipline-empty`): [REPORT-AND-LEARN.md](references/REPORT-AND-LEARN.md).

## The seven sections — walk all of them, in order

Each section's full procedure is [SECTIONS.md](references/SECTIONS.md). A skipped section is a wrap failure.

1. **HANDOVER** — cockpit patch + one file per touched project, replaced not appended. **The open queue is written once, in the queue files:** the wrap reply carries new asks and the checklist link (`needed-from-you.mjs --projects <prefixes> --short --new <ids>`); the cockpit wrap block and a handover carry a link and count, never rows (`cockpit-check.mjs` passes); a handover adds a `## Next` block and the pinned-checklist sync ([SECTIONS.md](references/SECTIONS.md) § 1).
2. **Rulings** — landed with lineage, same-action verified, placed thing-then-aspect.
3. **Memory** — fleet lessons and the auto-memory index current. **Lessons ship or say why not.** Every file in `fleet/lessons/` and `fleet/rulings/` carries `encoded: <semver> | pre-1.73.0 | queued | skipped(<reason>)`. Triage this session's lessons: encode, merge into an existing rule, or `skipped(<reason>)`; `queued` only with the release it waits on. No `encoded:` field is a wrap failure. At five queued records the ledger prints `release due`: start that release. Run `node <plugin>/hooks/scripts/lesson-ledger.mjs <vault-root>` and fix what it names.
4. **Toolkit** — the plugin repo committed and versioned, installed copy matching. **Release checklist:** the commit gate refuses a `plugin.json` bump while any lesson or ruling is still `queued`, and `CHANGED.txt` names the lessons this version encoded.
5. **Vault/Obsidian hygiene** — structure conformance, thing-then-aspect placement, lint exit 0.
6. **Leftover** — handover Open/Next plus git (`leftover-not-a-board`).
7. **Verify** — `session-resume.mjs` prints every lane. No durable reference to a dying path. Nothing committed, remembered, or written into a handover may point at `/private/tmp/...` or any session-scratch path.

**Evidence and probes never live in a product repo.** Before closing, each touched product's
round evidence is archived to `~/JHD/vault/main/estate/captures/<product>-evidence/` with a
manifest row (`scripts/evidence-archive.mjs`); evidence still in-tree at wrap is drift to name.

## Last step: stand down, never archive

Operator, 2026-10-09: *"when a session wraps, it shouldn't do anything further"*. List open PRs and lanes;
stop watchers; disable (never delete) its routines; unsubscribe PRs; mark the wrap; the operator starts the next one (CLOSING-CHECKS 6b); write "wrapped — inactive". Afterwards automated events get no chat text; only the operator reopens it.

After the last step, offer one Continue chip (`spawn_task`): [CLOSING-CHECKS § Continue chip](references/CLOSING-CHECKS.md#continue-chip).

## Report, handover prose, and the learn step

Full text: [REPORT-AND-LEARN.md](references/REPORT-AND-LEARN.md).

- **Operator-facing by default** — compact outcomes, the four handover-prose moves (compact, redact, reference, name the next step). Never dump seven-section tables or plugin names unasked.
- **Learn before the lint/commit gate** (operator ruling 2026-08-03) — mine the session for lessons *first*, so a lesson lands in the same commit as the wrap rather than the next one. **Queued lessons ship in-session**: encode them into the plugin the same session, or name the release that will; logging alone is not the close. The mid-session checkpoint exists so wrap is not the only catch.
- **Log the dispatch tally** — `cloud N / local M`, each local dispatch's one-clause machine-bound justification spot-listed (`routing` rule 9). An unjustified local count, or a cloud share trending down session over session, is drift to name.
- **Log review rounds per change** as `<change>: N of <cap>` (`agents/reviewer.md` § Round cap). Every change has at least one round; a `0` is a missed reviewer, a defect. Name any change that **halted at the cap** with findings open. Trending toward the cap means failing upstream briefs or gates.
- **Report personas and skills invoked** against `routing`'s tables; a mandated-skill zero on relevant work is a defect to log.

## Closing checks

Seven checks; procedure in [CLOSING-CHECKS.md](references/CLOSING-CHECKS.md).

| Check | Ends on |
|---|---|
| **Section 0 — drain the runners first** | no runner still holding work the wrap would miss |
| **Link health** | every link in what was written this session resolves — a verification pass, not a cleanup pass |
| **Estate sync** | the estate map and captures ground reflect what this session changed |
| **Repo topology** | every clone of a shared origin accounted for, none left behind a push |
| **Push at wrap** | what the operator authorized is pushed; nothing else; **the vault is on `origin/main` and the report names that sha** |
| **Lane capacity** | at capacity, or each gap reasoned |
| **Version sync (Claude)** | the installed plugin matches the repo, `CHANGED.txt` current |
