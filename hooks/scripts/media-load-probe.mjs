#!/usr/bin/env node
// media-load-probe — `media-loading`'s done-when script. Drives a URL with
// Playwright at a given viewport/DPR, in Chromium and WebKit; runs a named
// interaction (load/scroll/drag); measures every on-screen media element's
// ACTUAL COMPOSITED PIXELS per frame (never `.complete`/DOM presence, and —
// as of the 1.96.0 fix round — never a canvas source-bitmap read of the element's OWN
// bitmap either); and separately scans for regions with NO covering DOM
// element at all (a genuine hole, round 17's windowed-mount gap). Prints both
// counts, every rep. media-loading's bar is both counts at 0.
//
// Paint signal (1.96.0 fix round): each frame takes a full-page screenshot
// (`page.screenshot`), decodes it (`lib/png-lib.mjs`, no image-processing
// dependency — Node's own `zlib`), crops each visible slot's rect —
// intersected with the viewport AND every `overflow:hidden`/`clip`/`auto`/
// `scroll` clipping ancestor's own rect — out of that screenshot, and
// classifies the crop painted/empty against the page background (and any
// `--placeholder-colors`) via `lib/media-load-lib.mjs`. This is what's
// actually composited on screen, so a slot that's clipped away, covered by
// an opaque sibling, `visibility:hidden`, or at `opacity:0` behind a parent
// now reads empty — the exact false-pass shape a canvas source-bitmap read of the
// element's own source bitmap could not detect (round 1 of this fix, against
// the `capture-website`/holding-page round-13 precedent: "screenshot + pixel
// region-stats", not a source-bitmap draw).
//
// Usage:
//   node media-load-probe.mjs <url> --viewport 390x844 --dpr 3 \
//     --interaction load|scroll|drag [--browser chromium|webkit] \
//     [--channel chrome] [--headed] \
//     [--network fast3g|slow3g|none] [--frames 24] \
//     [--duration 60000] [--settle 2000] [--reps 3] [--gap-tolerance 24] \
//     [--placeholder-colors "#eeeeee,#f2f2f2"] [--color-tolerance 8] \
//     [--min-painted-fraction 0.05]
//
// Requires `playwright` (`npm i -D playwright` in the invoking repo; resolved
// from cwd — same pattern as capture-website/scripts/capture.mjs). No other
// dependency: the PNG decode is Node's built-in `zlib` only.
//
// --duration switches to a long, realistic fling/drag SESSION (repeated
// fling gestures, not one smooth crawl) instead of the short fixed-frame
// mode — round 10's own finding was that a short synthetic drag didn't
// disagree with the operator's real phone until the session ran long. Add
// --settle for a final dwell sample (round 13's "first screen settled"
// check) before the session ends.
//
// --channel chrome (+ --headed) launches a real installed Chrome, not
// Playwright's bundled Chromium — closer to what a reader's own browser
// does. A headless/default-bundled run is a FLOOR, not proof: report it as
// such, and confirm with --headed --channel chrome or a real device before
// closing a lane (`media-loading` SKILL.md § Done-when).
//
// CPU throttling and true bandwidth shaping are Chromium-only (Playwright
// has no CDP on WebKit or on a --channel-launched browser). Playwright's
// bundled WebKit also has no real iOS hardware video-decoder cap (round 14)
// — a WebKit pass on video never substitutes for a real iPhone check.
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  totalEmptyVisibleMediaAcrossFrames,
  totalColumnGapsAcrossFrames,
  isVisible,
  isVisibilityHidden,
  clippedVisibleRect,
  scaleRect,
  parseCssColor,
} from "./lib/media-load-lib.mjs";
import { decodePng, cropRegionPixels } from "./lib/png-lib.mjs";

const require = createRequire(join(process.cwd(), "noop.js"));

export const NETWORK_PROFILES = {
  // download/upload in bytes/s, latency in ms — Chrome DevTools' own presets.
  slow3g: { downloadThroughput: (500 * 1024) / 8, uploadThroughput: (500 * 1024) / 8, latency: 400 },
  fast3g: { downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 },
  none: null,
};

// Flags with no value — everything else is `--flag value`.
const BOOLEAN_FLAGS = new Set(["headed"]);

export function parseArgs(argv) {
  const [url, ...rest] = argv;
  const opts = {
    viewport: "390x844",
    dpr: 2,
    interaction: "load",
    browser: "chromium",
    channel: null,
    headed: false,
    network: "none",
    frames: 24,
    duration: 0,
    settle: 0,
    reps: 1,
    gapTolerance: 24,
    placeholderColors: "",
    colorTolerance: 8,
    minPaintedFraction: 0.05,
  };
  const keyMap = {
    "gap-tolerance": "gapTolerance",
    "placeholder-colors": "placeholderColors",
    "color-tolerance": "colorTolerance",
    "min-painted-fraction": "minPaintedFraction",
  };
  for (let i = 0; i < rest.length; i++) {
    const raw = rest[i].replace(/^--/, "");
    const key = keyMap[raw] ?? raw;
    if (!(key in opts)) continue;
    if (BOOLEAN_FLAGS.has(key)) {
      opts[key] = true;
      continue;
    }
    i++;
    opts[key] = rest[i];
  }
  const [width, height] = opts.viewport.split("x").map(Number);
  return {
    ...opts,
    url,
    width,
    height,
    dpr: Number(opts.dpr),
    frames: Number(opts.frames),
    duration: Number(opts.duration),
    settle: Number(opts.settle),
    reps: Number(opts.reps),
    gapTolerance: Number(opts.gapTolerance),
    colorTolerance: Number(opts.colorTolerance),
    minPaintedFraction: Number(opts.minPaintedFraction),
    placeholderColors: opts.placeholderColors
      ? opts.placeholderColors.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
  };
}

