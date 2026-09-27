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
// Fix round 2 (1.96.0): round 1's classifier over-fired on a real, operator-
// approved page — the holding canvas's own designed column gutter
// (`--grid-gap-lg`, 64-96px) is WIDER than the old fixed 24px gap tolerance
// and, being a real multi-column layout, persists for nearly the whole
// height of every column — so a fixed absolute tolerance flagged the site's
// own everyday layout as a hole on almost every scanline. And the
// background-match-fraction paint rule read real but background-close media
// (a white product shot, a dark-framed video) as empty. `lib/media-load-
// lib.mjs` now adds: (1) a luma-variance check alongside the fraction rule —
// real content almost always has structure a flat swatch never does, an OR
// so it only ever rescues a false EMPTY, never masks a real one; (2) the gap
// scan compares each candidate gap's width against the SAME FRAME's own
// recurring gutter width (its median), not an absolute number — a real
// gutter IS that recurring width, a genuine missing/hidden tile is markedly
// WIDER (`--gap-width-ratio`, default 2x). See `isRegionPainted` and
// `scanFrameForColumnGaps` for the exact rules.
//
// Fix round 3 (1.96.0): review round 2 found paint misses on the real
// holding page in fast-fling mode (`--duration`, "the mode the docs call the
// real test") that a short PACED drag/scroll never saw — because a paced,
// evenly-spaced crawl gives the page's own decode pipeline time to keep up
// that a real fast fling never grants, AND because a single-frame judgment
// can't tell a tile mid its own operator-approved ~250ms fade (arriving)
// from one genuinely stuck. Three changes:
// 1. `--interaction scroll|drag` now runs the realistic FLING session by
//    DEFAULT (`DEFAULT_FLING_DURATION_MS`, extend with `--duration`) — the
//    old paced, evenly-spaced crawl is opt-in only (`--paced`), and prints
//    its own "not proof of fast-motion behaviour" note when used.
// 2. A blank slot only counts once it's stayed blank past `arrivalWindowMs`
//    (default the page's own ~250ms fade) — `classifyEmptyAcrossFrames`,
//    tracked per element across frames.
// 3. The trivial-sliver exemption only fires when the element's rect has
//    actually MOVED since the last frame it was seen in — never a static
//    tile at rest, at the fold, on load.
// See `lib/media-load-lib.mjs`'s own comment for the exact mechanics.
//
// Usage:
//   node media-load-probe.mjs <url> --viewport 390x844 --dpr 3 \
//     --interaction load|scroll|drag [--browser chromium|webkit] \
//     [--channel chrome] [--headed] [--paced] \
//     [--network fast3g|slow3g|none] [--frames 24] \
//     [--duration 60000] [--settle 2000] [--reps 3] [--gap-tolerance 24] \
//     [--gap-width-ratio 2] \
//     [--placeholder-colors "#eeeeee,#f2f2f2"] [--color-tolerance 8] \
//     [--min-painted-fraction 0.05] [--min-painted-stddev 10] \
//     [--min-structure-edge 20] [--arrival-window-ms 250]
//   node media-load-probe.mjs --help
//
// Requires `playwright` (`npm i -D playwright` in the invoking repo; resolved
// from cwd — same pattern as capture-website/scripts/capture.mjs). No other
// dependency: the PNG decode is Node's built-in `zlib` only.
//
// `scroll`/`drag` default to a long, realistic fling/drag SESSION (repeated
// fling gestures, not one smooth crawl) — round 10's own finding was that a
// short synthetic drag didn't disagree with the operator's real phone until
// the session ran long. `--duration` extends the session length past the
// default (`DEFAULT_FLING_DURATION_MS`); `--settle` adds a final dwell
// sample (round 13's "first screen settled" check) before the session ends;
// `--paced` opts BACK INTO the old short, evenly-spaced crawl — never proof
// of fast-motion behaviour on its own, per its own printed note.
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
  totalEmptyMediaAcrossFrames,
  totalColumnGapsAcrossFrames,
  isVisible,
  isVisibilityHidden,
  clippedVisibleRect,
  scaleRect,
  parseCssColor,
  MIN_PAINTED_STDDEV,
  MIN_STRUCTURE_EDGE_JUMP,
  MIN_VISIBLE_AREA_FRACTION,
  DEFAULT_ARRIVAL_WINDOW_MS,
} from "./lib/media-load-lib.mjs";
import { decodePng, cropRegionPixels } from "./lib/png-lib.mjs";

