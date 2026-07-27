import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clusterTypeRoles, deriveSpacingScale, clusterPalette, deriveRadii, detectStack, parseDeclaredMotion, mergeMotionVocabulary, buildReferenceTokens } from './style-roles-lib.mjs';

test('clusterTypeRoles groups tokens sharing font/size/weight/tracking/leading into one role', () => {
  const tokens = [
    { tag: 'h1', text: 'Hero', font: 'tnd', size: '48px', weight: '100', tracking: '-1.8px', leading: '48px', color: 'rgb(0,0,0)', bg: 'rgba(0,0,0,0)', radius: '0px' },
    { tag: 'h1', text: 'Other hero', font: 'tnd', size: '48px', weight: '100', tracking: '-1.8px', leading: '48px', color: 'rgb(0,0,0)', bg: 'rgba(0,0,0,0)', radius: '0px' },
    { tag: 'p', text: 'Body copy', font: 'tnd', size: '16px', weight: '400', tracking: 'normal', leading: '24px', color: 'rgb(0,0,0)', bg: 'rgba(0,0,0,0)', radius: '0px' },
  ];

  const roles = clusterTypeRoles(tokens, 'home/tokens.json');

  assert.equal(roles.length, 2);
  const hero = roles.find((r) => r.size === '48px');
  assert.equal(hero.usageCount, 2);
  assert.equal(hero.font, 'tnd');
  assert.equal(hero.weight, '100');
  assert.equal(hero.confidence, 'observed');
  assert.deepEqual(hero.evidence, [
    { file: 'home/tokens.json', index: 0 },
    { file: 'home/tokens.json', index: 1 },
  ]);
});

test('clusterTypeRoles carries declaredVar through when present on the source token, null otherwise', () => {
  const tokens = [
    { tag: 'h1', text: 'Hero', font: 'tnd', size: '48px', weight: '100', tracking: '-1.8px', leading: '48px', color: 'rgb(0,0,0)', bg: 'rgba(0,0,0,0)', radius: '0px', declaredVar: '--font-size-huge' },
    { tag: 'p', text: 'Body', font: 'tnd', size: '16px', weight: '400', tracking: 'normal', leading: '24px', color: 'rgb(0,0,0)', bg: 'rgba(0,0,0,0)', radius: '0px' },
  ];

  const roles = clusterTypeRoles(tokens, 'home/tokens.json');

  assert.equal(roles.find((r) => r.size === '48px').declaredVar, '--font-size-huge');
  assert.equal(roles.find((r) => r.size === '16px').declaredVar, null);
});

test('deriveSpacingScale finds the recurring gap module from geometry rects', () => {
  const geometry = [
    { tag: 'div', x: 0, y: 0, w: 10, h: 10 },
    { tag: 'div', x: 24, y: 0, w: 10, h: 10 },
    { tag: 'div', x: 48, y: 0, w: 10, h: 10 },
    { tag: 'div', x: 0, y: 48, w: 10, h: 10 },
    { tag: 'div', x: 0, y: 96, w: 10, h: 10 },
  ];

  const scale = deriveSpacingScale(geometry, 'home/geometry.json');

  assert.equal(scale.module, 24);
  assert.deepEqual(scale.steps, [24, 48]);
  assert.equal(scale.confidence, 'observed');
  assert.ok(scale.evidence.length > 0);
  assert.equal(scale.evidence[0].file, 'home/geometry.json');
});

test('deriveSpacingScale picks the most-frequent recurring delta as the module, not the GCD of every one-off gap', () => {
  // Realistic noisy geometry: a real 900px section rhythm repeated 3x, plus
  // several one-off small gaps (13/17/21/849) from unrelated fine-grained
  // elements. A GCD-of-everything approach collapses to 1; the module that
  // actually describes this page's rhythm is 900.
  const geometry = [
    { tag: 'section', x: 0, y: 0, w: 10, h: 10 },
    { tag: 'section', x: 0, y: 900, w: 10, h: 10 },
    { tag: 'section', x: 0, y: 1800, w: 10, h: 10 },
    { tag: 'section', x: 0, y: 2700, w: 10, h: 10 },
    { tag: 'section', x: 0, y: 3600, w: 10, h: 10 },
    { tag: 'span', x: 0, y: 13, w: 10, h: 10 },
    { tag: 'span', x: 0, y: 30, w: 10, h: 10 },
    { tag: 'span', x: 0, y: 51, w: 10, h: 10 },
  ];

  const scale = deriveSpacingScale(geometry, 'home/geometry.json');

  assert.equal(scale.module, 900);
  assert.deepEqual(scale.steps, [900]);
});

