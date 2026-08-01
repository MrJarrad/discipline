---
name: release-deploy
description: How we ship a change to production safely — the build → deploy → rollback → observability procedure, with a flag-gated deploy checklist. Use when releasing or deploying any product (web app, npm engine, Figma plugin), turning a flag on/off in production, or planning a rollback. Not for merging a reviewed PR — that's ordinary review routing, not a release.
---

# Release / Deploy

A merged, green PR is not a release. **Shipping is its own procedure**, and its whole point is
that a bad change is *cheap to undo* — you deploy behind a flag that starts **off**, prove it in
production against a smoke check, ramp it in, and if the numbers move the wrong way you flip the
flag **off in seconds** without a redeploy. This skill is that procedure and the checklist that
enforces it.

**Use this when:** releasing/deploying any product, flipping a production feature flag,
ramping a rollout, or executing a rollback.
**Not for:** merging a PR (that's the review gate) or local/dev runs. Deploy is downstream of a
green, reviewed merge — never a substitute for one.

## The default posture: progressive, not big-bang

Every risky change ships **dark first**. The deploy that puts new code on the servers and the
release that turns it on for users are **two separate acts**. Decoupling them is what makes a
release reversible: the flag is the kill switch, and flipping it costs seconds, not a redeploy.

- **Deploy** = new code is live but the flag gating it is **off** → user-invisible, safe to sit.
- **Release** = ramp the flag on (canary → % → 100) while a smoke/observability check watches.
- **Rollback** = flip the flag **off** (instant), and only if the flag can't isolate it, revert
  the deploy.

If a change genuinely can't be flag-gated (a schema migration, a dependency bump), say so
explicitly and treat the whole deploy as the risk surface — expand-migrate-contract the schema so
each step is independently reversible, and rehearse the rollback *before* you ship.

## The four phases

### 1. Build — a release artifact, not a working tree
- Build from a **clean, tagged commit** on the release ref, not from uncommitted local state.
- Run the full gate on that artifact: **typecheck + build + tests** green, on the artifact you
  will actually ship. No "should work" — see `quality` (verify before claiming).
- The artifact is **immutable and identifiable** (version/tag/hash). You must be able to say
  exactly what is in production and diff it against the last-good release.
- Record the **last-known-good** version *before* you ship — that's your rollback target.

### 2. Deploy — dark, behind an off flag
- Deploy the artifact with the new behaviour **gated by a flag defaulting to off**. Nothing
  user-visible changes yet.
- Confirm the deploy is healthy *at flag-off*: process up, health check green, no error-rate
  change. A deploy that breaks with the flag off is a build/deploy bug — stop and fix, don't ramp.
- **Never flip a user-visible flag as your first production act.** Prove the deploy first.

### 3. Release — ramp the flag, watch the smoke
- Turn the flag on for the **smallest blast radius first**: internal/operator, then a small %,
  then wider, then 100.
- At **each step**, run the smoke check and watch observability for a hold-window before widening.
  Ramp only when the step is clean.
- A **user-visible** flag flip is a `visual`/`creative` change under the
  [operator review gate](../../operator-review-gate.md) — it needs the operator's sign-off, not
  just a green smoke. Route it; don't self-flip a change the operator would want to see.

### 4. Observability — you can't ship what you can't watch
- Before ramping, know your **signals and thresholds**: error rate, latency, and one or two
  product-level success metrics for the feature. Write the abort threshold down *before* you flip.
- **Smoke test** the golden path in production after each ramp step — the one user-observable thing
  that proves the feature works end-to-end (see `qa-acceptance` for what "golden path" means).
- If a signal crosses its threshold, **roll back first, diagnose second** (see `diagnosing-bugs`).
  The flag-off is free; a lingering regression is not.

## Rollback — the move you rehearse, not improvise

- **First lever: flip the flag off.** Instant, no redeploy, no build. This is why you gated it.
- **Second lever: redeploy last-known-good** (the version you recorded in phase 1) — for changes a
  flag can't isolate.
- **Third lever: forward-fix** only when neither is safe (e.g. a migration already ran) — and only
  with the same build gate as any deploy.
- A rollback path you haven't confirmed *works* is not a rollback path. For anything irreversible,
  rehearse it before the deploy, and treat data loss / irreversible migration as a **destructive**
  operator-gate category — surface it, don't decide it (see the [operator review gate](../../operator-review-gate.md)).

## The checklist

Every flag-gated deploy runs the checklist in
[references/DEPLOY-CHECKLIST.md](references/DEPLOY-CHECKLIST.md). Copy it onto the deploy issue,
tick each line with its evidence (command output, dashboard link, flag state), and attach it as the
release's work product. An unticked checklist is not a release — it's a plan.

## Where this sits

- **Owner:** this skill owns the procedure standing; the **engineer** persona runs
  it to ship a flag-gated deploy. When routing a deploy for review, hand the reviewer the
  ticked checklist plus the smoke/observability evidence.
- **Bar:** held to `quality` like any output — verified with evidence, never fabricated. A
  surfaced "the smoke failed, rolled back" beats a false green.
- **Stack mapping:** the procedure is the spine; map it to the target —
  - **Web app (Cloudflare Workers/Pages):** artifact = a Wrangler deploy/version; flag = the flag
    provider (e.g. Flagship / a KV-backed switch); rollback lever 2 = `wrangler rollback` /
    re-deploy of the prior version. See the `wrangler` and `cloudflare` skills for exact commands.
  - **Engine (npm):** artifact = a published version; ship **canary from the release branch first**,
    promote to **stable** only after the canary is clean; rollback = publish/pin last-good. See
    the package's release-automation docs.
  - **Figma plugin:** artifact = a plugin build; "flag" = a staged/private release or in-manifest
    switch before public publish; rollback = re-publish the prior build.
  Keep the flag + smoke + rollback discipline identical across all three — only the commands change.
