#!/usr/bin/env node
// Design-reference capture, stage 1b: rendered code + extracted design system.
// Emits page.html, styles/, scripts.json, design-system.json.
// Usage: node capture-code.mjs <url> <out-dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(join(process.cwd(), 'noop.js'));
const { chromium } = require('playwright');

const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) {
  console.error('Usage: node capture-code.mjs <url> <out-dir>');
  process.exit(1);
}
mkdirSync(join(outDir, 'styles'), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1500);

// 1. Full rendered HTML.
writeFileSync(join(outDir, 'page.html'), await page.content());

// 2. Every stylesheet (external fetched, inline dumped) + script inventory.
const sheets = await page.evaluate(() =>
  [...document.styleSheets].map((s, i) => {
    let css = null;
    try { css = [...s.cssRules].map((r) => r.cssText).join('\n'); } catch { /* cross-origin */ }
    return { i, href: s.href, css };
  })
);
for (const s of sheets) {
  let css = s.css;
  if (!css && s.href) {
    try { css = await (await page.request.get(s.href)).text(); } catch { css = `/* unfetchable: ${s.href} */`; }
  }
  const name = s.href ? s.href.split('/').pop().split('?')[0].slice(0, 60) || `sheet-${s.i}.css` : `inline-${s.i}.css`;
  writeFileSync(join(outDir, 'styles', `${String(s.i).padStart(2, '0')}-${name}`), css || '');
}

const scripts = await page.evaluate(() =>
  [...document.scripts].map((s) => ({ src: s.src || null, type: s.type || 'text/javascript', inlineBytes: s.src ? 0 : s.text.length }))
);
writeFileSync(join(outDir, 'scripts.json'), JSON.stringify(scripts, null, 1));

// 3. design-system.json: custom props, breakpoints, keyframes, easings, font faces.
const ds = await page.evaluate(() => {
  const customProperties = {};
  const breakpoints = new Set();
  const keyframes = {};
  const easings = new Set();
  const fontFaces = [];
  const walk = (rules) => {
    for (const r of rules) {
      try {
        if (r.type === CSSRule.STYLE_RULE) {
          for (const p of r.style) {
            if (p.startsWith('--')) customProperties[p] = r.style.getPropertyValue(p).trim();
            if (p.includes('transition') || p.includes('animation')) {
              const v = r.style.getPropertyValue(p);
              const m = v.match(/cubic-bezier\([^)]+\)|ease[-a-z]*|linear|steps\([^)]+\)/g);
              if (m) m.forEach((e) => easings.add(e));
            }
          }
        } else if (r.type === CSSRule.MEDIA_RULE) {
          const m = r.media.mediaText.match(/\d+px/g);
          if (m) m.forEach((b) => breakpoints.add(b));
          walk(r.cssRules);
        } else if (r.type === CSSRule.KEYFRAMES_RULE) {
          keyframes[r.name] = [...r.cssRules].map((k) => `${k.keyText} { ${k.style.cssText} }`);
        } else if (r.type === CSSRule.FONT_FACE_RULE) {
          fontFaces.push(r.style.cssText);
        }
      } catch { /* skip */ }
    }
  };
  for (const s of document.styleSheets) { try { walk(s.cssRules); } catch { /* cross-origin */ } }
  return {
    customProperties,
    breakpoints: [...breakpoints].sort((a, b) => parseInt(a) - parseInt(b)),
    keyframes,
    easings: [...easings],
    fontFaces,
  };
});
writeFileSync(join(outDir, 'design-system.json'), JSON.stringify(ds, null, 1));

await browser.close();
console.log(`Code capture ${url} → ${outDir}`);
