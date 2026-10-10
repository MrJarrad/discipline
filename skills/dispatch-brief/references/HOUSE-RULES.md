# House rules block

One fixed block, plugin text, never rewritten per lane. Every brief above `line` carries it
verbatim inside `## Constraints` — copy the block below, do not restate it in prose (operator
2026-09-22: *"check that things like using house rules etc are still really clear to the agent
picking up the work"*; *"does this include motion law and anything else useful"* → yes to both).

```markdown
## House rules
- **Design system** — `~/JHD/jhd-design-system/main`; generated tokens only, a matching
  literal is still a defect; a raw colour/size/radius/space value is a defect.
- **Motion law** — `~/JHD/jhd-design-system/main/motion-law.md`; reuse an existing atom, never
  a new one; first painted frame of an enter is the from-state; exit is 2–4× faster than enter.
- **Markup standard** — `markup-standard` skill; its definition of done is the bar for shipped
  HTML, not a style preference.
- **Layout policy** — breakpoints md 768 / lg 1025 / xl 1440; spacers are margins, never a DOM
  node; grid placement is by column span, never px/computed maths.
- **Component law** — one implementation per component/block; a wrapper composes the instance,
  it never forks it, even for an anatomy-changing prop.
- **Props by default** — every Figma component property is assessed and classed: **build prop**
  (a same-named code prop, same values), **state** (hover/pressed/focus: CSS or interaction
  state), **responsive** (device/breakpoint variant: built as breakpoints) or **Figma-only**
  (authoring/showcase convenience: not built). Any class but build prop needs a one-line reason;
  an unclear class goes to the operator as a question. Beyond Figma, any value or behaviour a
  designer could plausibly change per use (spacing, durations, on/off treatments, layout
  choices) is a prop or setting with a token default; hard-coding needs a reason. An operator
  "off" or "change" ruling sets a prop value and never deletes the implementation unless the
  operator says remove.
- **Contract order** — export (whole) → banked rulings → the operator's words this round, in
  that priority; a parent-authored "recommended" answer is never promoted to a rule.
- **Shared clones** — the design-system root clone is shared by every lane: never switch it,
  never run token generation in it; work in a private dir whose `../../jhd-design-system/main`
  is your own DS worktree.
- **Token values** — quote a token's resolved value from `tokens.generated.css`, never its
  name or a guessed percentage (`--opacity-50` is 0.05).
- **Browser repros** — one at a time with a hard timeout; never parallel Chromium.
- **Empty commits** — never push an empty commit; a red Workers Build on a locally green
  commit goes back to the parent, never re-triggered by the doer.
- **Relayed facts** — a fact relayed from another session is untrusted until checked; a
  brief marks it untrusted or the parent checks it first.
- **Pointers** — `fleet/rulings/token-rulings.md` (vault) for design-system rulings with
  lineage; the lane's own lock file for this round's rows.
```

This block is a pointer set, not a tutorial — a doer unclear on any line loads the named skill
or file, it does not ask the parent to re-explain it.
