# Research grounding — prompt-craft

This skill is grounded in a Perplexity deep-research pass (2026-07-04, gpt-5.2, grounded/cited) cross-read against the primary sources below. It is **not** written from intuition. Load-bearing claims and their sources:

## Primary sources

- **Anthropic — Claude prompting best practices.** The shared foundations (colleague test / "golden rule", context+motivation, 3–5 diverse examples in `<example>` tags, XML sectioning for mixed inputs, role in the system prompt, explicit success criteria + self-check, sequential steps when order matters, confirmation gates for risky/destructive actions).
  <https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices>
- **Prompt underspecification (Uni. Luxembourg preprint).** Missing requirements/context/constraints cause large downstream quality drops (reported up to 95.3% in their setup), and the loss is hard to recover with prompt optimization alone — the missing information must be supplied or elicited. This is why **under-specification is the dominant, costly failure mode** for execution prompts.
  <https://orbilu.uni.lu/bitstream/10993/68473/1/Preprint_Prompt_Guideline_Optimization.pdf>
- **DETAIL — prompt specificity study (arXiv 2512.02246).** More detail generally improves accuracy for *procedural* tasks (especially smaller models), but excessive detail can *constrain reasoning* on open-ended tasks. This is the evidence for "choose the altitude first, then tune specificity" — over-specifying a strategy brief hurts.
  <https://arxiv.org/html/2512.02246v1>
- **Addy Osmani — self-improving agents.** Autonomous coding loops work best with *atomic* tasks (one agent session) and *unambiguous pass/fail criteria* (tests, lint, typecheck). Grounds the execution-altitude "keep it atomic" + "acceptance criteria as pass/fail checks".
  <https://addyosmani.com/blog/self-improving-agents/>
- **IdeaPlan — specs for AI coding agents.** The SCOPE method (stack + directory structure + conventions so the agent doesn't guess), the **Always / Ask-first / Never** three-tier boundary system, phase decomposition (foundation → core → interface → polish), and the flag on ambiguous "vibe" language. Grounds execution-altitude scope boundaries, operational facts, and phasing.
  <https://www.ideaplan.io/blog/how-to-write-specs-for-ai-coding-agents>

## House exemplars (used as reference, not from the web)

- **The agent+skill research brief** — the canonical "wide, done right" strategy brief. Its four-move shape (state givens → pose the whole question openly → invite the unknown → name exemplars without pre-deciding) is Altitude 2 in the skill.
- **The operator-feedback principle `pose-the-big-question`** — "narrow for execution, wide for strategy/design"; a narrow brief answers a sub-slice and misses the real question. This is the skill's one rule at the strategy altitude.
- **The model bake-off** — the empirical proof, internal to the system, that fixing the T4 prompt changed what every model produced. The prompt is a real lever.

## Confidence

High on the shared foundations and the execution-altitude components (Anthropic's guidance is first-party and the agent-spec sources converge). Medium-high on the specific under-/over-specification tradeoff — the direction is well-supported; the exact 95.3% figure is one study's setup and is cited as illustrative of magnitude, not as a universal constant.
