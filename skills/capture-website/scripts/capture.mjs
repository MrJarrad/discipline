#!/usr/bin/env node
// Design-reference capture, stage 1a: screenshots + computed tokens + geometry + scroll video.
// Usage: node capture.mjs <url> <out-dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { computeScrollSteps } from './lib/scroll-steps-lib.mjs';

const require = createRequire(join(process.cwd(), 'noop.js'));
const { chromium } = require('playwright');

const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) {
  console.error('Usage: node capture.mjs <url> <out-dir>');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

// Elements worth a token/geometry row: headings, text, links, buttons, media, sections.
const PICK = 'h1,h2,h3,h4,p,a,button,img,video,figure,section,header,footer,nav,li';

const browser = await chromium.launch();
const shotCounts = {};

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    recordVideo: vp.name === 'desktop' ? { dir: outDir, size: vp } : undefined,
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);

  // document.body.scrollHeight alone is unreliable: sites that pin body to
  // the viewport (overflow:hidden + position:absolute/fixed content wrapper —
  // common with smooth-scroll libs like Lenis/GSAP) report a body height of
  // 0 or the viewport height, undercounting real content by orders of
  // magnitude. documentElement.scrollHeight doesn't have that failure mode,
  // so take the max of both.
  const total = await page.evaluate(() =>
    Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
  );
  // Residual gap this warning doesn't cover: a page that scroll-jacks via JS
  // transform (translates an inner wrapper instead of moving the real
  // scroll position) can report a tall, correct total here yet
  // window.scrollTo() below never actually moves the content — every
  // screenshot below comes out identical. Height alone can't detect that;
  // catch it downstream by diffing screenshot bytes if it's ever suspected.
  if (total <= vp.height) {
    console.error(
      `WARNING: ${vp.name} measured height (${total}px) is <= one viewport (${vp.height}px) for ${url}. ` +
      `This usually means the page hasn't finished rendering, or uses a scroll pattern this script can't measure — verify manually.`
    );
  }
  const steps = computeScrollSteps(total, vp.height);
  let shotsTaken = 0;
  for (let i = 0; i < steps; i++) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), i * vp.height);
    await page.waitForTimeout(600); // let reveals settle
    try {
      await page.screenshot({
        path: join(outDir, `${vp.name}-${String(i).padStart(2, '0')}.png`),
      });
      shotsTaken++;
    } catch (err) {
      console.error(`WARNING: screenshot ${vp.name}-${String(i).padStart(2, '0')} failed for ${url}: ${err.message}`);
    }
  }
  shotCounts[vp.name] = shotsTaken;

  if (vp.name === 'desktop') {
    // Tokens + geometry from the desktop render.
    const data = await page.evaluate((sel) => {
      const seen = new Set();
      const tokens = [];
      const geometry = [];
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        const y = r.top + window.scrollY;
        geometry.push({ tag: el.tagName.toLowerCase(), x: Math.round(r.left), y: Math.round(y), w: Math.round(r.width), h: Math.round(r.height) });
        const s = getComputedStyle(el);
        const text = (el.textContent || '').trim().slice(0, 60);
        const key = [el.tagName, s.fontSize, s.fontWeight, s.letterSpacing, s.color, text.slice(0, 20)].join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        tokens.push({
          tag: el.tagName.toLowerCase(), text,
          font: s.fontFamily.split(',')[0].replace(/["']/g, ''),
          size: s.fontSize, weight: s.fontWeight,
          tracking: s.letterSpacing, leading: s.lineHeight,
          color: s.color, bg: s.backgroundColor, radius: s.borderRadius,
        });
      }
      return { tokens, geometry };
    }, PICK);
    writeFileSync(join(outDir, 'tokens.json'), JSON.stringify(data.tokens, null, 1));
    writeFileSync(join(outDir, 'geometry.json'), JSON.stringify(data.geometry, null, 1));

    // Smooth scroll-through for the motion record (captured by recordVideo).
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(400);
    await page.evaluate(async () => {
      const total = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - innerHeight;
      const step = 12;
      for (let y = 0; y <= total; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => requestAnimationFrame(r));
      }
    });
    await page.waitForTimeout(800);
  }

  const video = page.video?.();
  await ctx.close();
  if (video) {
    const p = await video.path();
    const { renameSync } = await import('node:fs');
    renameSync(p, join(outDir, 'scroll.webm'));
  }
}

await browser.close();

const zeroShotViewports = Object.entries(shotCounts).filter(([, n]) => n < 1).map(([name]) => name);
if (zeroShotViewports.length > 0) {
  console.error(`FAILED: zero screenshots captured for viewport(s): ${zeroShotViewports.join(', ')} — ${url}`);
  process.exit(1);
}

console.log(`Captured ${url} → ${outDir} (${Object.entries(shotCounts).map(([n, c]) => `${n}: ${c}`).join(', ')})`);
