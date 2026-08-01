---
name: webapp-testing
description: Author repeatable, asserting Playwright E2E tests that drive a live web app and fail loudly on regression — locators, web-first assertions, visual-regression snapshots, network mocking, Page Object Model. Use when you need a re-runnable test that PROVES a UI behaves (a login flow works, a component renders, a screenshot matches baseline), not a one-shot look. Not for exploratory inspection or evidence capture (that's agent-browser), and not for site fetch/scrape (agent-browser/firecrawl).
tags:
  - browser
  - playwright
  - e2e
  - testing
  - visual-regression
---

# Webapp Testing

Drive a live web app with Playwright to **author a repeatable test that asserts and fails loudly** — an executable claim about behavior that a person or CI can re-run tomorrow and get the same verdict. This is test *engineering*, not a look-and-tell.

This skill is the `quality` "verify before claiming" bar made re-runnable for a UI: instead of "I loaded it and it looked right," you leave behind a script that *proves* it and screams when a regression breaks it. It applies `test-first`'s behavior-through-the-interface discipline (the interface here is the rendered DOM) and `verify-finding`'s typed-evidence bar (the evidence here is a passing assertion or a matched snapshot) — it does not restate either.

## When to use — the assert-and-re-run test

- You need to **prove a flow works end-to-end** and keep proving it: login, a form submit, a multi-step wizard, a route transition.
- You need a **visual-regression guard**: a screenshot that must keep matching a committed baseline so a CSS or layout drift fails the build.
- You need to **assert rendered state at real viewports** — element present/visible, text content, count, ARIA role, mobile vs desktop layout.
- You need to test behavior **under controlled conditions** — a mocked slow/failing API, a specific server response, an empty vs populated state.
- You're verifying **the portfolio site (dev `:3210`, doer servers `:3211+`)** and the acceptance criterion is "it still does X," not "here's what it looked like once."

## When NOT to use — hand back

- **One-shot inspection / evidence capture** — "screenshot this deployed page," "reproduce this UI bug and read the console," "confirm this one change looks right." That is supervised verification, not a test suite → use **`agent-browser`**. It drives the browser; this skill adds assertions and structure *on top* of that driving. Do not author a throwaway test where a single screenshot answers the question.
- **Site fetch / scrape / reference capture** — pulling content, collecting competitor screenshots, extracting data → **`agent-browser`** or a dedicated scraper (firecrawl). Playwright underlies both, but that is a *capture* job, not an *assertion* job.
- **Non-UI logic tests** — unit/integration tests of a module's API with no browser → **`test-first`**.

Reconcile line: **`agent-browser` = drive + observe + capture evidence (exploratory, one state). `webapp-testing` = assert + structure + regression-guard (repeatable, many runs).** If the deliverable is a screenshot, it's agent-browser. If the deliverable is a re-runnable pass/fail, it's this.

## The discipline this skill adds

Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when authoring or reviewing a test.

A test that can't fail proves nothing. Every test here must be **red-capable** — you must have seen it fail for the right reason before you trust its green. The four failure modes below are how UI tests go insensitive (pass while the app is broken); the practices exist to close them.

### 1. Locate by role and accessible name, not by brittle structure

Prefer, in order: `getByRole` (with name), `getByLabel`, `getByText`, `getByTestId`. Avoid CSS/XPath chains (`.card > div:nth-child(2)`) — they couple the test to markup structure and break on refactors that didn't change behavior, exactly the `test-first` anti-pattern applied to the DOM. A `data-testid` is a deliberate, stable seam; a `nth-child` is an accident waiting to break.

### 2. Web-first assertions, never sleeps

Use auto-retrying assertions — `await expect(locator).toBeVisible()`, `.toHaveText()`, `.toHaveCount()` — which poll until the condition holds or times out. Never `waitForTimeout(3000)` then assert: a fixed sleep is flaky (too short → false fail) and slow (too long → wasted seconds), and it hides the real wait condition. Assert on the *signal you actually care about* (an element, a URL, a response), not on elapsed time.

### 3. Visual regression: baseline is a decision, drift is a failure

`await expect(page).toHaveScreenshot('name.png')` compares against a committed baseline and fails on pixel drift. Rules that keep this honest:

- **A new/updated baseline is a reviewed decision**, not an auto-accept. Regenerate (`--update-snapshots`) only when you have *looked at* the new image and confirmed the change is intended. Blindly updating baselines turns the guard off.
- **Mask the non-deterministic** — timestamps, animations, random data, avatars. Freeze animations (`animations: 'disabled'`), pin the clock, mask dynamic regions, or the test flakes and gets ignored.
- Pin **viewport and device-pixel-ratio**; a snapshot at an unstated size proves nothing about the size that matters.

### 4. Network mocking makes the condition, not the convenience

Use `page.route()` to force the state you're testing — the error path, the empty state, the slow-network spinner — deterministically, without depending on a live backend. Mock at the *network boundary* only; don't mock the app's own internals. A test of "shows a friendly error when the API 500s" must actually intercept and return 500, or it isn't testing that.

### Structure once it's more than one test — Page Object Model

For a single assertion, inline it. Once a flow is exercised by several tests, extract a **Page Object**: a class that owns the locators and the actions for a page/component, so tests read as intent (`await loginPage.signIn(user)`) and a UI change updates *one* file, not twenty. The POM is the public-interface seam from `test-first`, applied to a screen. Don't reach for it before the second test needs it.

## The loop — red before green, every time

1. **Detect the target.** Confirm the dev server is up and the port (`:3210` portfolio dev, `:3211+` doer servers, or the URL given). Don't test against a server you didn't confirm is running.
2. **Write the assertion first, watch it fail for the right reason.** Point it at the behavior; run it; confirm the failure message names the real gap (element missing, text wrong, snapshot mismatch) — not a typo, a bad selector, or a down server. A test never seen red is not yet evidence.
3. **Make it green and stable.** Run it 2–3× — a test that passes once and fails once is flaky and worthless; fix the wait condition or the mask until it's deterministic.
4. **Leave it re-runnable.** The script, its baselines, and how to run it are the deliverable. State the exact command and what a pass proves.

## What "done" delivers

- The **test file(s)** and any **committed baseline snapshots**, plus the one-line run command.
- For each test: **what it asserts** and **the red you saw** — "failed with `expected visible, got hidden` before the fix; green after." A green with no observed red is unverified.
- Viewport(s) actually tested — never claim cross-viewport coverage you didn't run.
- Any masks/mocks and *why* (what non-determinism they neutralize).

## Anti-patterns

- A "test" that navigates and screenshots but never `expect()`s anything — that's `agent-browser` wearing a test's clothes; it can't fail, so it proves nothing.
- `waitForTimeout` as a load wait; `nth-child`/deep-CSS locators; catching-and-ignoring assertion errors.
- Auto-updating a visual baseline to make a red go green without looking at the diff — that deletes the guard.
- Claiming "works on mobile" from a desktop-viewport run; claiming "flow passes" from a single lucky run you never re-ran.
- Testing against a mocked-out app internal instead of the real rendered behavior — mock the network boundary, not your own components.

## Next.js dev-server ops

One dev server per repo, ever. Check `lsof -i :3210` before starting — if one exists, reuse it; don't
spawn a second. Never run a production build in a working tree with a live dev server (`next build`
while dev runs): shared `.next` corrupts (MODULE_NOT_FOUND vendor-chunks, ENOENT page.js, 500-hang routes). Fix: stop server, `rm -rf .next`, restart. Same corruption happens on heavy HMR batches — same fix. Verify test changes with `typecheck` + `curl` against the EXISTING server, never new processes.
