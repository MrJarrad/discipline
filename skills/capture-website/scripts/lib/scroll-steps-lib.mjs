// Pure scroll-step arithmetic, isolated from Playwright so it's unit-testable
// without a browser. capture.mjs's original bug: ceil(0 / height) === 0 steps
// when the measured page height came back 0 (or <= 0), which produced zero
// screenshots for a viewport with no error or warning — a silent failure.
// computeScrollSteps guarantees at least one screenshot is always taken.
export function computeScrollSteps(totalHeight, viewportHeight, maxSteps = 20) {
  const steps = Math.ceil(totalHeight / viewportHeight);
  return Math.min(Math.max(steps, 1), maxSteps);
}
