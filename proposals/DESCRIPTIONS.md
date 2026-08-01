# Description Drop-ins — remaining zero-usage skills + conflict patches

Companion to PROPOSALS.md. Frontmatter `description:` replacements only; bodies unchanged. Pattern: open with the operator's real phrases, close with fence lines. The audit already carries capture-figma, capture-website, perplexity-research, prototype, design-system, diagnosing-bugs. New plugin-era skills (agent-ops, architect-systems, brand-voice, code-minimalism, design-taste-frontend, impeccable, prompt-craft, release-deploy, webapp-testing) are excluded — they haven't had time to prove or fail their triggers.

## Plugin skills (discipline)

**define-terms**
> Keep the project's vocabulary sharp — challenge fuzzy or colliding terms, maintain the CONTEXT.md glossary, record lightweight ADRs when decisions crystallise. Trigger on "just to be clear", "need to be clear on this one", "what I mean by X is", "I've renamed X to Y", naming disputes (component/variable/block names), or whenever the operator corrects terminology mid-task. Not for document templates — that's doc-formats.

**design-modules**
> Design deep modules with small interfaces before writing code — clean seams, testable through the interface. Trigger on "how should we structure this", "where does this logic live", "split this component/service", designing any new module, or a shallow pass-through spotted in review. Not system-wide decomposition — that's architect-systems; not UI — that's design-craft.

**discover-scope**
> Turn a raw ask into a validated scope through gather → research → validate cycles growing a living SCOPE doc. Trigger on "new concept", "I'd like to explore", "there will likely be a large amount of updates", "I'm reconsidering a few things", starting any client or product discovery, or when requirements are clearly still forming mid-conversation. Not for shaping a settled idea into a plan — that's shape-stress.

**doc-formats**
> Registry + canonical templates for keyed markdown documents (SCOPE, DOCUMENTATION). Trigger before writing ANY typed markdown artifact — a scope, spec, handover, or documentation file — or when another skill needs the correct document shape. If a sibling skill owns the doc's structure, this registry says so; check here first, then write.

**issue-triage**
> Move a raw issue to ready-for-agent — verify the claim, write a testable brief, or capture the rejection. Trigger on "there are discrepancies", "I noticed some issues", "a couple of things are off", any list of defects from the operator or an audit, or before handing any vague/unverified issue to a specialist. Not the fix itself — that's the assigned agent's job.

**model-routing** *(description patch only; content unchanged — routing chain-loads this)*
> Decide model tier, effort, and turn caps for every dispatch — sonnet default, opus rare and justified, top-tier never dispatched; every spec sets maxTurns. Trigger before ANY Agent call or workflow spec, chain-loaded by routing as load-order step 2. Not WHO handles the work — that's routing; not brief structure — that's dispatch-brief.

**ops-inbox**
> Operates Jarrad's ops system — morning sweep, standup drafting, meeting-notes pipeline, Ops Inbox canonical memory. Trigger on "what's on my plate", "refresh the inbox", "draft my standup", "mark X done", "what did we decide about", "what does <person> owe", after any meeting ends, or when reconciling completed work. Chains summarise-meeting for transcript processing.

**summarise-meeting**
> Transform a raw meeting transcript into a structured, evidence-quoted summary — decisions, actions, disagreements. Trigger whenever a transcript is provided and the ask is notes, a write-up, actions, or "what did we align on" — even without Notion mentioned. Also invoked by ops-inbox's meeting-notes pipeline. Not research-interview synthesis — that's research-synthesis.

**shape-stress** *(absorbs stress-plan per PROPOSALS §2)*
> Shape work into six sections — Context, Exploration & References, Outcomes, Acceptance Criteria, Constraints & Known Risks, Out of Scope — then stress it until the checklist is green. Trigger on "is there anything else that needs to go into the plan", "anything else technical or best in class we should have", "is the plan ready", turning conversation context into a project shape, or stress-testing/grilling any existing plan or proposal (the absorbed stress-plan mode: one question per turn, each with a recommended answer). Not raw discovery — that's discover-scope.

**motion** *(the merged trio, per PROPOSALS §2)*
> Build, review, and name motion — animation decisions, easing, timing, springs, press feedback; review against the craft bar with an explicit Block/Approve; and reverse-lookup any effect's proper name. Trigger on "the animation feels off", "should we look at motion/transition", "review the transition", "what's it called when…", choosing easing/duration, or adding transitions. Not implementing Figma-authored motion — that's figma-implement-motion; not performance of animations — that's performance.

## Personal library conflict patches

**banana** *(drop the editing claim)*
> AI image generation Creative Director (Gemini image models) — generation and creative direction ONLY. Trigger on "generate an image", "create a photo", "design a logo", "make a visual", art direction for brand assets. NOT for editing existing images — identity-preserving edits, reframing, clothing/pose/style changes are qwen-edit's.

**qwen-edit** *(fence line added)*
> AI image editing with Qwen-Image-Edit — edit existing photos while preserving identity: reframing, clothing, poses, style transfer, character transformation. Trigger on "edit this picture/photo", "change the X in this image", "reframe/extend this shot". NOT for generating new images from scratch — that's banana.

**cloudflare** *(umbrella → thin index)*
> Index of the Cloudflare skill family — this skill only routes; the siblings hold the depth. Workers code/review → workers-best-practices · CLI/deploys → wrangler · stateful coordination → durable-objects · email → cloudflare-email-service · agents/MCP on Workers → agents-sdk · sandboxed execution → sandbox-sdk. Load a sibling, not this index, for any actual work; consult this only when unsure which sibling owns the task.

## Suggested routing-table addition (pending research)

Next.js work is entering the stack and no skill covers it (the web library is Astro-leaning). Dispatch Researcher (perplexity-research) to survey Next.js skills/MCP tooling/best-practice packs; on findings, add a "Next.js project" row to routing's domain-library table and, if warranted, a nextjs skill to the personal library or plugin.
