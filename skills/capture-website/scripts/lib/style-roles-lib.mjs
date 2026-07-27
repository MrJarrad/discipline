// Pure functions: cluster Stage-1 capture artifacts (tokens.json, geometry.json,
// design-system.json, motion.json) into the Stage-2 reference-tokens schema
// (schemas/reference-tokens.schema.json). No filesystem or browser access here —
// keeps this importable and unit-testable without playwright.

export function clusterTypeRoles(tokens, sourceFile) {
  const groups = new Map();
  tokens.forEach((t, index) => {
    const key = [t.font, t.size, t.weight, t.tracking, t.leading].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        role: `${t.tag}-${t.size}`,
        font: t.font,
        size: t.size,
        weight: t.weight,
        tracking: t.tracking,
        leading: t.leading,
        declaredVar: t.declaredVar ?? null,
        usageCount: 0,
        evidence: [],
        confidence: 'observed',
      });
    }
    const g = groups.get(key);
    g.usageCount += 1;
    g.evidence.push({ file: sourceFile, index });
  });
  return [...groups.values()];
}

// Recurring spacing module: the most-frequent gap between distinct rect edges
// (x and y coordinates pooled together), not the GCD of every gap. Real pages
// carry one-off fine-grained noise (borders, subpixel rounding) alongside a
// real rhythm; GCD-of-everything collapses to 1 the instant one odd gap shows
// up, while the mode survives it. `steps` are the recurring deltas that are
// exact multiples of the module — the noise gaps that aren't get dropped.
export function deriveSpacingScale(geometry, sourceFile) {
  const coords = [...new Set(geometry.flatMap((r) => [r.x, r.y]))].sort((a, b) => a - b);
  const deltas = [];
  for (let i = 1; i < coords.length; i++) deltas.push(coords[i] - coords[i - 1]);

  const freq = new Map();
  for (const d of deltas) freq.set(d, (freq.get(d) ?? 0) + 1);

  let module = null;
  let bestCount = 1;
  for (const [d, count] of freq) {
    if (count > bestCount || (count === bestCount && (module === null || d < module))) {
      module = d;
      bestCount = count;
    }
  }

  const steps = module
    ? [...new Set(deltas.filter((d) => d % module === 0))].sort((a, b) => a - b)
    : [];

  return {
    module,
    steps,
    evidence: geometry.map((_, index) => ({ file: sourceFile, index })),
    confidence: module ? 'observed' : 'inferred',
  };
}

const TRANSPARENT = new Set(['rgba(0, 0, 0, 0)', 'transparent']);

// Cluster every non-transparent color value used as text (color) or as a
// surface (bg) into one usage-counted palette, guessing role from which
// property carried the value.
export function clusterPalette(tokens, sourceFile) {
  const entries = new Map();
  const bump = (value, index, role) => {
    if (!value || TRANSPARENT.has(value)) return;
    if (!entries.has(value)) {
      entries.set(value, { value, usageCount: 0, roleGuess: role, evidence: [], confidence: 'observed' });
    }
    const e = entries.get(value);
    e.usageCount += 1;
    e.evidence.push({ file: sourceFile, index });
  };
  tokens.forEach((t, index) => {
    bump(t.color, index, 'text');
    bump(t.bg, index, 'surface');
  });
  return [...entries.values()];
}

// Distinct border-radius values in use, excluding the flat/no-radius case.
export function deriveRadii(tokens, sourceFile) {
  const entries = new Map();
  tokens.forEach((t, index) => {
    const value = t.radius;
    if (!value || parseFloat(value) === 0) return;
    if (!entries.has(value)) {
      entries.set(value, { value, usageCount: 0, evidence: [], confidence: 'observed' });
    }
    const e = entries.get(value);
    e.usageCount += 1;
    e.evidence.push({ file: sourceFile, index });
  });
  return [...entries.values()];
}