test('clusterPalette counts color+bg usage and guesses text vs surface role', () => {
  const tokens = [
    { tag: 'p', color: 'rgb(33, 37, 41)', bg: 'rgba(0, 0, 0, 0)' },
    { tag: 'p', color: 'rgb(33, 37, 41)', bg: 'rgba(0, 0, 0, 0)' },
    { tag: 'section', color: 'rgb(33, 37, 41)', bg: 'rgb(255, 255, 255)' },
  ];

  const palette = clusterPalette(tokens, 'home/tokens.json');

  const text = palette.find((p) => p.value === 'rgb(33, 37, 41)');
  assert.equal(text.usageCount, 3);
  assert.equal(text.roleGuess, 'text');

  const surface = palette.find((p) => p.value === 'rgb(255, 255, 255)');
  assert.equal(surface.usageCount, 1);
  assert.equal(surface.roleGuess, 'surface');

  const transparent = palette.find((p) => p.value === 'rgba(0, 0, 0, 0)');
  assert.equal(transparent, undefined);
});

test('deriveRadii clusters non-zero border-radius values with usage counts, drops 0px', () => {
  const tokens = [
    { radius: '0px' },
    { radius: '8px' },
    { radius: '8px' },
    { radius: '999px' },
  ];

  const radii = deriveRadii(tokens, 'home/tokens.json');

  assert.equal(radii.length, 2);
  const rounded = radii.find((r) => r.value === '8px');
  assert.equal(rounded.usageCount, 2);
  const pill = radii.find((r) => r.value === '999px');
  assert.equal(pill.usageCount, 1);
  assert.equal(radii.find((r) => r.value === '0px'), undefined);
});

test('detectStack recognizes a WordPress/jQuery/Adobe-Edge-Animate stack from script bundle URLs', () => {
  const scripts = [
    { src: 'https://example.com/wp-includes/js/jquery/jquery.min.js', type: 'text/javascript', inlineBytes: 0 },
    { src: 'https://example.com/wp-content/themes/swap/assets/scripts/jquery.nicescroll.js', type: 'text/javascript', inlineBytes: 0 },
    { src: 'https://example.com/wp-content/themes/swap/assets/scripts/js/edge.5.0.1.min.js', type: 'text/javascript', inlineBytes: 0 },
  ];

  const stack = detectStack(scripts, 'home/scripts.json');

  assert.equal(stack.framework, 'wordpress');
  assert.equal(stack.metaFramework, null);
  assert.ok(stack.animationLibraries.includes('adobe-edge-animate'));
  assert.equal(stack.scrollTech, 'smooth-scroll-lib');
  assert.equal(stack.scrollJack, false);
  assert.equal(stack.viewTransitions, false);
  assert.ok(stack.evidence.length > 0);
});

test('detectStack recognizes Next.js + Framer Motion + Lenis bundle markers', () => {
  const scripts = [
    { src: 'https://example.com/_next/static/chunks/framework.js', type: 'text/javascript', inlineBytes: 0 },
    { src: 'https://example.com/_next/static/chunks/framer-motion.js', type: 'text/javascript', inlineBytes: 0 },
    { src: 'https://example.com/_next/static/chunks/lenis.min.js', type: 'text/javascript', inlineBytes: 0 },
  ];

  const stack = detectStack(scripts, 'home/scripts.json');

  assert.equal(stack.framework, 'react');
  assert.equal(stack.metaFramework, 'next');
  assert.ok(stack.animationLibraries.includes('framer-motion'));
  assert.ok(stack.animationLibraries.includes('lenis'));
  assert.equal(stack.scrollTech, 'smooth-scroll-lib');
});

test('parseDeclaredMotion extracts transition (hover) and animation (load) entries with duration/curve/trigger', () => {
  const css = `
    .nav-link:hover { transition: color 0.15s ease-in-out; }
    .hero-title { animation: fadeIn 0.6s cubic-bezier(0.25, 1, 0.5, 1); }
  `;

  const entries = parseDeclaredMotion(css, 'home/styles/00-theme.css');

  const hover = entries.find((e) => e.trigger === 'hover');
  assert.equal(hover.property, 'color');
  assert.equal(hover.duration, '0.15s');
  assert.equal(hover.curve, 'ease-in-out');
  assert.equal(hover.declared, true);
  assert.equal(hover.observed, false);
  assert.equal(hover.confidence, 'inferred');
  assert.equal(hover.evidence[0].file, 'home/styles/00-theme.css');

  const load = entries.find((e) => e.name.includes('fadeIn'));
  assert.equal(load.property, 'animation');
  assert.equal(load.duration, '0.6s');
  assert.equal(load.curve, 'cubic-bezier(0.25, 1, 0.5, 1)');
  assert.equal(load.trigger, 'load');
});

test('parseDeclaredMotion splits multi-property transition shorthand on top-level commas only, not the commas inside cubic-bezier()', () => {
  const css = `.bna-slider { transition: transform 0.5s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s ease; }`;

  const entries = parseDeclaredMotion(css, 'home/styles/00-theme.css');

  const transform = entries.find((e) => e.property === 'transform');
  assert.equal(transform.duration, '0.5s');
  assert.equal(transform.curve, 'cubic-bezier(0.25, 1, 0.5, 1)');

  const opacity = entries.find((e) => e.property === 'opacity');
  assert.equal(opacity.duration, '0.3s');
  assert.equal(opacity.curve, 'ease');

  assert.equal(entries.find((e) => e.property === '1'), undefined);
  assert.equal(entries.find((e) => e.property.includes('cubic-bezier')), undefined);
});