// Injected via page.evaluate — plain-DOM only, no canvas source-bitmap capture and no
// pixel snapshot leaves the page this way (the paint signal is now a
// screenshot taken separately, in Node, and decoded there). Self-contained
// (nested helper functions) because Playwright serializes only this
// function's own source. Every <img>/<video> on the page, not just those
// thought to be on screen — the lib decides visibility/paint from the rect,
// clip ancestors, and visibility, and the gap scan uses every visible
// element's rect regardless of its own paint state.
export function sampleMediaStateInPage() {
  // Every ancestor whose computed overflow clips content — its own bounding
  // rect travels as a clip candidate; `clippedVisibleRect` (lib) intersects
  // the element's rect against all of them plus the viewport.
  function elementClipRects(el) {
    const rects = [];
    let node = el.parentElement;
    while (node) {
      const cs = getComputedStyle(node);
      const clips = (v) => v === "hidden" || v === "clip" || v === "auto" || v === "scroll";
      if (clips(cs.overflowX) || clips(cs.overflowY)) {
        const r = node.getBoundingClientRect();
        rects.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
      }
      node = node.parentElement;
    }
    return rects;
  }

  const elements = Array.from(document.querySelectorAll("img,video")).map((el) => {
    const r = el.getBoundingClientRect();
    const rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    const tag = el.tagName === "IMG" ? "img" : "video";
    const cs = getComputedStyle(el);
    return {
      tag,
      rect,
      opacity: Number(cs.opacity),
      visibility: cs.visibility,
      clipRects: elementClipRects(el),
    };
  });

  return { elements, backgroundColor: getComputedStyle(document.body).backgroundColor };
}

async function throttle(page, network) {
  const profile = NETWORK_PROFILES[network] ?? null;
  const client = await page.context().newCDPSession(page).catch(() => null);
  if (client) {
    // Chromium (bundled or --channel): real CPU + network throttling via CDP.
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 }).catch(() => {});
    if (profile) {
      await client.send("Network.emulateNetworkConditions", { offline: false, ...profile }).catch(() => {});
    }
    return;
  }
  // WebKit: no CDP. Approximate network latency with a per-request delay;
  // CPU throttling has no equivalent here (documented limitation above).
  if (profile) {
    await page.route("**/*", async (route) => {
      await new Promise((r) => setTimeout(r, profile.latency));
      await route.continue();
    });
  }
}

// The default sampler: plain DOM state only, no screenshot — what the
// interaction-driving tests below exercise against a fake `page`. `run()`
// supplies its own sampler (below) that also screenshots and crops.
const defaultSampleFn = (page) => page.evaluate(sampleMediaStateInPage);

// Short, fixed-frame mode — one smooth pass, used for `load` and for quick
// checks. `--duration` switches to `driveFlingSession` instead (below).
export async function driveInteraction(page, interaction, frames, sampleFn = defaultSampleFn) {
  const samples = [];
  const sample = async () => samples.push(await sampleFn(page));
  await sample(); // first paint

  if (interaction === "load") {
    for (let i = 1; i < frames; i++) {
      await page.waitForTimeout(50);
      await sample();
    }
    return samples;
  }

  if (interaction === "scroll") {
    const step = Math.max(1, Math.floor(frames / 2));
    for (let i = 0; i < step; i++) {
      await page.mouse.wheel(0, 400);
      await sample();
    }
    return samples;
  }

  if (interaction === "drag") {
    const vp = page.viewportSize();
    const midX = vp.width / 2;
    await page.mouse.move(midX, vp.height * 0.8);
    await page.mouse.down();
    const step = Math.max(1, Math.floor(frames / 2));
    for (let i = 0; i < step; i++) {
      await page.mouse.move(midX, vp.height * 0.8 - i * (vp.height / step));
      await sample();
    }
    await page.mouse.up();
    return samples;
  }

  throw new Error(`Unknown --interaction ${interaction} (want load|scroll|drag)`);
}

