# Known failure modes

Moved verbatim from `skills/cloud-dispatch/SKILL.md` (DISC-351 step 8); the skill points here.

- **Setup-script cwd trap:** the environment's setup script runs in `/home/user` while
  the repo clone lands in `/home/user/<repo>` — a bare `pnpm install` in the brief or
  setup script fails fatally before Claude starts. Use `cd /home/user/<repo> && pnpm install --frozen-lockfile`,
  or let the doer install per-run.
- **`github_repo` field silently dropped** on create — repo binding only takes effect via
  `session_context.sources`.
- **`update` replaces `job_config.ccr` wholesale** — partial updates silently drop fields
  not resent (see Step 1).
- **Private-marketplace plugin fetch fails in cloud.** The cloud GitHub proxy scopes
  credentials to repos attached to the session; git credential helpers are disabled. A
  private github-source marketplace repo is outside proxy scope and the plugin fetch is
  unauthenticated and fails by design. Committed repo-`CLAUDE.md` overlays are the
  standing net until the marketplace repo is public or another fix lands.
- **Cloudflare auth comes from the egress proxy.** In a cloud session `CLOUDFLARE_API_TOKEN` is a placeholder; the proxy injects the real credential only when a request carries no `Authorization` header, and Node `fetch` ignores the proxy unless `NODE_USE_ENV_PROXY=1`. A header-stripping fetch wrapper is refused by the session safety check; the sanctioned path is a script that omits the header when the token is unset (hoverboard `publish-companion.mjs`, #23), run as `env -u CLOUDFLARE_API_TOKEN NODE_USE_ENV_PROXY=1 node …`.
- **Webhook batons self-gate.** A webhook `filter` is accepted and silently dropped, every push fires
  the target, and a disabled target is skipped with no run row. The target routine's prompt (and the
  repo overlay, for promptless re-inits) opens by checking `$CCR_TRIGGER_REF` against the expected
  branch and exits "no-op (ref mismatch)"; pin its model to `haiku`; never wire an unfiltered webhook
  to a busy repo; fetch before trusting the head sha.
- **Fire caps / 429s leave no run row** — a routine that appears created but never shows
  a run may have hit a daily fire cap silently; check for a run row before assuming the
  dispatch is in flight, and retry rather than assume state.
