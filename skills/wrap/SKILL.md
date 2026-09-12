---
name: wrap
description: Close out an orchestration session so the next one continues seamlessly — patch the cockpit, replace each touched project's handover note, land rulings and memory, verify the toolkit and vault are committed, and confirm nothing durable depends on a dying scratch path. Use when ending an orchestration session, or asked to "hand over", "wrap up", or "close out this session". Not a single mid-session ruling or lesson write — that's vault-write directly; wrap is the full session-close pass, not a per-event log.
---

# Wrap

## Hard fail (non-negotiable)

- Closing a **non-trivial** product session with **handover-only** (skipping other wrap sections) is a wrap/routing failure — not a shortcut.
- **Forbidden** to tell the operator: "partial wrap is enough", "handover update is probably enough", or any equivalent heuristic.
- **MUST** load this skill file and follow it end-to-end; do not improvisationally Write vault files.
- Vault notes, lessons, rulings → read and follow **`vault-write`** first (placement, hub-link, lint). Ad-hoc vault Write without vault-write is a defect.
- Lint exit ≠ 0 → wrap has **not** succeeded; do not claim wrapped.
- **Operator-facing report:** compact outcomes only (what's banked, what's next). The section-by-section walk is the agent's internal contract, not the designer's UI unless asked.

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

A session that ends without wrapping leaves the next one to reconstruct state from scratch.
Wrap is the gate: nothing "should be fine," everything below is verified before the session
is called closed.

## The seven sections — walk all of them, in order

Each section's full procedure is [SECTIONS.md](references/SECTIONS.md). Walk them in order;
a skipped section is a wrap failure, not a judgement call.

1. **HANDOVER** — cockpit patch + one file per touched project, replaced not appended. Never one rewrite standing in for several projects.
2. **Rulings** — landed with lineage, same-action verified, placed thing-then-aspect.
3. **Memory** — fleet lessons and the auto-memory index current. **Lessons ship or say why not.** Every file in `fleet/lessons/` and `fleet/rulings/` carries `encoded: <semver> | pre-1.73.0 | queued | skipped(<reason>)`. A lesson written this session is either encoded into the plugin in the same session or marked `queued` with the release it waits on — a lesson with no `encoded:` field is a wrap failure. Run `node <plugin>/hooks/scripts/lesson-ledger.mjs <vault-root>` and fix what it names.
4. **Toolkit** — the plugin repo committed and versioned, installed copy matching. **Release checklist:** the commit gate refuses a `plugin.json` bump while any lesson or ruling is still `queued`, and `CHANGED.txt` names the lessons this version encoded.
5. **Vault/Obsidian hygiene** — structure conformance, thing-then-aspect placement, lint exit 0.
6. **Leftover** — handover Open/Next plus git (`leftover-not-a-board`).
7. **Verify** — no durable reference to a dying path. Nothing committed, remembered, or written into a handover may point at `/private/tmp/...` or any session-scratch path.

**Evidence and probes never live in a product repo.** Before closing, each touched product's
round evidence is archived to `~/JHD/vault/main/estate/captures/<product>-evidence/` with a
manifest row (`scripts/evidence-archive.mjs`); evidence still in-tree at wrap is drift to name.

## Report, handover prose, and the learn step

Full text: [REPORT-AND-LEARN.md](references/REPORT-AND-LEARN.md).

- **Operator-facing by default** — compact outcomes, the four handover-prose moves (compact, redact, reference, name the next step). Never dump seven-section tables or plugin names unasked.
- **Learn before the lint/commit gate** (operator ruling 2026-08-03) — mine the session for lessons *first*, so a lesson lands in the same commit as the wrap rather than the next one. The mid-session checkpoint exists so wrap is not the only catch.
- **Log the dispatch tally** — `cloud N / local M`, each local dispatch's one-clause machine-bound justification spot-listed (`routing` rule 9). An unjustified local count, or a cloud share trending down session over session, is drift to name.
- **Log review rounds per change** — `<change>: N of <cap>` against the cap in `agents/reviewer.md` § Round cap, including changes that took the small-fix no-reviewer path (`0`) and any that **halted at the cap** with findings still open. A session trending toward the cap on every change means the briefs or the gates are failing upstream.
- **Report personas and skills invoked** against `routing`'s tables; a mandated-skill zero on relevant work is a defect to log.

## Closing checks

Six checks, each with its own procedure in [CLOSING-CHECKS.md](references/CLOSING-CHECKS.md).

| Check | Ends on |
|---|---|
| **Section 0 — drain the runners first** | no runner still holding work the wrap would miss |
| **Link health** | every link in what was written this session resolves — a verification pass, not a cleanup pass |
| **Estate sync** | the estate map and captures ground reflect what this session changed |
| **Repo topology** | every clone of a shared origin accounted for, none left behind a push |
| **Push at wrap** | what the operator authorized is pushed; nothing else |
| **Version sync (Claude)** | the installed plugin matches the repo, `CHANGED.txt` current |
