# Reuse a name, or add one

Step 2b writes down how the system is built; step 3b decides, for each need, whether the system already
has it. This is the detail behind 3b. Nothing here assumes a collection, group, step or mode name: every
one is read from `system-profile.md`.

## Resolve

`handoff-css resolve --export <json|json.gz|zip> --need <needs.json> [--rulings <md>] [--out <dir>] [--json]`
writes `resolve-report.json` and `resolve-report.md`. A need is `{ "id", "name"?, "group"?, "collection"?,
"wants"? }` with at least one of `name`, `group`, `wants`; `wants` maps a mode name (or `*`) to the raw value
the build holds. It never invents a name.

| Verdict | Means | Your move |
| --- | --- | --- |
| `REUSE` | the name exists and holds the wanted value, or a name holds it exactly | build that name |
| `RULED` | a ruling row settles it | build what the ruling says (a `new` row naming a variable the export has reads `REUSE`) |
| `SIBLING` | no name asked; the nearest name is close but not the same | one question, the nearest as the recommendation |
| `MISMATCH` | the name exists but holds another value | one question: use it, or change the value |
| `NEW_NAME` | the name is not in the system; `bindTo` shows the existing value each mode could point at | one question, `bindTo` as the recommendation |
| `NEW_RAMP` | nothing in the system holds the value in every mode asked | the `ramp` flow below |
| `RULING_STALE` | a `use` ruling names something the export no longer has | ask again |

Every open need carries `fallback: raw-value, assumed-ask`. Exit `0`: all `REUSE` or `RULED`. Exit `1`: a usage or input error, nothing written. The code for an open need is in 3b.

Rulings use the table `match` reads, `| kind | figma | ruling | code | note |`, with kind `resolve-need`,
`figma` the need id, and ruling `use` (existing name in `code`), `new` (the designer approved the name) or
`skip`. Record the designer's answer to a name question there, and the next run reads it.

A `new` row for a name-only need carries the approved name in `code`. While the export lacks that name the
verdict is `RULED` (approved, not yet written; build the raw value as `assumed-ask`). When the export has it,
the verdict is `REUSE`, the report keeps the `ruling`, and the name is bound. A `new` row with an empty
`code` stays `RULED`. So does a `new` row whose `code` names a variable of another kind, or a different name
from the one the need asked for; the report says which, and a `use` row binds a name the designer chose instead. A colour need that goes to `ramp` gets no `new` row.

## Ramp

`handoff-css ramp --export <json|json.gz|zip> --anchor <#hex>[@step]… [--name <name>] [--from-scratch]
[--for <semantic variable>[@step]… --on <surface variable>… [--use text|large-text|ui] [--keep-anchor]]
[--out <dir>] [--json]` writes `ramp-proposal.json` (a patch) and `ramp-proposal.md`, and writes nothing into
the design file. `--for` and `--on` each name a variable the export has, in full (the full names are in `system-profile.json`); none is inferred, and a name the export lacks exits 1.

**The name.** The ramp's name is the designer's (`--name`) or generated; `nameSource` in the proposal records
which. The question is in 3b.

**The yes.** Show `ramp-proposal.md` (name, steps, per-mode step mapping with contrast). One yes
covers one patch. Without it, hand the patch to the designer.

**The write.** Apply the patch with the host's Figma write tool, following that tool's own instructions.
Worked case: `references/write-back.md` writes through Figma's MCP, loading Figma's own skill first, and
reads the result back. Variables are written the same way: create the ramp's variables with their per-mode
values, then the semantic aliases. Add; never rewrite or remove a variable the designer owns.

**The read-back.** Read the variables again and compare names and per-mode values with
`ramp-proposal.json`. A difference is fixed once; if it still differs, report it rather than writing again.

**After.** Each written ramp is a row in the deviation table, "written, read back".

## Later: components and blocks

Reuse-before-add for components and blocks is not covered here yet.
