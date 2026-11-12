// Tests for media-load-probe.mjs's deterministic parts: CLI arg parsing,
// the interaction driver against a fake Playwright `page` (no browser
// launched — same split as capture-website: pure/fake-driven logic is
// unit-tested, real browser driving is not exercised by this repo's suite,
// which carries no playwright dependency), and the usage-error CLI path.
// Run: node --test hooks/scripts/media-load-probe.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { classifyEmptyAcrossFrames } from "./lib/media-load-lib.mjs";
import { dirname, join } from "node:path";
import {
  parseArgs,
  driveInteraction,
  driveFlingSession,
  resolveDriveMode,
  takeStableSample,
  repVerdict,
  NETWORK_PROFILES,
  DEFAULT_FLING_DURATION_MS,
} from "./media-load-probe.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = join(repo, "hooks", "scripts", "media-load-probe.mjs");

// --- parseArgs ---------------------------------------------------------------

test("parseArgs defaults: 390x844 @2x, load interaction, chromium, no throttle, 24 frames", () => {
  const opts = parseArgs(["https://example.com"]);
  assert.equal(opts.url, "https://example.com");
  assert.equal(opts.width, 390);
  assert.equal(opts.height, 844);
  assert.equal(opts.dpr, 2);
  assert.equal(opts.interaction, "load");
  assert.equal(opts.browser, "chromium");
  assert.equal(opts.network, "none");
  assert.equal(opts.frames, 24);
});

test("parseArgs reads every named flag and splits viewport into width/height", () => {
  const opts = parseArgs([
    "https://x.test",
    "--viewport", "1440x900",
    "--dpr", "3",
    "--interaction", "scroll",
    "--browser", "webkit",
    "--network", "slow3g",
    "--frames", "10",
  ]);
  assert.equal(opts.width, 1440);
  assert.equal(opts.height, 900);
  assert.equal(opts.dpr, 3);
  assert.equal(opts.interaction, "scroll");
  assert.equal(opts.browser, "webkit");
  assert.equal(opts.network, "slow3g");
  assert.equal(opts.frames, 10);
});

test("parseArgs 1.96.0 defaults: no channel, not headed, not paced, no duration/settle, one rep, 24px gap tolerance", () => {
  const opts = parseArgs(["https://example.com"]);
  assert.equal(opts.channel, null);
  assert.equal(opts.headed, false);
  assert.equal(opts.paced, false, "the realistic fling session is the default — paced is opt-in only (fix round 3)");
  assert.equal(opts.duration, 0);
  assert.equal(opts.settle, 0);
  assert.equal(opts.reps, 1);
  assert.equal(opts.gapTolerance, 24);
});

test("parseArgs reads --paced (boolean, no value consumed) and the round-3 classification flags", () => {
  const opts = parseArgs([
    "https://x.test",
    "--paced",
    "--min-structure-edge", "15",
    "--arrival-window-ms", "300",
    "--interaction", "drag",
  ]);
  assert.equal(opts.paced, true);
  assert.equal(opts.minStructureEdge, 15);
  assert.equal(opts.arrivalWindowMs, 300);
  assert.equal(opts.interaction, "drag", "the boolean --paced flag must not eat the next flag's value");
});

test("parseArgs reads --channel, --headed (boolean, no value consumed), --duration, --settle, --reps, --gap-tolerance", () => {
  const opts = parseArgs([
    "https://x.test",
    "--channel", "chrome",
    "--headed",
    "--duration", "60000",
    "--settle", "2000",
    "--reps", "3",
    "--gap-tolerance", "40",
    "--interaction", "drag",
  ]);
  assert.equal(opts.channel, "chrome");
  assert.equal(opts.headed, true);
  assert.equal(opts.duration, 60000);
  assert.equal(opts.settle, 2000);
  assert.equal(opts.reps, 3);
  assert.equal(opts.gapTolerance, 40);
  assert.equal(opts.interaction, "drag", "the boolean --headed flag must not eat the next flag's value");
});

// --- NETWORK_PROFILES ---------------------------------------------------------

