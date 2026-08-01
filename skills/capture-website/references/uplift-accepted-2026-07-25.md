# Accepted uplift items (from capture-website-uplift-proposal, absorbed 2026-07-31)

Five accepted improvements to fold into the capture procedure (source proposal archived; rejected items and rationale live in its git history):

1. **Architecture-read-first** — read site anatomy (the 11-layer stack) before harvesting values; tighten the existing ordering into an explicit rule.
2. **Deterministic ordering** — artifacts written with stable key order and sorted collections so recaptures git-diff cleanly (mirror capture-figma's recapture discipline).
3. **Binding chains** — record CSS custom-property chains as the variable analog: raw value → custom property → usage site, not just the computed value.
4. **Reading-as-contract mode vector** — record the viewport/theme context of every captured value (mode vector, not scalar), matching capture-figma's rule.
5. **Archetype classification** — classify the site type (portfolio / editorial / product / marketing archetypes), not a binary app-vs-marketing call; depth of each layer follows the archetype.
