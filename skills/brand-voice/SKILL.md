---
name: brand-voice
description: 'Use when writing, rewriting or reviewing any words a user reads — meta descriptions and search snippets, page titles, App Store copy, marketing, onboarding, microcopy, error messages, changelogs. How to write user-facing copy in one consistent brand voice, the universal "how" beneath every project''s own voice guide: derive the voice once from the brand''s definition, apply it to every surface, verify by reading aloud. Not visual/layout (design-craft), task prompts (prompt-craft), keyword strategy or ranking, or legal wording (legal).'
---

# Brand Voice

A brand's voice guide tells you *what* the voice is — its traits, its lexicon, its say/don't-say. This skill is *how* to wield it, so every line a user reads sounds like one brand — on any project, any surface.

Load [references/HOUSE-VOICE.md](references/HOUSE-VOICE.md) first, on every use: it is the house voice for all published copy. Its "Warmth over mechanics" section holds its numbered rules and the tone-target paragraphs for every page; write toward them. Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying this skill.

## The one rule — voice is applied, never improvised
Every line of shipped copy traces to the brand's voice definition: its **traits**, its **lexicon**, its **say/don't-say**. No off-brand phrasing, no generic "AI voice," no per-writer drift. **Improvised tone is a bug, not a shortcut.** If the voice guide doesn't cover the case, **extend the guide, then write** — don't quietly invent a one-off tone. This holds regardless of which brand you're writing for — it's the rule beneath all the rest. The house voice is the floor under every brand; a project's voice guide adds only project specifics (traits, lexicon, surface quirks) and never restates it.

Before drafting from the operator's instruction, restate it literally (which parts, joined how) — `prompt-craft` § Restate the instruction literally.

## On arrival — find the voice
1. **Load the house voice** ([references/HOUSE-VOICE.md](references/HOUSE-VOICE.md)), then **locate the project's voice definition.** Check the repo: `AGENTS.md`, a brand/tone-of-voice doc, a `VISION.md`, existing *shipped* copy (App Store listing, marketing site, in-app strings). Read it before writing a word.
2. **No guide? Derive one — and surface it.** Start from the house voice; infer a lightweight voice from the best existing shipped copy plus the product's positioning and audience, write it down (the dimensions below), and **surface it for confirmation** — don't wing a tone silently. A derived voice you named beats an improvised one you didn't.

## Characterize the voice on operational dimensions
A single adjective ("friendly") isn't a voice — it's a vibe. Pin the voice on axes a second writer would apply the same way:

- **Personality / traits** — the 3–5 defining adjectives, each with a **"we are X, not Y"** contrast (*confident, not arrogant*; *warm, not saccharine*; *precise, not clinical*). The contrast is what makes a trait operational — it tells you what to cut.
- **Person & formality** — first/second person, contractions yes/no, sentence length, how much the brand addresses "you."
- **Lexicon** — words we use and words we ban (the house banned list in [HOUSE-VOICE.md](references/HOUSE-VOICE.md) always applies; the project adds its own): product/feature names, jargon policy, forbidden clichés beyond the house list.
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
- **Benefit before feature** — lead with what the user *gets*, not the mechanism. "Find any note in a second," not "Full-text search index." Say what a thing is for, not only what it is.
- **Concrete over vague** — kill vibe words (the banned list in [HOUSE-VOICE.md](references/HOUSE-VOICE.md), plus "powerful", "next-level"). Show the specific, don't claim the abstract. An honest feeling word that is true (considered, quiet, crafted, exceptional) is not a vibe word.
- **Every claim true and specific** — no invented superlatives, no "#1" you can't back. If you can't support it, cut it. (This is `quality`'s never-fabricate, at the sentence level.)
- **One idea per paragraph**, stated as a belief. Sentences may run and join, and vary in length; avoid a list of three verbs, and don't open every line in a set the same way. Where several items sit together, one line that ties them helps; it is never a required intro.
- **Active voice, present tense** by default.
- **The reader's words, not ours** — the audience's vocabulary, not internal jargon or feature codenames.
- **Plain and inclusive** — no idioms that don't translate, no ableist metaphors; readable at the audience's level.

## Drafting method — research, three directions, the bank, a fact pass
Every new piece of copy runs these steps in order; each ends on its criterion.

0. **Know the client.** Read the project's copy brief (`projects/<p>/copy/<p>-copy-brief.md` in the vault). None yet: read the client's own site and about page and how others describe them (`capture-website`, copy angle: their words, product names, what they are known for) and file the brief ([references/COPY-BRIEF-AND-BANK.md](references/COPY-BRIEF-AND-BANK.md)). Their words make the copy specific; facts about the work come from the spec; a fact from the web is checked before use. *Done when the brief exists and names its sources.*
1. **State the page's job and its reader**, one line each. *Done when both lines are written above the drafts.*
2. **Write three distinct directions**: different openings and structures, never one sentence with words swapped. *Done when the three differ in shape, not only wording.*
3. **Compare against the exemplar bank** (`projects/<p>/copy/<p>-exemplar-bank.md`): pick the direction closest to the lines the operator approved and name the bank line it is closest to. *Done when the pick names that line.*
4. **Polish and read aloud** (§ Verify before done). *Done when it passes.*
5. **Fact pass, separate from the writing**: check every claim against the spec and change the fewest words that make it true. *Done when each change names the fact behind it.*

Branches:
- **Copy the operator supplied** (ChatGPT or anywhere else): the default is his copy with facts checked, step 5 only, never a merge back toward an older draft or spec (s45).
- **Second miss**: after a second "not quite" on the same set, offer to park it, or ask him for two or three lines of his own, instead of another set (s46).
- **An approved line** goes into the exemplar bank with his words, the same turn.
- **A clean-up pass** removes only working material he named (drafts, questions, history); a field that holds a version of copy is kept and labelled, never dropped on an older ruling (s47).
- **Page titles and meta descriptions**: also [references/METADATA.md](references/METADATA.md).

## Verify before done — the read-aloud test (voice-truth)
Read the copy **aloud**. If it sounds like a generic assistant, like a *different* brand, or mechanical and not nice to hear, it fails. Then check it **trait by trait**: for each key line, name which voice trait it delivers — and cut any line that delivers none. Don't approve copy from a silent skim. (Parallel to design-craft's "render at real viewports" — copy has its own verification, and it's the ear.)

## Scope boundary — voice is the *sound*, not everything about the words
This skill owns how published copy *sounds* (sites, apps, case studies, App Store, microcopy, posts). It is **not**:
- **Operator-facing chat and agent output styles** → out of scope; the house voice never applies there.
- **Visual / layout / typography** → `design-craft`.
- **The task prompt / brief** you write to another agent → `prompt-craft`.
- **Keyword strategy and ranking** → not owned here. Page titles and meta descriptions are copy and are owned here ([references/METADATA.md](references/METADATA.md)); the tags and head hygiene are `markup-standard`'s.
- **Legal / compliance wording** (privacy, ToS, disclaimers) → the `legal` skill.
- **Information architecture** — *what* sections exist and in what order (that's structure; voice is how each reads).

If the ask is "how should this *sound*," it's brand-voice. If it's "what should this *say structurally*" or "how should it *look*," route to the owner above.

## Relationship to sibling skills
- **`quality`** — the bar every piece of copy is held to: best-in-class, with evidence, or the gap named. Brand-voice sits under it.
- **`design-craft`** — the visual sibling. Voice is to copy what design-craft is to UI: a portable "how" applied to each project's own concrete system (there, the design system; here, the voice guide).
- **`prompt-craft`** — writes prompts/briefs *for agents*, not user-facing brand copy. Both reject vibe words; different audiences.
- **`app-store` / `growth` / `legal` doer skills** — they carry the domain specifics (ASO fields, PR outreach, compliance clauses); brand-voice carries the consistent *sound* across all of them.

Full do/don't table and worked example: [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md).