test("network profiles are the three named ones, and none is null (no throttle)", () => {
  assert.deepEqual(Object.keys(NETWORK_PROFILES).sort(), ["fast3g", "none", "slow3g"]);
  assert.equal(NETWORK_PROFILES.none, null);
  assert.ok(NETWORK_PROFILES.slow3g.latency > NETWORK_PROFILES.fast3g.latency, "slow3g is slower than fast3g");
});

// --- driveInteraction against a fake page -------------------------------------

function fakePage(mediaStatesPerCall) {
  let call = 0;
  return {
    async evaluate() {
      const states = mediaStatesPerCall[Math.min(call, mediaStatesPerCall.length - 1)];
      call++;
      return states;
    },
    async waitForTimeout() {},
    mouse: {
      async wheel() {},
      async move() {},
      async down() {},
      async up() {},
    },
    viewportSize: () => ({ width: 390, height: 844 }),
  };
}

test("load interaction samples once per frame, frames times total", async () => {
  const page = fakePage([[{ tag: "img" }]]);
  const samples = await driveInteraction(page, "load", 5);
  assert.equal(samples.length, 5);
});

test("scroll interaction wheels and samples half the requested frame count", async () => {
  let wheelCalls = 0;
  const page = fakePage([[]]);
  page.mouse.wheel = async () => {
    wheelCalls++;
  };
  const samples = await driveInteraction(page, "scroll", 8);
  assert.equal(wheelCalls, 4);
  assert.equal(samples.length, 5, "first-paint sample plus one per wheel step");
});

test("drag interaction presses down, moves, then releases, sampling each move", async () => {
  const calls = [];
  const page = fakePage([[]]);
  page.mouse.down = async () => calls.push("down");
  page.mouse.up = async () => calls.push("up");
  page.mouse.move = async () => calls.push("move");
  const samples = await driveInteraction(page, "drag", 6);
  assert.equal(calls[0], "move"); // initial position
  assert.equal(calls.at(-1), "up");
  assert.ok(calls.filter((c) => c === "down").length === 1);
  assert.equal(samples.length, 4, "first-paint sample plus one per drag-move step");
});

test("an unknown interaction name throws, naming the three valid ones", async () => {
  await assert.rejects(() => driveInteraction(fakePage([[]]), "spin", 4), /load\|scroll\|drag/);
});

// --- driveFlingSession against a fake page (round 10: a long realistic ------
// session, not one smooth crawl — --duration switches to this driver) -------

test("driveFlingSession loops fling gestures for roughly durationMs, sampling each one", async () => {
  const page = fakePage([[]]);
  let wheelCalls = 0;
  page.mouse.wheel = async () => {
    wheelCalls++;
  };
  const samples = await driveFlingSession(page, { interaction: "scroll", durationMs: 30, sampleEveryMs: 5 });
  assert.ok(wheelCalls >= 1, "at least one fling gesture must run");
  assert.equal(samples.length, wheelCalls + 1, "first-paint sample plus one per fling gesture");
});

test("driveFlingSession drag variant presses down, moves, releases each gesture", async () => {
  const page = fakePage([[]]);
  const calls = [];
  page.mouse.down = async () => calls.push("down");
  page.mouse.up = async () => calls.push("up");
  page.mouse.move = async () => calls.push("move");
  await driveFlingSession(page, { interaction: "drag", durationMs: 20, sampleEveryMs: 5 });
  assert.ok(calls.includes("down") && calls.includes("up"));
  assert.equal(calls.filter((c) => c === "down").length, calls.filter((c) => c === "up").length);
});

test("driveFlingSession takes one extra settle-dwell sample when settleMs is given", async () => {
  // durationMs: 0 makes the fling loop run zero gestures (deterministic —
  // real-clock loop counts would otherwise vary with scheduling jitter),
  // isolating exactly what the settle dwell adds: first-paint sample, plus
  // one more when settleMs > 0.
  const page = fakePage([[]]);
  const withoutSettle = await driveFlingSession(page, { interaction: "scroll", durationMs: 0, settleMs: 0 });
  const withSettle = await driveFlingSession(page, { interaction: "scroll", durationMs: 0, settleMs: 10 });
  assert.equal(withoutSettle.length, 1, "no fling gestures, no settle — just the first-paint sample");
  assert.equal(withSettle.length, withoutSettle.length + 1, "settle adds exactly one final sample");
});