// Long, realistic session — a genuine loop of fling/drag gestures (varied
// distance and start point, not one smooth crawl) for `durationMs`, sampling
// after each gesture, then an optional `settleMs` dwell with one final
// sample (round 13's "first screen settled" check — the true test of
// whether a warm/decode background task ever resolves once the reader stops
// moving). `load` has no fling shape — callers use `driveInteraction` for it.
export async function driveFlingSession(page, { interaction, durationMs, settleMs = 0, sampleEveryMs = 250 }, sampleFn = defaultSampleFn) {
  if (interaction !== "scroll" && interaction !== "drag") {
    throw new Error(`driveFlingSession only supports scroll|drag, got ${interaction}`);
  }
  const vp = page.viewportSize();
  const samples = [];
  const sample = async () => samples.push(await sampleFn(page));
  const start = Date.now();
  await sample(); // first paint

  while (Date.now() - start < durationMs) {
    if (interaction === "scroll") {
      await page.mouse.wheel(0, 600 + Math.random() * 400);
    } else {
      const midX = vp.width / 2;
      const fromY = vp.height * (0.2 + Math.random() * 0.6);
      const toY = fromY - (300 + Math.random() * 300);
      await page.mouse.move(midX, fromY);
      await page.mouse.down();
      await page.mouse.move(midX, toY, { steps: 8 });
      await page.mouse.up();
    }
    await sample();
    await page.waitForTimeout(sampleEveryMs);
  }

  if (settleMs > 0) {
    await page.waitForTimeout(settleMs);
    await sample();
  }
  return samples;
}

async function run(opts) {
  const { chromium, webkit } = require("playwright");
  const engine = opts.browser === "webkit" ? webkit : chromium;
  const launchOpts = {};
  if (opts.channel) launchOpts.channel = opts.channel;
  if (opts.headed) launchOpts.headless = false;
  const browser = await engine.launch(launchOpts);
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: opts.dpr,
  });
  const page = await context.newPage();
  await throttle(page, opts.network);
  await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: 60000 });

  const viewport = { width: opts.width, height: opts.height };

  // Background colour is read once, up front — the empty-colour reference
  // every frame's crop is classified against, plus any named placeholders.
  const { backgroundColor } = await page.evaluate(sampleMediaStateInPage);
  const emptyColors = [parseCssColor(backgroundColor), ...opts.placeholderColors.map(parseCssColor)];
  const classifyOptions = { tolerance: opts.colorTolerance, minPaintedFraction: opts.minPaintedFraction };

  // The real sampler: DOM state (rects/clip/visibility) plus a full-page
  // screenshot, decoded and cropped per element into `pixels` — never
  // a canvas source-bitmap read of the element's own bitmap.
  const sampleFn = async (p) => {
    const { elements } = await p.evaluate(sampleMediaStateInPage);
    const screenshotBuffer = await p.screenshot();
    const image = decodePng(screenshotBuffer);
    const scale = image.width / viewport.width;
    return elements.map((el) => {
      const clipped = isVisibilityHidden(el) ? null : clippedVisibleRect(el, viewport);
      const pixels = clipped ? cropRegionPixels(image, scaleRect(clipped, scale)) : [];
      return { ...el, pixels };
    });
  };

  const frames =
    opts.duration > 0
      ? await driveFlingSession(page, { interaction: opts.interaction, durationMs: opts.duration, settleMs: opts.settle }, sampleFn)
      : await driveInteraction(page, opts.interaction, opts.frames, sampleFn);

  const paint = totalEmptyVisibleMediaAcrossFrames(frames, viewport, emptyColors, classifyOptions);
  const visibleRectsPerFrame = frames.map((states) =>
    states.filter((s) => isVisible(s.rect, viewport)).map((s) => s.rect),
  );
  const gaps = totalColumnGapsAcrossFrames(visibleRectsPerFrame, viewport, { tolerancePx: opts.gapTolerance });

  await browser.close();
  return { paint, gaps, frames: frames.length };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.url) {
    console.error(
      "Usage: node media-load-probe.mjs <url> --viewport WxH --dpr N --interaction load|scroll|drag " +
        "[--browser chromium|webkit] [--channel chrome] [--headed] [--network fast3g|slow3g|none] " +
        "[--frames N] [--duration MS] [--settle MS] [--reps N] [--gap-tolerance PX] " +
        "[--placeholder-colors \"#eee,#f2f2f2\"] [--color-tolerance N] [--min-painted-fraction 0-1]",
    );
    process.exit(1);
  }
  const reps = [];
  for (let i = 0; i < opts.reps; i++) {
    const r = await run(opts);
    reps.push(r);
    console.log(`rep ${i + 1}/${opts.reps}: paint=${r.paint} gaps=${r.gaps} frames=${r.frames}`);
  }
  const paintSum = reps.reduce((s, r) => s + r.paint, 0);
  const gapSum = reps.reduce((s, r) => s + r.gaps, 0);
  console.log(`total: paint=${paintSum} gaps=${gapSum}`);
  if (!opts.headed || !opts.channel) {
    console.log(
      "NOTE: headless/synthetic run is a FLOOR, not proof — confirm with --headed --channel chrome or a real device before closing a lane.",
    );
  }
  process.exit(paintSum === 0 && gapSum === 0 ? 0 : 1);
}

// Only run when invoked as a CLI, never on import from the tests.
if (process.argv[1] && process.argv[1].endsWith("media-load-probe.mjs")) main();
