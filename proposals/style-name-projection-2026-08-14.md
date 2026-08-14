# HeroText textStyle binding defect: hypothesis verified FALSE

**Answers:** the standing ruling `two-binding-reconcile`'s HYPOTHESIS — "checker normalization
gap, since Figma style names use slashes and CSS classes project to dashes."

**Short answer: the hypothesis is wrong.** `binding-check.mjs` already implements the slash→dash
projection, has applied it to every `textStyle` entry in the map since before any capture in
`conformance.jsonl` was taken, and produces the *correct* comparison here. The defect is real: a
page-level map entry now points at a file that no longer renders the bound layer at all, because
the home page's tagline moved out of `page.tsx` into a different component at a different style
step.

## Sources (all opened directly, read-only)

- Checker: `scripts/binding-check.mjs:210-227` (`figmaValueToCssClass`, the `"css-class"`
  assertion kind).
- Checker history: `git log --oneline -- scripts/binding-check.mjs` — the projection predates
  every `conformance.jsonl` entry citable against this defect (earliest capture in the ruling's
  own sync is 2026-08-13T05:02Z; `figmaValueToCssClass` and the `css-class` assertion kind are
  already present at that commit, unchanged since).
- Map: `~/JHD/portfolio/design/figma-map.json` — all 8 `textStyle` entries (HeroText ×3,
  HeaderText ×2, `.FeatureText` ×3, `CardMediaHeader` ×2) use `assertion.kind: "css-class"`;
  none use `"literal"` for a style bind. The projection is applied uniformly, not selectively.
- Live run: `node scripts/binding-check.mjs --capture ~/JHD/captures/live/jhd-spec-designsystem-variables-styles.json --map ~/JHD/portfolio/design/figma-map.json`
  reproduces the exact defect from `conformance.jsonl` (`old: "title-style1/300"`,
  `new: "title-style1-300"`).
- Code: `~/JHD/portfolio/src/app/page.tsx:1-40` (no `HeroText` import or usage — see the file's
  own header comment, "THE HERO IS GONE"), `~/JHD/portfolio/src/components/nav-tagline.tsx:50`.

## Why it's not a projection gap

`figmaValueToCssClass` (binding-check.mjs:214-216) does exactly the rewrite the hypothesis
describes:

```js
function figmaValueToCssClass(value) {
  return String(value).replace(/\//g, "-");
}
```

The `"css-class"` assertion (binding-check.mjs:219-222) runs this on the Figma value before
checking it against code — `"title-style1/300"` becomes `"title-style1-300"`, then the checker
does `codeText.includes("title-style1-300")` against the mapped file. That IS the slash→dash
convention, already wired in, already the only path any `textStyle` entry takes. The `old`/`new`
fields in the defect record are not two different *readings* of the same style name — `old` is
the raw Figma value (pre-projection, for the summary line's readability) and `new` is the
already-projected expected string. Seeing both in one defect record reads like a format
disagreement; it is not — it is the checker showing its work.

## What the mismatch actually is

The map's page-level entry:

```json
{ "component": "HeroText", "layer": "content/primary/header/title/title", "property": "textStyle",
  "codeLocation": "src/app/page.tsx", "assertion": { "kind": "css-class" } }
```

asserts that `src/app/page.tsx` contains the literal string `title-style1-300`. It does not —
`page.tsx`'s own header comment says why: *"THE HERO IS GONE. The concept's frames carry no
HeroText at all — the tagline that block used to paint has moved into the nav."* The tagline now
renders through `nav-tagline.tsx:50`:

```tsx
<Tagline className="nav-tagline type-title title-style1-200" {...scope}>
```

— at `title-style1-200`, one step below the `title-style1-300` Figma's HeroText binding declares
constant across all 12 device×height variants (per the map entry's own `$note`). This is a real
style-step drift introduced by the hero→nav architecture move, sitting behind a stale
`codeLocation`: the map still points the binding-lane check at the file that used to render the
hero, not the one that does now.

The other two `HeroText textStyle` map entries (`src/components/hero-text.tsx`,
`src/app/(site)/projects/page.tsx`) both pass — both files still contain the literal
`title-style1-300` string, correctly.

## Recommendation

One recommendation, not a menu: **re-point the map entry's `codeLocation` to
`src/components/nav-tagline.tsx`** (where the home page's H1/tagline now actually lives) and let
the binding lane flag the genuine `-200` vs `-300` step drift on its own terms, rather than
flagging a file that no longer participates. Whether the tagline *should* render at `-200` or
`-300` is the operator's creative call (the nav context may warrant a smaller step than the old
full-bleed hero did) — left open here, not decided.

## No checker change made

Since the hypothesis under test (`two-binding-reconcile`'s HYPOTHESIS line) does not hold, no
fixture or code change was made to `binding-check.mjs` — there is nothing broken in the projection
to prove red/green against. `npm test` (scripts suite) was run unmodified as a baseline; see the
commit for its output.