test("driveFlingSession refuses `load` — it has no fling shape", async () => {
  await assert.rejects(
    () => driveFlingSession(fakePage([[]]), { interaction: "load", durationMs: 10 }),
    /scroll\|drag/,
  );
});

// --- resolveDriveMode (1.96.0 fix round 3): scroll/drag default to the -----
// realistic fling session; --paced opts back into the old paced crawl; load
// is always its own fixed-frame mode regardless of either flag.

test("resolveDriveMode: load is always its own mode, ignoring --paced and --duration", () => {
  assert.deepEqual(resolveDriveMode({ interaction: "load", paced: false, duration: 0 }), { mode: "load" });
  assert.deepEqual(resolveDriveMode({ interaction: "load", paced: true, duration: 5000 }), { mode: "load" });
});

test("resolveDriveMode: scroll/drag default to a fling session at DEFAULT_FLING_DURATION_MS when --duration is not given", () => {
  assert.deepEqual(resolveDriveMode({ interaction: "scroll", paced: false, duration: 0 }), { mode: "fling", durationMs: DEFAULT_FLING_DURATION_MS });
  assert.deepEqual(resolveDriveMode({ interaction: "drag", paced: false, duration: 0 }), { mode: "fling", durationMs: DEFAULT_FLING_DURATION_MS });
});

test("resolveDriveMode: an explicit --duration extends the fling session past the default", () => {
  assert.deepEqual(resolveDriveMode({ interaction: "drag", paced: false, duration: 60000 }), { mode: "fling", durationMs: 60000 });
});

test("resolveDriveMode: --paced opts back into the old paced crawl, regardless of --duration", () => {
  assert.deepEqual(resolveDriveMode({ interaction: "scroll", paced: true, duration: 0 }), { mode: "paced" });
  assert.deepEqual(resolveDriveMode({ interaction: "drag", paced: true, duration: 60000 }), { mode: "paced" });
});

// --- CLI usage path (no playwright import needed for this path) --------------

test("no URL argument prints usage and exits 1 before touching playwright", () => {
  const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: node media-load-probe\.mjs/);
});

// --- 1.96.0 fix round 2: --help prints usage and exits 0, never treated as a URL ---

test("--help prints usage and exits 0 — never navigated to as a URL", () => {
  const result = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: node media-load-probe\.mjs/);
});

test("-h is also recognised as help, anywhere in argv", () => {
  const result = spawnSync(process.execPath, [script, "https://example.com", "-h"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: node media-load-probe\.mjs/);
});

test("parseArgs treats --help as the help flag, not a URL", () => {
  const opts = parseArgs(["--help"]);
  assert.equal(opts.help, true);
  assert.equal(opts.url, undefined);
});

// --- Companion law test presence (mirrors the four mechanical scripts' shape) -

test("media-load-probe.mjs has its lib split, both present", () => {
  assert.ok(existsSync(join(repo, "hooks", "scripts", "lib", "media-load-lib.mjs")));
  assert.ok(existsSync(join(repo, "hooks", "scripts", "lib", "media-load-lib.test.mjs")));
});

test("the PNG decode/crop split (png-lib.mjs) is present with its own tests", () => {
  assert.ok(existsSync(join(repo, "hooks", "scripts", "lib", "png-lib.mjs")));
  assert.ok(existsSync(join(repo, "hooks", "scripts", "lib", "png-lib.test.mjs")));
});

// 1.96.0 fix round 2: the live-browser fixture proof (every round-1/round-17
// false-pass shape, served on a real URL) is evidence captured by hand, not
// a `node --test` gate — this repo carries no `playwright` dependency (only
// a consuming repo installs it, same reasoning as the rest of this file).
// This just proves the fixture files themselves ship.
test("the live-browser fixture page and its static server are present", () => {
  assert.ok(existsSync(join(repo, "hooks", "scripts", "lib", "fixtures", "media-load-probe-fixture.html")));
  assert.ok(existsSync(join(repo, "hooks", "scripts", "lib", "fixtures", "serve-fixture.mjs")));
});

test("the CPU/network throttling limitation on WebKit is documented in the file header", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /WebKit/);
  assert.match(src, /CPU throttl/i);
});

