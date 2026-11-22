# Figma variable writes

A new Figma variable or a rename is **never a technical call** — it is the operator's system. It goes through the handoff toolkit's design-system profile and resolve step (HT-111, HT-112, HT-113) first.

1. `handoff-css resolve --export <export> --need <needs.json> [--rulings <md>]` writes `resolve-report.json` (top level `needs[]`, `open`, `counts`). Verdicts: REUSE, RULED, SIBLING, MISMATCH, NEW_NAME, NEW_RAMP, RULING_STALE; exit 0 means every need is REUSE or RULED. Contract: vault `references/2026-11-22-handoff-css-resolve-contract.md`.
2. Every open need is one question to the operator, the toolkit's nearest name as the recommendation; his answer is a rulings row. Alias variables are ordinal (`token-rulings` s105): reuse first, else the next ordinal, never a state-suffixed compound.
3. A brief that has a doer add or rename a variable carries `## Resolve result`: the report path and `open: 0`. `agent-dispatch-gate` refuses it otherwise.
4. The write: the `use_figma` call's `description` carries `Resolve: <report path>`. `figma-variable-gate` refuses a call that adds (`createVariable`, `createVariableCollection`, `addMode`) or renames (`.name =` beside `figma.variables`, `renameMode`) without a report that is settled (`open` 0, every verdict REUSE or RULED) and names each literal variable name written. The `Resolve:` path is absolute. A write with a computed name (a template literal, a mode) has nothing to check; the report check alone applies.

DO: resolve, ask the operator the open needs, write the settled names, read back.
DON'T: tell the operator "option (a)" and add `color/background/action/pressed-tertiary` (s105, 21 Nov; operator: "that's not how the aliases pattern works").
