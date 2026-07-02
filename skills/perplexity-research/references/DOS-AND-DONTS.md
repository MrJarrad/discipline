# Do's and Don'ts — perplexity-research

---

## Do

| Do | Why |
|----|-----|
| Call **Perplexity** for any research, lookup, comparison, or market/competitor question | It is the answer engine of record — live, sourced answers |
| Lead the response with **Perplexity's answer** | The answer is the deliverable, not the call itself |
| Keep the **citations** Perplexity returns | Research without sources isn't done |
| Separate **sourced fact** (from Perplexity) from **your own inference** | Reader needs to know what's verified vs added |
| State **confidence** (high/medium/low) and name open questions | Honesty about what the query didn't settle |
| Use `"preset":"fast-search"` for quick lookups; drop the preset and allow more output for deeper questions | Match query depth to the question |
| Say so explicitly if **Perplexity returns nothing usable** | Never paper over a failed lookup |

---

## Don't

| Don't | Why |
|-------|-----|
| Answer a research question **from training memory** | Training data can be stale or wrong; Perplexity is live |
| Drop the **citations** when relaying the answer | Turns a sourced answer into an unsourced claim |
| Present your own **inference as if Perplexity sourced it** | Misattributes confidence |
| Skip the call because the answer "seems obvious" | The whole point is live, sourced verification |
| Fabricate a citation if Perplexity's response has none | Never invent a source |

---

## Branch-specific

### Quick factual lookup

**Do:** `"preset":"fast-search"`, lead with the answer, attach citations.

### Deep/complex research question

**Do:** Drop the preset, pass the fuller question, allow more output tokens; still cite.

### When the question is really a values/preference call, not a fact

**Do:** Recognize it's not a research question — Perplexity is for lookups, comparisons, sourced facts, not for the user's own subjective choice. Answer directly or ask, don't force a Perplexity call.

### When Perplexity returns no usable answer

**Do:** State plainly that the lookup came back empty/unusable — don't fill the gap with memory.

**Don't:** Silently substitute a training-memory answer for the failed call.

---

## Output format

1. **Answer** — Perplexity's answer, lead first.
2. **Citations** — the sources Perplexity returned.
3. **Confidence** — high/medium/low.
4. **Open questions** — anything the query didn't resolve.

---

## Examples

**Good:**

```
Called Perplexity (fast-search): "What's the current default model for Claude Code?"
Answer: <Perplexity's cited answer>
Citations: [links Perplexity returned]
Confidence: high — directly answered with a dated source.
```

**Bad:**

```
I recall Claude Code defaults to Sonnet — no need to look it up.
```
