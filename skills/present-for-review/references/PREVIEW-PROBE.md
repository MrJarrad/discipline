# Probe the served preview before relaying

Lesson `preview-served-probe-and-block-ruling-first-2026-10-11`. The Workers Builds check run on
`preview/*` reports `completed/success` the instant a branch is pushed; the real build lands 5–15
minutes later (seen on every push, 2026-10-10). A link sent on the check run alone showed the old
build, and the operator reported a "still broken" bug that was already fixed.

1. Pick a string unique to the new code: a class, copy string or constant from the diff that the
   old build cannot contain.
2. Load the served preview page in headless Chromium (one run at a time, hard timeout) and look for
   that string in the served chunks or CSS. Poll about a minute; the link goes out only once found.
3. A push with no diff in the built repo does not rebuild: merge main in. Never push an empty commit.
4. A design-system change merges to DS main first; the preview builds from it.
5. A version list (`/workers/scripts/<script>/versions`) shows whether an upload happened at all.
6. One `preview/*` push per repo is in flight at a time (`routing` rule 16). A push stops being in flight when
   the served build shows it, OR the build reports failed, OR 15 minutes pass unmoved: an unmoved preview is a
   failed build until shown otherwise (it can fail silently, and the Builds log may be unreadable to the
   session token). Then the next real commit rebuilds it: never an empty commit.
7. Before a push, ask Cloudflare instead of listing PRs by hand: `builds-check.mjs <repo>` (`routing`
   `references/MECHANICAL-SCRIPTS.md`) exits 1 while any Workers Build is running or queued for the repo.
8. The Workers Builds check run is a push-time placeholder (`cloud-preview-and-shared-ds-root-2026-10-12`): `started_at == completed_at`
   with only a Build ID in its summary is not "skipped" or "unconfirmable". Poll the summary until it lists `Version ID:`, then check
   the alias. Lazily loaded CSS (the panel kit) is referenced from the page's JS chunks, not the HTML.
9. Builds for one `preview/*` branch can finish out of order, an older sha overwriting a newer deploy, and a green build can keep
   the old bundle served for 3–5 minutes (`served-preview-is-the-proof-2026-10-17`). Probe the served page only once the build for
   **your sha is the latest successful build for that branch**, then for a string only your sha has (item 1).

## Live walk

Ruling `2026-10-18-live-walk-before-look-links` (DISC-190; operator: *"yes, hopefully this will mean less need for
recording as well"*). For interactive or motion work, once the probe above finds your sha, drive the deployed preview with
real gestures in headed Chromium and record it: a trackpad stream with momentum, reading pace, mouse notches, the pointer
over each region, start → end → back, close and reopen. Check each item of the round against the recording; fix what fails,
or name it in the link message. When the operator sends a recording, run the same walk beside the frame read and say which
of his issues it confirms, corrects or adds to. Method and drive scripts: vault
`references/portfolio/2026-10-18-notes-r16-live-walk/` (confirmed 3 of 4 recording issues, corrected 1, found 4 more).
