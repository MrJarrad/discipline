#!/usr/bin/env node
// Design-reference capture, stage 1c: real frame-by-frame motion, not adjectives.
// Parsing transition/animation CSS properties only tells you what a page *declares*;
// this script samples getAnimations() via CDP while actually loading, hovering,
// pressing, and scrolling the page, so measured duration/easing/trigger/stagger
// land in motion-samples.json as data capture-figma has no way to see (Figma has
// no runtime). Pair with skills/capture-website/scripts/lib/style-roles-lib.mjs's
// parseDeclaredMotion (declared) + mergeMotionVocabulary (declared+observed merge).
// Usage: node capture-motion.mjs <url> <out-dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(join(process.cwd(), 'noop.js'));
const { chromium } = require('playwright');

const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) {
  console.error('Usage: node capture-motion.mjs <url> <out-dir>');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

// Runs inside the page: samples document.getAnimations() for `windowMs`,
// polling every `pollMs`, and returns one row per animation observed with
// its measured (not declared) timing.
const SAMPLE_FN = `(async (windowMs, pollMs, trigger) => {
  const seen = new Map();
  const start = performance.now();
  while (performance.now() - start < windowMs) {
    for (const anim of document.getAnimations()) {
      const timing = anim.effect?.getComputedTiming?.() ?? anim.effect?.getTiming?.();
      if (!timing) continue;
      const target = anim.effect?.target;
      const selector = target ? (target.className ? '.' + String(target.className).trim().split(/\\s+/).join('.') : target.tagName?.toLowerCase()) : 'unknown';
      const propertyGuess = anim.transitionProperty || (anim.animationName ? 'animation' : 'transform');
      const key = selector + '|' + propertyGuess;
      if (seen.has(key)) continue;
      seen.set(key, {
        property: propertyGuess,
        trigger,
        duration: (timing.duration || 0) + 'ms',
        curve: typeof timing.easing === 'string' ? timing.easing : null,
        stagger: typeof timing.delay === 'number' && timing.delay > 0 ? timing.delay + 'ms' : null,
        target: selector,
      });
    }
    await new Promise((r) => requestAnimationFrame(r));
  }
  return [...seen.values()];
})`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const samples = [];

// 1. Load/entrance choreography — sample immediately after navigation settles.
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
samples.push(...await page.evaluate(`${SAMPLE_FN}(1500, 16, 'load')`));

// 2. Hover feedback — probe a bounded set of interactive elements.
const hoverTargets = await page.$$('a, button, [role="button"]');
for (const el of hoverTargets.slice(0, 12)) {
  try {
    await el.hover({ timeout: 2000 });
    samples.push(...await page.evaluate(`${SAMPLE_FN}(400, 16, 'hover')`));
  } catch { /* detached/offscreen element, skip */ }
}

// 3. Press feedback — a bounded set of buttons/links, mousedown without releasing far.
const pressTargets = await page.$$('button, [role="button"]');
for (const el of pressTargets.slice(0, 6)) {
  try {
    const box = await el.boundingBox();
    if (!box) continue;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    samples.push(...await page.evaluate(`${SAMPLE_FN}(300, 16, 'press')`));
    await page.mouse.up();
  } catch { /* skip */ }
}

// 4. Scroll-linked effects — smooth scroll-through while sampling continuously.
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
const scrollSamplePromise = page.evaluate(`${SAMPLE_FN}(2500, 16, 'scroll')`);
await page.evaluate(async () => {
  const total = document.body.scrollHeight - innerHeight;
  const step = 12;
  for (let y = 0; y <= total; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => requestAnimationFrame(r));
  }
});
samples.push(...await scrollSamplePromise);

await browser.close();

writeFileSync(join(outDir, 'motion-samples.json'), JSON.stringify(samples, null, 1));
console.log(`Motion capture ${url} → ${outDir} (${samples.length} samples)`);