// --- 1.96.0: pixel-paint primary signal, headed real Chrome, gap scan ------
// --- 1.96.0 fix round 1: screenshot-composited paint signal, never drawImage

test("the probe's paint signal never draws the element's own bitmap via canvas — drawImage is not used anywhere in the file", () => {
  const src = readFileSync(script, "utf8");
  assert.doesNotMatch(src, /drawImage/, "drawImage samples the SOURCE bitmap, not what's composited on screen — round 1 finding");
});

test("sampleMediaStateInPage carries no canvas/getImageData — DOM rects, clip ancestors, opacity, visibility only", () => {
  const src = readFileSync(script, "utf8");
  assert.doesNotMatch(src, /getImageData/);
  assert.match(src, /elementClipRects/);
  assert.match(src, /getComputedStyle\(node\)/);
});

test("DISC-276: the sampler sends visible text blocks as covering-only entries, and the gap scan uses clipped covering rects", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /tag: "text"/);
  assert.match(src, /frameCoveringRects/);
});

test("the paint signal is a page screenshot, decoded and cropped per slot", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /page\.screenshot|p\.screenshot/);
  assert.match(src, /decodePng/);
  assert.match(src, /cropRegionPixels/);
  assert.match(src, /clippedVisibleRect/);
});

test("the probe supports naming not-yet-painted placeholder colours and classification thresholds", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /placeholder-colors/);
  assert.match(src, /color-tolerance/);
  assert.match(src, /min-painted-fraction/);
});

// --- 1.96.0 fix round 3: realistic-by-default fling session, --paced opt-in,
// arrival window, structure-edge bound ---------------------------------------

test("the file supports --paced (opt-in only) and documents it as not proof of fast-motion behaviour", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /--paced/);
  assert.match(src, /not proof of fast-motion behaviour/);
});

test("the probe supports --arrival-window-ms and --min-structure-edge", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /arrival-window-ms/);
  assert.match(src, /min-structure-edge/);
});

test("main() prints the drive mode per rep and the paced-mode caveat when any rep used it", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /mode=\$\{r\.mode\}/);
  assert.match(src, /r\.mode === "paced"/);
});

test("parseArgs splits --placeholder-colors on commas and defaults to an empty list", () => {
  const opts = parseArgs(["https://example.com"]);
  assert.deepEqual(opts.placeholderColors, []);
  const withColors = parseArgs(["https://example.com", "--placeholder-colors", "#eee, #f2f2f2"]);
  assert.deepEqual(withColors.placeholderColors, ["#eee", "#f2f2f2"]);
});

test("the file documents headless/synthetic results as a floor, not proof", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /FLOOR, not proof/);
});

test("the file supports --channel (a real installed browser) and --headed", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /channel/);
  assert.match(src, /headed/);
});

test("the file documents the round-14 WebKit-has-no-real-iOS-decoder-cap limitation", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /decoder cap/);
});

test("main() reports every rep and prints a combined paint + gap total", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /rep \$\{i \+ 1\}\/\$\{opts\.reps\}/);
  assert.match(src, /paintSum === 0 && gapSum === 0/);
});

// --- takeStableSample (PF-1475): DOM read and screenshot must describe one frame

const box = (top) => ({ left: 0, top, right: 100, bottom: top + 100, width: 100, height: 100 });

