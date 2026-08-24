---
name: research-synthesis
description: >-
  Answer open questions with live, sourced, adversarially-verified findings —
  decompose, fan out via web search, open primary sources, source-or-stop,
  synthesize with confidence. Use for research, competitive/market scans,
  "what's the best X", "compare A vs B", or multi-source investigation. Not for
  evaluating an external skill/plugin/repo for adoption — that's skill-review
  (which may still use this method for reputation checks).
---

# Research Synthesis

A link dump is not research. The deliverable is a **decision-ready answer**: what's
true, how you know, and how sure you are. Never answer live-world facts from training
memory alone.

Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying this skill.

## Lookup mechanism (Claude-native)

1. **WebSearch** — fan out several query angles (not one). Prefer recent, primary-source
   queries (official docs, RFCs, GitHub, standards, filings).
2. **WebFetch** — open the actual pages you will cite. Titles/snippets are not sources.
3. **Repo/docs already on disk** — for in-estate questions, read files first; don't
   web-search what the vault or code already answers.
4. If search returns nothing usable → say so. Never invent URLs, papers, or numbers.

## The loop

1. **Decompose** — restate the question; break into deciding sub-questions.
2. **Fan out** — search several angles; prefer primary over secondary summaries.
3. **Source or stop** — every load-bearing claim cites a source you actually opened.
4. **Adversarially verify** — for each key claim: "what would prove this wrong?" Find
   the counter-source before committing.
5. **Synthesize** — lead with the answer; then evidence; then confidence.

## Source priority

1. Primary — official docs, specs, source repos, filings, API references you fetched
2. Secondary — reputable technical write-ups that cite primaries
3. Weak — forums, undated blogs, marketing pages — never alone for ≥ medium confidence

## Output shape

- **Answer** — bottom line first
- **Evidence** — each claim → URL or `path:line` you opened
- **Confidence** — high / medium / low, and what would change it
- **Open questions** — unresolved gaps
- **Alternatives** — when comparing options, name the rejected path in one line

## Non-negotiables

- Never fabricate a source, statistic, quote, or citation
- Separate fact (sourced) from inference (yours)
- A verified "unknown" is a finding, not a failure
- A skimmed SERP snippet is not a read source

This is the research-specific expression of `quality` (verify before claiming, never
fabricate). Assign both together.
