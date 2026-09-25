#!/usr/bin/env node
// media-load-probe — `media-loading`'s done-when script. Drives a URL with
// Playwright at a given viewport/DPR, under CPU + network throttling, in
// Chromium and WebKit; runs a named interaction (load/scroll/drag); samples
// every on-screen <img>/<video>'s paint state per frame; prints the summed
// empty-visible-media count. media-loading's bar is this script printing 0.
//
// Usage:
//   node media-load-probe.mjs <url> --viewport 390x844 --dpr 3 \
//     --interaction load|scroll|drag [--browser chromium|webkit] \
//     [--network fast3g|slow3g|none] [--frames 24]
//
// Requires `playwright` (`npm i -D playwright` in the invoking repo; resolved
// from cwd — same pattern as capture-website/scripts/capture.mjs).
//
// CPU throttling is real (CDP `Emulation.setCPUThrottlingRate`) on Chromium
// only — Playwright has no CPU-throttle API for WebKit. Network throttling
// uses CDP `Network.emulateNetworkConditions` on Chromium and a per-request
// route delay approximating the same profile's RTT on WebKit (bandwidth
// shaping isn't available there) — the WebKit number is a lower bound, not
// exact; name the gap in the return, don't claim parity.
import { createRequire } from "node:module";
import { join } from "node:path";
import { totalEmptyVisibleMediaAcrossFrames } from "./lib/media-load-lib.mjs";

const require = createRequire(join(process.cwd(), "noop.js"));

export const NETWORK_PROFILES = {
  // download/upload in bytes/s, latency in ms — Chrome DevTools' own presets.
  slow3g: { downloadThroughput: (500 * 1024) / 8, uploadThroughput: (500 * 1024) / 8, latency: 400 },
  fast3g: { downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 },
  none: null,
};

export function parseArgs(argv) {
  const [url, ...rest] = argv;
  const opts = { viewport: "390x844", dpr: 2, interaction: "load", browser: "chromium", network: "none", frames: 24 };
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i].replace(/^--/, "");
    if (key in opts) opts[key] = rest[i + 1];
  }
  const [width, height] = opts.viewport.split("x").map(Number);
  return { url, ...opts, width, height, dpr: Number(opts.dpr), frames: Number(opts.frames) };
}

// Injected via page.evaluate — plain-DOM snapshot, no Playwright handle
// leaves the page. Every <img>/<video> on the page, not just those thought
// to be on screen — isVisible() in the lib decides visibility from the rect.
export function sampleMediaStateInPage() {
  return Array.from(document.querySelectorAll("img,video")).map((el) => {
    const r = el.getBoundingClientRect();
    const rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    if (el.tagName === "IMG") {
      return { tag: "img", rect, complete: el.complete, naturalWidth: el.naturalWidth };
    }
    return {
      tag: "video",
      rect,
      posterLoaded: Boolean(el.poster) && el.readyState >= 0 && el.__posterPainted !== false,
      readyState: el.readyState,
      videoWidth: el.videoWidth,
    };
  });
}

async function throttle(page, network) {
  const profile = NETWORK_PROFILES[network] ?? null;
  const client = await page.context().newCDPSession(page).catch(() => null);
  if (client) {
    // Chromium: real CPU + network throttling via CDP.
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

export async function driveInteraction(page, interaction, frames) {
  const samples = [];
  const sample = async () => samples.push(await page.evaluate(sampleMediaStateInPage));
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

async function run(opts) {
  const { chromium, webkit } = require("playwright");
  const engine = opts.browser === "webkit" ? webkit : chromium;
  const browser = await engine.launch();
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: opts.dpr,
  });
  const page = await context.newPage();
  await throttle(page, opts.network);
  await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: 60000 });

  const frames = await driveInteraction(page, opts.interaction, opts.frames);
  const total = totalEmptyVisibleMediaAcrossFrames(frames, { width: opts.width, height: opts.height });

  await browser.close();
  return total;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.url) {
    console.error("Usage: node media-load-probe.mjs <url> --viewport WxH --dpr N --interaction load|scroll|drag [--browser chromium|webkit] [--network fast3g|slow3g|none] [--frames N]");
    process.exit(1);
  }
  const total = await run(opts);
  console.log(total);
  process.exit(total === 0 ? 0 : 1);
}

// Only run when invoked as a CLI, never on import from the tests.
if (process.argv[1] && process.argv[1].endsWith("media-load-probe.mjs")) main();