// Bundle-URL fingerprints for the stacks capture-figma can't see (it never
// runs in a real browser against real script tags).
const FRAMEWORK_MARKERS = [
  { match: /\/_next\//, framework: 'react', metaFramework: 'next' },
  { match: /\/_nuxt\//, framework: 'vue', metaFramework: 'nuxt' },
  { match: /\/_astro\//, framework: null, metaFramework: 'astro' },
  { match: /\bvue(\.[a-z]+)?\.js/i, framework: 'vue', metaFramework: null },
  { match: /\breact(-dom)?[.\-]/i, framework: 'react', metaFramework: null },
  { match: /\/wp-(content|includes)\//, framework: 'wordpress', metaFramework: null },
];

const ANIMATION_LIB_MARKERS = [
  { match: /\bgsap\b/i, name: 'gsap' },
  { match: /framer-motion/i, name: 'framer-motion' },
  { match: /\blenis\b/i, name: 'lenis' },
  { match: /locomotive-scroll/i, name: 'locomotive-scroll' },
  { match: /scrollmagic/i, name: 'scrollmagic' },
  { match: /\baos\b/i, name: 'aos' },
  { match: /\banime(\.min)?\.js/i, name: 'anime.js' },
  { match: /jquery\.nicescroll/i, name: 'jquery.nicescroll' },
  { match: /\/edge\.[\d.]+(\.min)?\.js/i, name: 'adobe-edge-animate' },
];

const SMOOTH_SCROLL_LIBS = new Set(['lenis', 'locomotive-scroll', 'jquery.nicescroll']);

export function detectStack(scripts, sourceFile) {
  let framework = null;
  let metaFramework = null;
  const animationLibraries = new Set();
  const evidence = [];

  scripts.forEach((s, index) => {
    if (!s.src) return;
    let matched = false;
    for (const m of FRAMEWORK_MARKERS) {
      if (m.match.test(s.src)) {
        framework = framework ?? m.framework;
        metaFramework = metaFramework ?? m.metaFramework;
        matched = true;
      }
    }
    for (const m of ANIMATION_LIB_MARKERS) {
      if (m.match.test(s.src)) {
        animationLibraries.add(m.name);
        matched = true;
      }
    }
    if (matched) evidence.push({ file: sourceFile, index });
  });

  const scrollTech = [...animationLibraries].some((l) => SMOOTH_SCROLL_LIBS.has(l))
    ? 'smooth-scroll-lib'
    : 'native';

  return {
    framework,
    metaFramework,
    animationLibraries: [...animationLibraries],
    scrollTech,
    motionConstruction: animationLibraries.size ? 'js' : 'unknown',
    scrollJack: false,
    viewTransitions: false,
    evidence,
  };
}

const DURATION_RE = /\d*\.?\d+m?s/;
const CURVE_RE = /cubic-bezier\([^)]+\)|ease-in-out|ease-in|ease-out|ease|linear|steps\([^)]+\)/;
const TIMING_AT_START_RE = new RegExp(`^(${DURATION_RE.source}|${CURVE_RE.source})`);

function triggerFromSelector(selector) {
  if (/:hover/.test(selector)) return 'hover';
  if (/:active/.test(selector) || /:focus/.test(selector)) return 'press';
  if (/scroll|reveal|parallax|sticky/i.test(selector)) return 'scroll';
  return 'load';
}

// Split a `transition:` shorthand's comma-separated property list on
// top-level commas only — `cubic-bezier(0.25, 1, 0.5, 1)` has three commas
// of its own and must not be torn apart by a naive split(',').
function splitTopLevel(value) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

// Static parse of `transition`/`animation` shorthand declarations into
// declared (not yet runtime-observed) motion entries. Complements
// scripts/capture-motion.mjs's live getAnimations()/rAF sampling — this is
// the "what the cascade declares" half; that script is the "what actually
// runs" half. Runs on raw stylesheet text, one rule block at a time.
export function parseDeclaredMotion(cssText, sourceFile) {
  const entries = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let ruleMatch;
  while ((ruleMatch = ruleRe.exec(cssText))) {
    const selector = ruleMatch[1].trim();
    const body = ruleMatch[2];
    const trigger = triggerFromSelector(selector);

    const transitionMatch = body.match(/transition\s*:\s*([^;]+);/);
    if (transitionMatch) {
      for (const clause of splitTopLevel(transitionMatch[1])) {
        const duration = clause.match(DURATION_RE)?.[0] ?? null;
        const curve = clause.match(CURVE_RE)?.[0] ?? null;
        const trimmedClause = clause.trim();
        const firstToken = trimmedClause.split(/\s+/)[0];
        const property = !firstToken ? null : TIMING_AT_START_RE.test(trimmedClause) ? 'all' : firstToken;
        if (!property || property === 'none') continue;
        entries.push({
          name: `${selector} transition:${property}`,
          property,
          duration,
          curve,
          trigger,
          stagger: null,
          declared: true,
          observed: false,
          evidence: [{ file: sourceFile }],
          confidence: 'inferred',
        });
      }
    }

    const animationMatch = body.match(/animation\s*:\s*([^;]+);/);
    if (animationMatch) {
      const clause = animationMatch[1].trim();
      const name = clause.split(/\s+/).find((tok) => !DURATION_RE.test(tok) && !CURVE_RE.test(tok) && !/^\d/.test(tok)) ?? clause;
      const duration = clause.match(DURATION_RE)?.[0] ?? null;
      const curve = clause.match(CURVE_RE)?.[0] ?? null;
      entries.push({
        name: `${selector} animation:${name}`,
        property: 'animation',
        duration,
        curve,
        trigger,
        stagger: null,
        declared: true,
        observed: false,
        evidence: [{ file: sourceFile }],
        confidence: 'inferred',
      });
    }
  }
  return entries;
}

// Reconcile static (declared) motion entries with live-observed samples
// (scripts/capture-motion.mjs's getAnimations()/rAF output). A sample that
// matches a declared entry on property+trigger overwrites its duration/curve
// with the measured value — real behavior wins over what the cascade merely
// declares. A sample with no declared match (JS-driven motion with no CSS
// transition/animation property behind it) becomes its own entry.
export function mergeMotionVocabulary(declaredEntries, samples) {
  const merged = declaredEntries.map((e) => ({ ...e }));
  for (const s of samples) {
    const candidates = merged.filter((e) => e.property === s.property && e.trigger === s.trigger);
    const match = s.target
      ? candidates.find((e) => e.name.includes(s.target)) ?? (candidates.length === 1 ? candidates[0] : undefined)
      : candidates[0];
    const evidence = [{ file: s.sourceFile, index: s.index }];
    if (match) {
      match.duration = s.duration;
      match.curve = s.curve;
      match.stagger = s.stagger ?? match.stagger;
      match.observed = true;
      match.confidence = 'observed';
      match.evidence = [...match.evidence, ...evidence];
    } else {
      merged.push({
        name: `${s.trigger}:${s.property}`,
        property: s.property,
        duration: s.duration,
        curve: s.curve,
        trigger: s.trigger,
        stagger: s.stagger ?? null,
        declared: false,
        observed: true,
        evidence,
        confidence: 'observed',
      });
    }
  }
  return merged;
}

// Assemble a full schemas/reference-tokens.schema.json (v1) object from a
// capture folder's raw Stage-1 artifacts. Pure — callers pass in parsed JSON/
// text; no filesystem access here (see scripts/build-reference-tokens.mjs
// for the CLI that reads a folder and calls this).
export function buildReferenceTokens(meta, capture, sourceFiles) {
  const tokens = capture.tokens ?? [];
  const geometry = capture.geometry ?? [];
  const scripts = capture.scripts ?? [];
  const cssText = capture.cssText ?? '';
  const motionSamples = capture.motionSamples ?? [];

  const declaredMotion = parseDeclaredMotion(cssText, sourceFiles.cssFile);

  return {
    schemaVersion: 1,
    meta: {
      name: meta.name,
      capturedAt: meta.capturedAt,
      source: meta.source,
      classification: meta.classification ?? null,
    },
    typeRoles: clusterTypeRoles(tokens, sourceFiles.tokensFile),
    spacingScale: deriveSpacingScale(geometry, sourceFiles.geometryFile),
    palette: clusterPalette(tokens, sourceFiles.tokensFile),
    radii: deriveRadii(tokens, sourceFiles.tokensFile),
    motionVocabulary: mergeMotionVocabulary(declaredMotion, motionSamples),
    stack: detectStack(scripts, sourceFiles.scriptsFile),
  };
}