const require = createRequire(join(process.cwd(), "noop.js"));

// Per-step wall-clock pacing for `driveInteraction`'s scroll/drag loops (only
// reached via the opt-in `--paced` flag as of fix round 3) — see the scroll
// branch's own comment below for why this exists.
export const STEP_PACE_MS = 500;

// `load`'s own fixed-frame cadence (`driveInteraction`'s load branch).
export const LOAD_FRAME_INTERVAL_MS = 50;

// `driveFlingSession`'s own default cadence between gestures.
export const FLING_SAMPLE_EVERY_MS = 250;

// Fix round 3: the default (no `--duration`) length of the realistic fling
// session `scroll`/`drag` now run by default — long enough for ~16 fling
// gestures at `FLING_SAMPLE_EVERY_MS` to expose a stuck tile (round 10's own
// finding needed a long session; this is a fast default, not the closing
// proof run) while staying quick for everyday use. `PROBE.md` still
// recommends 60-90s via `--duration` for the run that closes a lane.
export const DEFAULT_FLING_DURATION_MS = 8000;

export const NETWORK_PROFILES = {
  // download/upload in bytes/s, latency in ms — Chrome DevTools' own presets.
  slow3g: { downloadThroughput: (500 * 1024) / 8, uploadThroughput: (500 * 1024) / 8, latency: 400 },
  fast3g: { downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 },
  none: null,
};

// Flags with no value — everything else is `--flag value`.
const BOOLEAN_FLAGS = new Set(["headed", "help", "paced"]);

export const USAGE =
  "Usage: node media-load-probe.mjs <url> --viewport WxH --dpr N --interaction load|scroll|drag " +
  "[--browser chromium|webkit] [--channel chrome] [--headed] [--paced] [--network fast3g|slow3g|none] " +
  "[--frames N] [--duration MS] [--settle MS] [--reps N] [--gap-tolerance PX] [--gap-width-ratio N] " +
  "[--placeholder-colors \"#eee,#f2f2f2\"] [--color-tolerance N] [--min-painted-fraction 0-1] " +
  "[--min-painted-stddev N] [--min-structure-edge N] [--arrival-window-ms MS] " +
  "[--min-visible-area 0-1] | --help";

