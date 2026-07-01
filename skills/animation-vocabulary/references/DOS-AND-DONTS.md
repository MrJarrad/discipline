# Do's and Don'ts — animation-vocabulary

---

## Do

| Do | Why |
|----|-----|
| Return **one precise term** first, glossary definition verbatim | AC-precise-term |
| Read for **intent/feel**, not literal keywords, before matching | Users describe sensations, not names |
| Disambiguate close terms with 1–2 alternates when several compete | AC-disambiguate |
| Keep answers tight — term first, expand only if asked | Naming skill, not an essay |
| Stay within the glossary; say plainly when no exact match | AC-no-invent |

---

## Don't

| Don't | Why |
|-------|-----|
| Design or implement animations | Naming only — pair with a design/review skill for that |
| Paraphrase glossary definitions | Verbatim is authoritative |
| Invent a term that isn't in the glossary | Erodes trust in the vocabulary |
| Run a full UI or motion review on a naming question | Out of scope |
| Bury the term under caveats or a long lead-in | Lead with the answer |

---

## Branch-specific

### When asked "what's it called when…" with a clear match

**Do:** Lead with **Term** — one-line glossary description, verbatim. Stop there unless more is asked.

**Don't:** Explain how to build it, or list unrelated terms "just in case."

### When several terms compete for the same description

**Do:** Name the single best match first, then 1–2 close alternates with a short note on what would make the alternate the right pick instead (e.g. *Morph* vs *Crossfade* vs *Shared element transition*).

**Don't:** List every plausibly-related glossary term without ranking, or refuse to commit to a best match.

### When the description doesn't match anything in the glossary

**Do:** Say plainly that nothing matches exactly, then either name the closest term as an approximation or describe the effect using glossary vocabulary (e.g. "that's a *stagger* of *scale-in* entrances").

**Don't:** Invent a plausible-sounding term, or silently substitute an unrelated glossary entry as if it were an exact match.

---

## Output format

Lead with the term, bolded, followed by an em dash and the glossary's one-line description, verbatim:

```
**Term** — glossary description.
```

If disambiguating, follow with the best match first, then alternates:

```
**Best match** — description.

Close alternates:
- **Alternate 1** — when this one applies instead.
- **Alternate 2** — when this one applies instead.
```

---

## Examples

**Good:**

```
User: "The bouncy thing when a menu pops open."
**Pop in** — Element appears with a slight overshoot, like it bounces into place.
```

**Good (disambiguation):**

```
User: "One image turning into another."
**Morph** — One shape smoothly turns into another shape, e.g. Dynamic Island.

Close alternates:
- **Crossfade** — if they simply fade over each other in the same spot.
- **Shared element transition** — if an element travels and transforms from one position into another.
```

**Bad:**

```
User: "The bouncy thing when a menu pops open."
There are a lot of ways to animate a menu opening — you could use a scale
transform, a spring, some easing... here's a full breakdown of animation
principles and how you might implement each approach in CSS or JS...
```
→ Buries the term, drifts into implementation, never commits to an answer.