test('parseDeclaredMotion falls back to "all" when a transition shorthand omits the property name (curve-only value)', () => {
  const css = `.bna-slider { transition: cubic-bezier(0.9, 1, 0.22, 1); transform: translateX(0px); }`;

  const entries = parseDeclaredMotion(css, 'home/styles/00-theme.css');

  assert.equal(entries.length, 1);
  assert.equal(entries[0].property, 'all');
  assert.equal(entries[0].curve, 'cubic-bezier(0.9, 1, 0.22, 1)');
});

test('mergeMotionVocabulary overwrites a declared entry with measured duration/curve when a runtime sample matches it, and appends unmatched samples', () => {
  const declared = [
    { name: '.nav-link:hover transition:color', property: 'color', duration: '0.15s', curve: 'ease-in-out', trigger: 'hover', stagger: null, declared: true, observed: false, evidence: [{ file: 'home/styles/00.css' }], confidence: 'inferred' },
  ];
  const samples = [
    { property: 'color', trigger: 'hover', duration: '162ms', curve: 'cubic-bezier(0.25, 1, 0.5, 1)', stagger: null, sourceFile: 'home/motion-samples.json', index: 0 },
    { property: 'transform', trigger: 'scroll', duration: '400ms', curve: 'linear', stagger: '0.08s', sourceFile: 'home/motion-samples.json', index: 1 },
  ];

  const merged = mergeMotionVocabulary(declared, samples);

  const hover = merged.find((e) => e.trigger === 'hover');
  assert.equal(hover.duration, '162ms');
  assert.equal(hover.curve, 'cubic-bezier(0.25, 1, 0.5, 1)');
  assert.equal(hover.observed, true);
  assert.equal(hover.declared, true);
  assert.equal(hover.confidence, 'observed');

  const scrollEntry = merged.find((e) => e.trigger === 'scroll');
  assert.equal(scrollEntry.property, 'transform');
  assert.equal(scrollEntry.observed, true);
  assert.equal(scrollEntry.declared, false);
  assert.equal(scrollEntry.stagger, '0.08s');
});

test('mergeMotionVocabulary disambiguates by target selector when two declared entries share property+trigger', () => {
  const declared = [
    { name: '.progress-bar-animated animation:infinite', property: 'animation', duration: '2s', curve: 'linear', trigger: 'load', stagger: null, declared: true, observed: false, evidence: [{ file: 'styles/bootstrap.css' }], confidence: 'inferred' },
    { name: '.fixed.appear animation:pulse', property: 'animation', duration: '3s', curve: 'ease', trigger: 'load', stagger: null, declared: true, observed: false, evidence: [{ file: 'styles/theme.css' }], confidence: 'inferred' },
  ];
  const samples = [
    { property: 'animation', trigger: 'load', duration: '1000ms', curve: 'linear', stagger: null, target: '.fixed.appear', sourceFile: 'home/motion-samples.json', index: 0 },
  ];

  const merged = mergeMotionVocabulary(declared, samples);

  const fixedAppear = merged.find((e) => e.name.includes('.fixed.appear'));
  assert.equal(fixedAppear.observed, true);
  assert.equal(fixedAppear.duration, '1000ms');

  const progressBar = merged.find((e) => e.name.includes('.progress-bar-animated'));
  assert.equal(progressBar.observed, false);
  assert.equal(progressBar.duration, '2s');
});

test('buildReferenceTokens assembles the full reference-tokens schema object from raw capture artifacts', () => {
  const tokens = [
    { tag: 'h1', text: 'Hero', font: 'tnd', size: '48px', weight: '100', tracking: '-1.8px', leading: '48px', color: 'rgb(0,0,0)', bg: 'rgba(0,0,0,0)', radius: '0px' },
  ];
  const geometry = [
    { tag: 'div', x: 0, y: 0, w: 10, h: 10 },
    { tag: 'div', x: 24, y: 0, w: 10, h: 10 },
  ];
  const scripts = [
    { src: 'https://example.com/wp-includes/js/jquery/jquery.min.js', type: 'text/javascript', inlineBytes: 0 },
  ];
  const cssText = '.nav-link:hover { transition: color 0.15s ease-in-out; }';

  const result = buildReferenceTokens(
    { name: 'toby-ng', capturedAt: '2026-07-27', source: 'https://www.toby-ng.com/', classification: 'MARKETING' },
    { tokens, geometry, scripts, cssText, motionSamples: [] },
    { tokensFile: 'home/tokens.json', geometryFile: 'home/geometry.json', scriptsFile: 'home/scripts.json', cssFile: 'home/styles/00.css' }
  );

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.meta.name, 'toby-ng');
  assert.equal(result.typeRoles.length, 1);
  assert.equal(result.spacingScale.module, 24);
  assert.equal(result.stack.framework, 'wordpress');
  assert.equal(result.motionVocabulary.length, 1);
  assert.equal(result.motionVocabulary[0].trigger, 'hover');
  assert.deepEqual(result.radii, []);
});
