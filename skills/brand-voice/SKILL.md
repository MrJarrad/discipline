---
name: brand-voice
description: How to write user-facing copy in one consistent brand voice — the universal "how" beneath every project's own voice guide. Derive the voice once from the brand's definition, apply it to every surface, verify by reading aloud. Use when writing or reviewing App Store copy, marketing, onboarding, microcopy, error messages, changelogs, or any words a user reads. Not visual/layout (design-craft), task prompts (prompt-craft), SEO keyword strategy (seo-*), or legal wording (legal).
---

# Brand Voice

A brand's voice guide tells you *what* the voice is — its traits, its lexicon, its say/don't-say. This skill is *how* to wield it, so every line a user reads sounds like one brand — on any project, any surface.

Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying this skill.

## The one rule — voice is applied, never improvised
Every line of shipped copy traces to the brand's voice definition: its **traits**, its **lexicon**, its **say/don't-say**. No off-brand phrasing, no generic "AI voice," no per-writer drift. **Improvised tone is a bug, not a shortcut.** If the voice guide doesn't cover the case, **extend the guide, then write** — don't quietly invent a one-off tone. This holds regardless of which brand you're writing for — it's the rule beneath all the rest.

## On arrival — find the voice
1. **Locate the voice definition.** Check the repo: `AGENTS.md`, a brand/tone-of-voice doc, a `VISION.md`, existing *shipped* copy (App Store listing, marketing site, in-app strings). Read it before writing a word.
2. **No guide? Derive one — and surface it.** Infer a lightweight voice from the best existing shipped copy plus the product's positioning and audience, write it down (the dimensions below), and **surface it for confirmation** — don't wing a tone silently. A derived voice you named beats an improvised one you didn't.

## Characterize the voice on operational dimensions
A single adjective ("friendly") isn't a voice — it's a vibe. Pin the voice on axes a second writer would apply the same way:

- **Personality / traits** — the 3–5 defining adjectives, each with a **"we are X, not Y"** contrast (*confident, not arrogant*; *warm, not saccharine*; *precise, not clinical*). The contrast is what makes a trait operational — it tells you what to cut.
- **Person & formality** — first/second person, contractions yes/no, sentence length, how much the brand addresses "you."
- **Lexicon** — words we use and words we ban: product/feature names, jargon policy, forbidden clichés ("seamless", "revolutionary", "game-changer").
- **Register range** — how much enthusiasm, humor, and empathy the brand allows, and where each is *not* allowed.

## Adapt to the surface, hold the voice — same brand, different volume
The voice is constant; the **register flexes by the surface's job**. An error message, a changelog, an App Store description, and a marketing hero all sound like the same brand — at different volumes.

| Surface | The surface's job | Register |
|---|---|---|
| Error / empty state | Calm the user, give the next action | Plain, reassuring, zero blame — never cute about failure |
| Onboarding / microcopy | Move the user forward without friction | Brief, encouraging, one idea at a time |
| Changelog / release notes | State what changed, truthfully | Crisp, factual, benefit-tagged — not marketing |
| App Store / marketing | Earn the tap — lead with the payoff | Benefit-led, confident, concrete |

Match the surface's job **without changing who the brand is.** A brand that's warm-but-precise is still warm-but-precise in an error message — just quieter.

## The content bar (applies everywhere)
- **Benefit before feature** — lead with what the user *gets*, not the mechanism. "Find any note in a second," not "Full-text search index."
- **Concrete over vague** — kill vibe words ("powerful", "seamless", "robust", "next-level"). Show the specific, don't claim the abstract.
- **Every claim true and specific** — no invented superlatives, no "#1" you can't back. If you can't support it, cut it. (This is `quality`'s never-fabricate, at the sentence level.)
- **One idea per sentence** — if there's a second clause carrying a second idea, split it.
- **Active voice, present tense** by default.
- **The reader's words, not ours** — the audience's vocabulary, not internal jargon or feature codenames.
- **Plain and inclusive** — no idioms that don't translate, no ableist metaphors; readable at the audience's level.

## Verify before done — the read-aloud test (voice-truth)
Read the copy **aloud**. If it sounds like a generic assistant, or like a *different* brand, it fails. Then check it **trait by trait**: for each key line, name which voice trait it delivers — and cut any line that delivers none. Don't approve copy from a silent skim. (Parallel to design-craft's "render at real viewports" — copy has its own verification, and it's the ear.)

## Scope boundary — voice is the *sound*, not everything about the words
This skill owns how copy *sounds*. It is **not**:
- **Visual / layout / typography** → `design-craft`.
- **The task prompt / brief** you write to another agent → `prompt-craft`.
- **SEO keyword strategy, metadata, ranking** → the `seo-*` skills.
- **Legal / compliance wording** (privacy, ToS, disclaimers) → the `legal` skill.
- **Information architecture** — *what* sections exist and in what order (that's structure; voice is how each reads).

If the ask is "how should this *sound*," it's brand-voice. If it's "what should this *say structurally*," "how should it *look*," or "which *keywords*," route to the owner above.

## Relationship to sibling skills
- **`quality`** — the bar every piece of copy is held to: best-in-class, with evidence, or the gap named. Brand-voice sits under it.
- **`design-craft`** — the visual sibling. Voice is to copy what design-craft is to UI: a portable "how" applied to each project's own concrete system (there, the design system; here, the voice guide).
- **`prompt-craft`** — writes prompts/briefs *for agents*, not user-facing brand copy. Both reject vibe words; different audiences.
- **`app-store` / `growth` / `legal` doer skills** — they carry the domain specifics (ASO fields, PR outreach, compliance clauses); brand-voice carries the consistent *sound* across all of them.

Full do/don't table, the output format, and worked examples: [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md).
