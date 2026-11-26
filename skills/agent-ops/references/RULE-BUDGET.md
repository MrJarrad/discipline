# Rule budget (DISC-390, operator 2026-11-26: "adopt all 4")

A rule costs a rule. Adding a line of law to a skill, reference, hook or charter needs three things in the same change:

1. **An eval-gate result** showing the rule changes the outcome it targets (`agent-ops` non-negotiable 1: GREEN, with a baseline showing the change discriminates).
2. **A rule retired**, named, or a recorded reason none can go. The ledger carries it as `budget: retires(<rule>)` or `budget: none(<reason>)` on any lesson or ruling dated 2026-11-27 or later that is encoded in a release (`lesson-ledger.mjs` refuses a record without it). `none` fits a change that adds no rule line, such as a script fix.
3. **A model stamp** when the rule patches a model mistake: say which model family showed it, so the next model release can re-test it.

**Re-test at each new model release.** Take the rules sorted as pile (c), a workaround for a past model mistake, and run them through `skill-eval.mjs --live` old against removed, same cases, same samples. A rule whose removal costs nothing comes out. Pile (a), the operator's preference, and pile (b), house and design-system law, are not budgeted away.

**Worked example (DISC-389, 26 Nov 2026).** 19 of the 28 pile-(c) files that live in the plugin (the other 53 of the 81 are vault rulings) were removed (discipline #267, 11 references and 8 hooks). The eval gate ran 35 cases, 133 samples per arm: old rules passed 112, trimmed passed 114, and the three cases that looked worse re-ran equal at 10 samples each. No measurable loss. Limits to state with any such result: the gate scores skill triggering, routing, fences and three reply cases, not full build tasks, and it does not exercise hooks, which enforce at tool-call time. Evidence: `projects/jhd-discipline/evidence/2026-11-26-disc389/eval-results.md` in the vault.
