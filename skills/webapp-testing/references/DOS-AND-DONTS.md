# Webapp Testing — Do's and Don'ts

Read before authoring or reviewing a Playwright webapp test.

## The one question first

**Is the deliverable a re-runnable pass/fail, or a one-time look?**
- Pass/fail → this skill. Author an asserting test.
- A look, a screenshot, a bug repro → hand to `agent-browser`. Don't build a suite.

## Do

- **Assert, don't just screenshot.** Every test ends in an `expect()` on the behavior. A navigate+screenshot with no assertion cannot fail — it is not a test.
- **See it red first.** Run the test against the *unfixed* app (or a deliberately wrong expectation) and confirm it fails for the reason you intend. A green never preceded by a real red is unverified.
- **Wait on the signal, not the clock.** `await expect(locator).toBeVisible()` polls; `waitForTimeout(2000)` guesses. Always the former.
- **Locate by role/name/testid.** `getByRole('button', { name: 'Sign in' })`, `getByTestId('cart-total')`. Stable across refactors.
- **Pin the viewport** you claim to test, and re-run 2–3× to prove it's not flaky before you leave it.
- **Mock at the network boundary** with `page.route()` to force error/empty/slow states deterministically.
- **Treat a baseline update as a review.** Look at the new snapshot, confirm the change is intended, *then* regenerate. Mask timestamps/animations/random data.
- **Extract a Page Object** once a second test touches the same flow — one file owns the locators.

## Don't

- **Don't author a test suite for a one-shot question** a single screenshot answers → `agent-browser`.
- **Don't use it to fetch/scrape** content or collect reference screenshots → `agent-browser`/firecrawl.
- **Don't `waitForTimeout` as a load wait**, or chain `nth-child`/deep-CSS locators, or catch-and-swallow assertion errors.
- **Don't `--update-snapshots` to force green** without looking at the diff — that silently deletes the regression guard.
- **Don't claim cross-viewport or cross-browser coverage** you didn't actually run.
- **Don't mock your own components** — mock only the external network boundary.
- **Don't leave a flaky test green.** One pass and one fail on the same code means the wait/mask is wrong; fix it or the test gets muted and stops guarding.
