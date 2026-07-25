---
name: vault-recall
description: Procedure for reading and recalling from ~/JHD/vault as the fleet's shared memory. Use when starting a task or during work to check for prior decisions, learnings, references, or artifacts before deriving new answers. Not for writing to the vault — that's vault-write.
---

# Vault Recall

**Trigger:** Use when starting a task or during any work to recall decisions, learnings, captured references, or prior analysis from the fleet's shared memory.

**Anti-trigger:** Writing or authoring vault records; Paperclip board operations; any read outside `~/JHD/vault`.

---

## Entry points — where to start

**Start with the project hub.** Every project has a standing hub note in `hubs/<project-slug>.md`. The hub is the index — read it first, then follow its `[[wikilinks]]` into the graph.

When there is no hub route, search the category folders directly: `documents/`, `artifacts/`, `references/`, `decisions/`, `memories/`. The folder matches the **`category`** frontmatter, not the project.

Use `grep` or file glob to search by **`scope:` frontmatter**, never by folder-per-project. `scope: company` surfaces everywhere; `scope: <project-slug>` surfaces in that project context.

---

## Recall defaults — what gets returned

**Status filter:** Recall returns only `status: current` records by default. Non-superseded records only.

**History mode:** Only when explicitly asked for history (e.g., "show me the superseded versions") return `status: superseded` records. Include `superseded_by:` links to see the lineage.

---

## Check-before-derive rule — the gate

**Before making a decision**, check `decisions/` for prior calls + lineage.

**Before re-learning or distilling**, check `memories/` for recipes, lessons, or state already captured.

**Before re-capturing an external source**, check `references/` for what the fleet already holds.

A vault hit replaces re-derivation; a miss is a signal to write the record after the work (via **vault-write**).

---

## Trust discipline — verify against reality

Recalled notes are **point-in-time claims**. Before acting on them, verify:
- File paths and flag names against current codebase
- Build/deploy status against live systems
- Agent/project assignments against the current board

A note may be authored correctly but now stale. Stale signals a new record (superseding the old) via **vault-write**, not a contradiction.

---

## The vault context map

The vault holds the fleet's typed graph: decisions, references, memories, artifacts, documents, and project hubs — all linked by `[[wikilinks]]`. Recall means landing on a node and following its edges to assemble working context for the task at hand.

