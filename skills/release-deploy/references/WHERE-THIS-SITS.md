# Where this sits

Moved verbatim from `skills/release-deploy/SKILL.md` (DISC-351 step 8); the skill points here.

- **Owner:** this skill owns the procedure standing; **releaseops** runs
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
