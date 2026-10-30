# Brownfield — matching a brief to code that already exists

Read from `SKILL.md` § Brownfield, when a project has its own tokens and components and no
Design System Handoff export exists for its design file.

## Running it

```sh
handoff-css match --handoff <design-handoff>.md --src <code paths…> [--rulings <table>.md] [--json]
```

`--src` takes files or folders; every `.css`, `.tsx`, `.jsx`, `.ts`, `.js` and `.mjs` under them
is read, `node_modules` and dot-folders skipped. The brief's markdown is the input — its
`**Variable tokens**` rows carry the CSS name and mode values, its `**Components used**` list the
components; the brief's JSON carries neither.

## What the code side is

| Item | Read from |
| --- | --- |
| Token | every `--name: value` declared in a `.css` file (value and file:line), and every `var(--name)` in any source file (use count). A name only used, never declared, is a design-system package's: still a match, and its evidence says it is declared outside the scanned code. |
| Component | every PascalCase `export function` / `export const` in a `.tsx`/`.jsx` file, and how many times `<Name` renders it. |

## Evidence and confidence

| Item | high | medium | low |
| --- | --- | --- | --- |
| Token | the code has the brief's CSS name, and declares a value the brief states (or declares none) | the brief's CSS name with a different value; or a name sharing half or more of its `-` segments **and** a value the brief states | a name sharing half or more of its segments, value different |
| Component | the same name, case and punctuation set aside | one name inside the other (`FeatureText` → `FeatureTextBlock`) | half or more of their words shared |

A value alone is never a proposal: a code property with only the brief's value is listed as an
`alternative` on an unmatched item. Values compare in one spelling — lowercase, `#rgb` and
`#rrggbbff` as `#rrggbb`, px as rem at a 16px root, zero bare — and against both the brief's
mode samples and the colour each alias resolves to.

## Output

One item per Figma variable (`kind: token`) and per component (`kind: component`):

```json
{ "kind": "token", "figma": "grid/gap", "css": "--grid-gap", "status": "proposed",
  "proposal": { "code": "--grid-gap", "confidence": "high", "why": ["name: …", "usage: …"] },
  "alternatives": [] }
```

`status` is `proposed`, `unmatched` or `ruled`; `counts` totals them; `findings` lists every
`RULING_STALE`. The text report prints the counts, then every unruled item as a row of the
ruling table with the proposal pre-filled in `code` and its evidence in `note`. The run exits 1
until every item is ruled.

## The ruling table

```md
| kind | figma | ruling | code | note |
| --- | --- | --- | --- | --- |
| token | grid/gap | use | --grid-gap | operator 30 Oct |
| token | opacity/opacity-full | new |  |  |
| component | .ColOffset | skip |  | private; layout only |
```

| Ruling | Means | Build move |
| --- | --- | --- |
| `use` | bind this code name or component | step 3 writes `var(<code>)`; the component is reused, its boundary kept |
| `new` | the code has no counterpart: add the brief's own name | declare the brief's CSS name; its value is the brief's, by mode |
| `skip` | not built in this project | a deviation row citing the ruling |

Checking the build (SKILL.md step 6): `conform --export <design-handoff>.json` (the brief's own
JSON — it carries the breakpoints, no export names) `--tokens <the project's token stylesheet>`
`--allow-name <each ruled use name declared outside it>`. Every `UNMAPPED_BINDING` is then a
ruled item.

A row with an empty `ruling` is still waiting and is not read. Keep the table in the project,
beside its other rulings, so every later brief reuses it.
