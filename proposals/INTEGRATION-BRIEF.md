# Integration run — skills cleanup proposals

You are the discipline orchestrator running headless in ~/JHD/discipline. Operator (Jarrad) has approved this work. Follow operator-rules.md: tasks as evidence, edits via Edit/Write only, checkpoint commit before anything destructive, typecheck gate, evidence over prose.

Load agent-ops first — it owns skill-library changes and the eval gate. Then integrate the proposals folder into the plugin:

1. Read proposals/PROPOSALS.md, proposals/DESCRIPTIONS.md, proposals/routing/SKILL.md, proposals/nextjs-research-brief.md.
2. NEW SKILL: install proposals/routing/SKILL.md as skills/routing/SKILL.md. Note its flagged deviation: routing chain-loads model-routing rather than merging it — accept unless the eval gate objects.
3. MERGES (per PROPOSALS section 2): motion-craft + review-animations + animation-vocabulary into skills/motion/ (Build/Review/Vocabulary sections, carry the references/ folders across, keep the Block-Approve bar); shape-stress absorbs stress-plan (stress-plan deleted, its interview mode + trigger phrases folded in); optionally vault-recall + vault-write into skills/vault/ (low priority — skip if the eval gate prefers the pair).
4. DESCRIPTION DROP-INS: apply every frontmatter description replacement in DESCRIPTIONS.md and in the dependability audit set (capture-figma, capture-website, perplexity-research, prototype, design-system, diagnosing-bugs — drop-in text is quoted in DESCRIPTIONS/PROPOSALS; where only the pattern is given, write to the same pattern: operator phrases first, fence lines last).
5. AGENT CHARTER PATCHES (PROPOSALS section 5): researcher.md, project-manager.md, releaseops.md, ux-designer.md — one-line dispatch-trigger additions and the capture-skill precondition.
6. VERIFICATION HOOKS (PROPOSALS section 6): Reviewer checklist gains the brief-mandated-skills evidence check; wrap gains the session skills/personas-vs-routing-tables report line.
7. NEW SKILL nextjs: create skills/nextjs/SKILL.md from the outline in nextjs-research-brief.md section 4 — write the full body (all 12 sections) using the brief's researched facts, and add the Next.js row to routing's domain table.
8. Update marketplace.json version (minor bump) and CHANGED.txt.
9. Typecheck/lint whatever the repo gates require; run any skill evals agent-ops mandates.
10. Commit in logical commits on a branch named proposals-integration; do NOT push. Leave a summary of commits + any deviations in proposals/INTEGRATION-REPORT.md.

Dispatch specialists per your routing where appropriate; keep model tiers per model-routing (sonnet default). If something in the proposals conflicts with repo reality, prefer repo reality and record the deviation in the report.
