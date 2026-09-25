// Unit tests for the pure media-paint logic — fixture DOM snapshots, no
// browser launched. The CLI wrapper (media-load-probe.mjs) is what drives a
// real page; this file is what decides "empty and visible" from its samples.
// Run: node --test hooks/scripts/lib/media-load-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPainted,
  isVisible,
  emptyVisibleMedia,
  countEmptyVisibleMedia,
  totalEmptyVisibleMediaAcrossFrames,
} from "./media-load-lib.mjs";

const VIEWPORT = { width: 390, height: 844 };
const onscreen = (over = {}) => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, ...over });
const offscreen = { left: -500, top: -500, right: -400, bottom: -400, width: 100, height: 100 };
const zeroSize = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };

// --- isPainted --------------------------------------------------------------

test("an img is painted once complete with a decoded non-zero frame", () => {
  assert.equal(isPainted({ tag: "img", complete: true, naturalWidth: 200 }), true);
});

test("an img mid-decode (not complete, or 0-width) is not painted", () => {
  assert.equal(isPainted({ tag: "img", complete: false, naturalWidth: 200 }), false);
  assert.equal(isPainted({ tag: "img", complete: true, naturalWidth: 0 }), false);
});

test("a video with its poster loaded is painted even before any frame decodes", () => {
  assert.equal(isPainted({ tag: "video", posterLoaded: true, readyState: 0, videoWidth: 0 }), true);
});

test("a video with no poster is painted once it reaches HAVE_CURRENT_DATA with real dimensions", () => {
  assert.equal(isPainted({ tag: "video", posterLoaded: false, readyState: 2, videoWidth: 640 }), true);
  assert.equal(isPainted({ tag: "video", posterLoaded: false, readyState: 1, videoWidth: 640 }), false);
  assert.equal(isPainted({ tag: "video", posterLoaded: false, readyState: 2, videoWidth: 0 }), false);
});

test("a non-media tag is never counted as unpainted (defaults true)", () => {
  assert.equal(isPainted({ tag: "div" }), true);
});

// --- isVisible ---------------------------------------------------------------

test("a rect fully inside the viewport is visible", () => {
  assert.equal(isVisible(onscreen(), VIEWPORT), true);
});

test("a rect entirely off the top/left/right/bottom is not visible", () => {
  assert.equal(isVisible(offscreen, VIEWPORT), false);
  assert.equal(isVisible({ ...offscreen, left: 5000, right: 5100 }, VIEWPORT), false);
});

test("a zero-size rect (display:none, unlaid-out) is never visible", () => {
  assert.equal(isVisible(zeroSize, VIEWPORT), false);
});

test("a rect only partially overlapping the viewport still counts as visible", () => {
  assert.equal(isVisible({ left: -50, top: -50, right: 50, bottom: 50, width: 100, height: 100 }, VIEWPORT), true);
});

// --- emptyVisibleMedia / countEmptyVisibleMedia -------------------------------

test("a visible unpainted element counts; a visible painted one does not", () => {
  const states = [
    { tag: "img", rect: onscreen(), complete: false, naturalWidth: 0 },
    { tag: "img", rect: onscreen(), complete: true, naturalWidth: 200 },
  ];
  assert.equal(countEmptyVisibleMedia(states, VIEWPORT), 1);
  assert.equal(emptyVisibleMedia(states, VIEWPORT)[0].complete, false);
});

test("an unpainted but off-screen element never counts — only on-screen tiles matter", () => {
  const states = [{ tag: "video", rect: offscreen, posterLoaded: false, readyState: 0, videoWidth: 0 }];
  assert.equal(countEmptyVisibleMedia(states, VIEWPORT), 0);
});

test("an empty frame (no media at all) counts zero", () => {
  assert.equal(countEmptyVisibleMedia([], VIEWPORT), 0);
});

// --- totalEmptyVisibleMediaAcrossFrames ---------------------------------------

test("the total sums every sampled frame's count, not just the worst one", () => {
  const unpainted = { tag: "img", rect: onscreen(), complete: false, naturalWidth: 0 };
  const painted = { tag: "img", rect: onscreen(), complete: true, naturalWidth: 200 };
  const frames = [[unpainted], [unpainted, unpainted], [painted]];
  assert.equal(totalEmptyVisibleMediaAcrossFrames(frames, VIEWPORT), 3);
});

test("an all-painted, all-frames interaction totals zero — the passing shape", () => {
  const painted = { tag: "video", rect: onscreen(), posterLoaded: true, readyState: 0, videoWidth: 0 };
  const frames = [[painted], [painted], [painted]];
  assert.equal(totalEmptyVisibleMediaAcrossFrames(frames, VIEWPORT), 0);
});
