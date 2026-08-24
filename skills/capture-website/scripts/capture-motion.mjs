#!/usr/bin/env node
// Design-reference capture, stage 1c: real frame-by-frame motion, not adjectives.
// Samples CSS/WAAPI via getAnimations(), GSAP tweens when gsap is on the page,
// and records canvas/WebGL environment so Stage 2 knows when tape is required.
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

const SAMPLE_CSS_FN = `(async (windowMs, pollMs, trigger) => {
  const seen = new Map();
  const start = performance.now();
  while (performance.now() - start < windowMs) {
    for (const anim of document.getAnimations()) {
      const timing = anim.effect?.getComputedTiming?.() ?? anim.effect?.getTiming?.();
      if (!timing) continue;
      const target = anim.effect?.target;
      const selector = target
        ? (target.className
          ? '.' + String(target.className).trim().split(/\\s+/).join('.')
          : target.tagName?.toLowerCase())
        : 'unknown';
      const propertyGuess = anim.transitionProperty || (anim.animationName ? 'animation' : 'transform');
      const key = 'css|' + selector + '|' + propertyGuess;
      if (seen.has(key)) continue;
      seen.set(key, {
        construction: 'css',
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

const SAMPLE_GSAP_FN = `(trigger) => {
  const gsap = globalThis.gsap;
  if (!gsap || typeof gsap.globalTimeline?.getChildren !== 'function') return [];

  const seen = new Map();
  const rows = [];

  const describeTarget = (t) => {
    if (!t) return 'unknown';
    if (t.className) return '.' + String(t.className).trim().split(/\\s+/).join('.');
    return t.tagName?.toLowerCase() ?? 'unknown';
  };

  const pushTween = (tween) => {
    if (!tween || typeof tween.duration !== 'function') return;
    const targets = typeof tween.targets === 'function' ? tween.targets() : [];
    const target = targets[0];
    const selector = describeTarget(target);
    const vars = tween.vars ?? {};
    const props = ['x', 'y', 'opacity', 'scale', 'rotation', 'autoAlpha', 'yPercent'];
    const property = props.find((p) => vars[p] !== undefined) ?? 'transform';
    const key = 'gsap|' + selector + '|' + property + '|' + trigger;
    if (seen.has(key)) return;
    seen.set(key, true);

    const durationMs = Math.round((tween.duration() || 0) * 1000);
    const delayMs = Math.round((tween.delay() || 0) * 1000);
    const ease = vars.ease;
    let curve = null;
    if (typeof ease === 'string') curve = ease;
    else if (ease && typeof ease === 'object' && ease.name) curve = ease.name;

    rows.push({
      construction: 'gsap',
      property,
      trigger,
      duration: durationMs + 'ms',
      curve,
      stagger: delayMs > 0 ? delayMs + 'ms' : null,
      target: selector,
    });
  };

  try {
    const children = gsap.globalTimeline.getChildren(true, true, false) ?? [];
    for (const child of children) pushTween(child);
  } catch { /* gsap API variant — skip */ }

  return rows;
})`;

const DETECT_ENV_FN = `() => {
  const canvas = document.querySelector('canvas');
  const engineAttr = canvas?.getAttribute('data-engine') ?? null;
  const hasWebGLCanvas = Boolean(canvas);
  const gsapPresent = typeof globalThis.gsap !== 'undefined';
  const threeJs =
    engineAttr?.toLowerCase().includes('three') ||
    typeof globalThis.THREE !== 'undefined' ||
    /three\\.js/i.test(engineAttr ?? '');

  const canvasDriven = hasWebGLCanvas && (threeJs || engineAttr);
  const tapeRequired = canvasDriven;

  return {
    canvasPresent: hasWebGLCanvas,
    webglEngine: engineAttr,
    threeJsDetected: threeJs,
    gsapPresent,
    canvasDriven,
    tapeRequired,
    motionLawCompleteFromCssOnly: !tapeRequired,
    motionConstruction: canvasDriven ? 'canvas-js' : gsapPresent ? 'js' : 'css',
  };
}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const samples = [];

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

const environment = await page.evaluate(DETECT_ENV_FN);

samples.push(...await page.evaluate(`${SAMPLE_CSS_FN}(1500, 16, 'load')`));
samples.push(...await page.evaluate(`${SAMPLE_GSAP_FN}('load')`));

const hoverTargets = await page.$$('a, button, [role="button"]');
for (const el of hoverTargets.slice(0, 12)) {
  try {
    await el.hover({ timeout: 2000 });
    samples.push(...await page.evaluate(`${SAMPLE_CSS_FN}(400, 16, 'hover')`));
    samples.push(...await page.evaluate(`${SAMPLE_GSAP_FN}('hover')`));
  } catch { /* detached/offscreen element, skip */ }
}

const pressTargets = await page.$$('button, [role="button"]');
for (const el of pressTargets.slice(0, 6)) {
  try {
    const box = await el.boundingBox();
    if (!box) continue;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    samples.push(...await page.evaluate(`${SAMPLE_CSS_FN}(300, 16, 'press')`));
    samples.push(...await page.evaluate(`${SAMPLE_GSAP_FN}('press')`));
    await page.mouse.up();
  } catch { /* skip */ }
}

await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
const scrollSamplePromise = page.evaluate(`${SAMPLE_CSS_FN}(2500, 16, 'scroll')`);
const scrollGsapPromise = page.evaluate(`${SAMPLE_GSAP_FN}('scroll')`);
await page.evaluate(async () => {
  const total = document.body.scrollHeight - innerHeight;
  const step = 12;
  for (let y = 0; y <= total; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => requestAnimationFrame(r));
  }
});
samples.push(...await scrollSamplePromise);
samples.push(...await scrollGsapPromise);

await browser.close();

// Dedupe by construction + target + property + trigger
const deduped = [];
const keys = new Set();
for (const row of samples) {
  const key = [row.construction, row.target, row.property, row.trigger].join('|');
  if (keys.has(key)) continue;
  keys.add(key);
  deduped.push(row);
}

writeFileSync(join(outDir, 'motion-samples.json'), JSON.stringify(deduped, null, 1));
writeFileSync(join(outDir, 'motion-environment.json'), JSON.stringify(environment, null, 2));
console.log(
  `Motion capture ${url} → ${outDir} (${deduped.length} samples, construction=${environment.motionConstruction}, tapeRequired=${environment.tapeRequired})`
);