export function parseArgs(argv) {
  const [url, ...rest] = argv;
  const opts = {
    viewport: "390x844",
    dpr: 2,
    interaction: "load",
    browser: "chromium",
    channel: null,
    headed: false,
    paced: false,
    help: false,
    network: "none",
    frames: 24,
    duration: 0,
    settle: 0,
    reps: 1,
    gapTolerance: 24,
    gapWidthRatio: 2,
    placeholderColors: "",
    colorTolerance: 8,
    minPaintedFraction: 0.05,
    minPaintedStddev: MIN_PAINTED_STDDEV,
    minStructureEdge: MIN_STRUCTURE_EDGE_JUMP,
    arrivalWindowMs: DEFAULT_ARRIVAL_WINDOW_MS,
    minVisibleArea: MIN_VISIBLE_AREA_FRACTION,
  };
  const keyMap = {
    "gap-tolerance": "gapTolerance",
    "gap-width-ratio": "gapWidthRatio",
    "placeholder-colors": "placeholderColors",
    "color-tolerance": "colorTolerance",
    "min-painted-fraction": "minPaintedFraction",
    "min-painted-stddev": "minPaintedStddev",
    "min-structure-edge": "minStructureEdge",
    "arrival-window-ms": "arrivalWindowMs",
    "min-visible-area": "minVisibleArea",
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
  // `--help` (or a bare `-h`) anywhere in argv, including as the URL slot
  // itself (`node media-load-probe.mjs --help`), asks for usage — never
  // treated as a URL to navigate to.
  if (url === "--help" || url === "-h" || argv.includes("-h")) opts.help = true;
  const [width, height] = opts.viewport.split("x").map(Number);
  return {
    ...opts,
    url: opts.help ? undefined : url,
    width,
    height,
    dpr: Number(opts.dpr),
    frames: Number(opts.frames),
    duration: Number(opts.duration),
    settle: Number(opts.settle),
    reps: Number(opts.reps),
    gapTolerance: Number(opts.gapTolerance),
    gapWidthRatio: Number(opts.gapWidthRatio),
    colorTolerance: Number(opts.colorTolerance),
    minPaintedFraction: Number(opts.minPaintedFraction),
    minPaintedStddev: Number(opts.minPaintedStddev),
    minStructureEdge: Number(opts.minStructureEdge),
    arrivalWindowMs: Number(opts.arrivalWindowMs),
    minVisibleArea: Number(opts.minVisibleArea),
    placeholderColors: opts.placeholderColors
      ? opts.placeholderColors.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
  };
}

// Fix round 3: which drive mode `run()` actually uses for `--interaction
// scroll|drag` — `load` always drives `driveInteraction`'s fixed-frame
// branch (unaffected by `--paced`/`--duration`); `--paced` opts back into
// the old short, evenly-spaced crawl; otherwise (the new default) a
// realistic fling session runs for `--duration` if given, else
// `DEFAULT_FLING_DURATION_MS`. A pure function so this decision is testable
// without a browser.
export function resolveDriveMode(opts) {
  if (opts.interaction === "load") return { mode: "load" };
  if (opts.paced) return { mode: "paced" };
  return { mode: "fling", durationMs: opts.duration > 0 ? opts.duration : DEFAULT_FLING_DURATION_MS };
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
    // `src` (falling back to `currentSrc` for a `<video>`, which reflects the
    // resolved source, not the `src` attribute) is this element's identity
    // across frames for the round-3 arrival-window tracker
    // (`classifyEmptyAcrossFrames` in `lib/media-load-lib.mjs`) — best-effort
    // (see that function's own comment), not a stable DOM key.
    return {
      tag,
      rect,
      src: el.currentSrc || el.src || null,
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
      // 1.96.0 fix round 2 (verified live): a zero-delay step-loop is faster
      // than any real drag/scroll gesture can be — Chromium's decode
      // pipeline happened to keep up regardless, but Playwright's bundled
      // WebKit does not, producing scattered false paint misses on
      // just-mounted tiles that a REAL frame-paced gesture never triggers
      // (round 14's own "bundled WebKit is not real iOS" caveat, extended
      // past video). `STEP_PACE_MS` gives each step the same order of
      // wall-clock time `driveFlingSession`'s own `sampleEveryMs` already
      // assumes between gestures.
      await page.waitForTimeout(STEP_PACE_MS);
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
      await page.waitForTimeout(STEP_PACE_MS); // see the scroll branch's own comment above
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
  // 1.96.0 fix round 2: `domcontentloaded` fires before the browser has even
  // STARTED fetching priority images under a throttled connection — sampling
  // "first paint" that early caught real, still-in-flight network requests,
  // not a defect (method 1's "loads its still/poster at high priority" still
  // takes real time on a throttled connection). Wait for the page's own
  // `load` event (SKILL.md method 8's own reference point) plus network idle
  // (bounded, never blocks past `timeout`) before the interaction begins —
  // the same "give it a beat before judging" reasoning `--settle` already
  // applies at the END of a session, applied at the start too.
  await page.goto(opts.url, { waitUntil: "load", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  const viewport = { width: opts.width, height: opts.height };

  // Background colour is read once, up front — the empty-colour reference
  // every frame's crop is classified against, plus any named placeholders.
  const { backgroundColor } = await page.evaluate(sampleMediaStateInPage);
  const emptyColors = [parseCssColor(backgroundColor), ...opts.placeholderColors.map(parseCssColor)];
  const paintClassifyOptions = {
    tolerance: opts.colorTolerance,
    minPaintedFraction: opts.minPaintedFraction,
    minPaintedStddev: opts.minPaintedStddev,
    minStructureEdgeJump: opts.minStructureEdge,
    minVisibleAreaFraction: opts.minVisibleArea,
  };

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

  // Fix round 3: `scroll`/`drag` default to a realistic fling SESSION, never
  // the old paced crawl — `--paced` opts back into it (never proof of
  // fast-motion behaviour on its own). `load` is unaffected either way.
  const driveMode = resolveDriveMode(opts);
  let frames;
  let frameIntervalMs;
  if (driveMode.mode === "load") {
    frames = await driveInteraction(page, "load", opts.frames, sampleFn);
    frameIntervalMs = LOAD_FRAME_INTERVAL_MS;
  } else if (driveMode.mode === "paced") {
    frames = await driveInteraction(page, opts.interaction, opts.frames, sampleFn);
    frameIntervalMs = STEP_PACE_MS;
  } else {
    frames = await driveFlingSession(
      page,
      { interaction: opts.interaction, durationMs: driveMode.durationMs, settleMs: opts.settle, sampleEveryMs: FLING_SAMPLE_EVERY_MS },
      sampleFn,
    );
    frameIntervalMs = FLING_SAMPLE_EVERY_MS;
  }

  // `load` has no session to fade across — the bar is real from first paint,
  // so every blank frame counts immediately, unchanged from before round 3.
  const arrivalWindowMs = driveMode.mode === "load" ? 0 : opts.arrivalWindowMs;
  const paint = totalEmptyMediaAcrossFrames(frames, viewport, emptyColors, {
    ...paintClassifyOptions,
    arrivalWindowMs,
    frameIntervalMs,
  });
  const visibleRectsPerFrame = frames.map((states) =>
    states.filter((s) => isVisible(s.rect, viewport)).map((s) => s.rect),
  );
  const gaps = totalColumnGapsAcrossFrames(visibleRectsPerFrame, viewport, {
    tolerancePx: opts.gapTolerance,
    widthRatio: opts.gapWidthRatio,
  });

  await browser.close();
  return { paint, gaps, frames: frames.length, mode: driveMode.mode };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    process.exit(0);
  }
  if (!opts.url) {
    console.error(USAGE);
    process.exit(1);
  }
  const reps = [];
  for (let i = 0; i < opts.reps; i++) {
    const r = await run(opts);
    reps.push(r);
    console.log(`rep ${i + 1}/${opts.reps}: paint=${r.paint} gaps=${r.gaps} frames=${r.frames} mode=${r.mode}`);
  }
  const paintSum = reps.reduce((s, r) => s + r.paint, 0);
  const gapSum = reps.reduce((s, r) => s + r.gaps, 0);
  console.log(`total: paint=${paintSum} gaps=${gapSum}`);
  if (reps.some((r) => r.mode === "paced")) {
    console.log(
      "NOTE: --paced is a slow, evenly-spaced crawl — not proof of fast-motion behaviour. Use the default (or --duration) fling session before closing a lane.",
    );
  }
  if (!opts.headed || !opts.channel) {
    console.log(
      "NOTE: headless/synthetic run is a FLOOR, not proof — confirm with --headed --channel chrome or a real device before closing a lane.",
    );
  }
  process.exit(paintSum === 0 && gapSum === 0 ? 0 : 1);
}

// Only run when invoked as a CLI, never on import from the tests.
if (process.argv[1] && process.argv[1].endsWith("media-load-probe.mjs")) main();
