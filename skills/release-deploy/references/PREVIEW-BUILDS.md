# Preview builds

Moved verbatim from `skills/release-deploy/SKILL.md` (DISC-351 step 8); the skill points here.

Previews build on
Cloudflare Workers Builds. **Space preview builds**: three or more overlapping branch builds hit
Cloudflare's R2 API rate limit (429) and fail with no code change. Start the next build once the one
before it finishes, and re-run a red build once the others are done
(`overload-and-untested-live-2026-10-15` item 3). **Serial hand-out, no polling** (s44): with several
helpers, the parent hands out "build now" one at a time, and the next waits until the previous PR's Workers
comment reports, never on the helper's "pushed" (s45: two overlapping builds); a helper watches the PR's Workers comment
on GitHub, never the Cloudflare API (six helpers building and polling at once drew 429, then account
throttling, code 971). **Cloud sessions cannot publish a preview themselves**: in-session `wrangler`
asset upload fails 401 (the session proxy swaps its one-time upload credential), so previews come from
Workers Builds only (`2026-10-31-s44-parent-lessons` 1, 2).