test("takeStableSample retries while the page scrolls between the DOM read and the screenshot, then returns the settled read", async () => {
  const reads = [[{ tag: "img", rect: box(0) }], [{ tag: "img", rect: box(60) }], // moved during attempt 1
    [{ tag: "img", rect: box(60) }], [{ tag: "img", rect: box(60) }]]; // stable in attempt 2
  let i = 0, shots = 0;
  const out = await takeStableSample({ read: async () => reads[i++], capture: async () => ++shots, wait: async () => {}, maxAttempts: 4 });
  assert.equal(shots, 2);
  assert.equal(out.shot, 2);
  assert.equal(out.elements[0].rect.top, 60);
});

test("takeStableSample returns null (frame dropped, not judged) when the page never settles within maxAttempts", async () => {
  let t = 0;
  const out = await takeStableSample({ read: async () => [{ tag: "img", rect: box(t += 50) }], capture: async () => 1, wait: async () => {}, maxAttempts: 3 });
  assert.equal(out, null);
});

// --- repVerdict (PF-1475 review): a rep that judged nothing is never green ----

test("repVerdict: zero paint, zero gaps, frames judged, few dropped is green", () => {
  assert.equal(repVerdict({ paint: 0, gaps: 0, frames: 20, dropped: 2 }, 0.25).ok, true);
});

test("repVerdict: a page that never settles (every frame dropped, frames=0) is not green", () => {
  const v = repVerdict({ paint: 0, gaps: 0, frames: 0, dropped: 12 }, 0.25);
  assert.equal(v.ok, false);
  assert.match(v.reason, /no frame was judged/);
});

test("repVerdict: dropped frames above the stated share fail the rep, at the boundary they pass", () => {
  assert.equal(repVerdict({ paint: 0, gaps: 0, frames: 15, dropped: 5 }, 0.25).ok, true, "5 of 20 = exactly 25%");
  const v = repVerdict({ paint: 0, gaps: 0, frames: 14, dropped: 6 }, 0.25);
  assert.equal(v.ok, false, "6 of 20 = 30%");
  assert.match(v.reason, /dropped/);
});

test("repVerdict: paint or gaps above zero fail whatever the frame counts", () => {
  assert.equal(repVerdict({ paint: 1, gaps: 0, frames: 20, dropped: 0 }, 0.25).ok, false);
  assert.equal(repVerdict({ paint: 0, gaps: 1, frames: 20, dropped: 0 }, 0.25).ok, false);
});

test("a blank tile in a strip that moves every frame is never judged green: every frame drops, verdict red", async () => {
  let top = 0;
  const frames = [];
  for (let f = 0; f < 6; f++) {
    const out = await takeStableSample({ read: async () => [{ tag: "img", rect: box((top += 40)) }], capture: async () => 1, wait: async () => {}, maxAttempts: 3 });
    if (out) frames.push(out);
  }
  assert.equal(frames.length, 0);
  assert.equal(repVerdict({ paint: 0, gaps: 0, frames: frames.length, dropped: 6 }, 0.25).ok, false);
});

test("settled blank control: a blank tile that holds still is returned by takeStableSample and counted by the classifier", async () => {
  const white = { r: 255, g: 255, b: 255 };
  const bgPixels = Array.from({ length: 100 }, () => ({ ...white, a: 255 }));
  const state = { tag: "img", rect: box(100), src: "a.avif", opacity: 1, visibility: "visible", clipRects: [], pixels: bgPixels };
  const frames = [];
  for (let f = 0; f < 3; f++) {
    const out = await takeStableSample({ read: async () => [{ tag: "img", rect: box(100) }], capture: async () => 1, wait: async () => {}, maxAttempts: 3 });
    assert.ok(out, "a still page yields a frame");
    frames.push([state]);
  }
  const r = classifyEmptyAcrossFrames(frames, { width: 390, height: 844 }, [white], { arrivalWindowMs: 300, frameIntervalMs: 250 });
  assert.ok(r.total >= 1, "the blank, settled slot is flagged");
});

test("parseArgs: --max-dropped-share defaults to 0.25 and reads a value", () => {
  assert.equal(parseArgs(["https://x.test"]).maxDroppedShare, 0.25);
  assert.equal(parseArgs(["https://x.test", "--max-dropped-share", "0.1"]).maxDroppedShare, 0.1);
});
