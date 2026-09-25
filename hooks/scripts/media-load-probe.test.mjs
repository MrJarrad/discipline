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
import { dirname, join } from "node:path";
import { parseArgs, driveInteraction, NETWORK_PROFILES } from "./media-load-probe.mjs";

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

// --- CLI usage path (no playwright import needed for this path) --------------

test("no URL argument prints usage and exits 1 before touching playwright", () => {
  const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: node media-load-probe\.mjs/);
});

// --- Companion law test presence (mirrors the four mechanical scripts' shape) -

test("media-load-probe.mjs has its lib split, both present", () => {
  assert.ok(existsSync(join(repo, "hooks", "scripts", "lib", "media-load-lib.mjs")));
  assert.ok(existsSync(join(repo, "hooks", "scripts", "lib", "media-load-lib.test.mjs")));
});

test("the CPU/network throttling limitation on WebKit is documented in the file header", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /WebKit/);
  assert.match(src, /CPU throttl/i);
});
