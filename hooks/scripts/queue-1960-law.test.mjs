// The 1.96.0 queue: `2026-09-26-media-loading-method` — operator, once the
// holding-page media fixes landed and were approved ("gaps are gone and fade
// looks good"): "do we need to add the skill update to the list as well" →
// yes, now. The 1.95.0 `media-loading` skill is rewritten with the method
// that actually worked (holding-page rounds 5-18, grid-media-scroll, the
// media audit) — outcomes/patterns, not the earlier method-in-principle.
//
// (1) `skills/media-loading/SKILL.md` grows to 12 method items covering the
// production fixes: uncancellable entrance fade, video-poster-until-playing,
// fetchPriority-has-no-effect-on-video, warm-and-hold the unique pool,
// windowed-mount + flushSync, sizes-matches-the-real-slot, phone checks
// target mobile's own view. New `references/PATTERNS.md` (source citations)
// and `references/PROBE.md` (flag reference).
// (2) `hooks/scripts/media-load-probe.mjs` + `lib/media-load-lib.mjs`: the
// primary paint signal is real painted pixels (canvas sampling), not
// `.complete`/DOM presence (fallback only, named `paintUnmeasurable`); a new
// column-gap scan catches a visible region with no covering DOM element at
// all; `--channel`/`--headed` (a real installed browser), `--duration`/
// `--settle` (a long realistic fling/drag session + settle dwell), `--reps`
// (every rep reported) are new flags; a headless/default run prints a
// floor-not-proof note.
//
// Run: node --test hooks/scripts/queue-1960-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

// --- (1) SKILL.md: the new production-found method items --------------------

test("SKILL.md: an entrance fade can never be cancelled mid-wait (round 17 fade-race)", () => {
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /can never be cancelled mid-wait/);
});

test("SKILL.md: a video's poster stays painted until it is actually playing, not just until src is set", () => {
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /stays painted until the video is actually playing/);
  assert.match(doc, /WebKit drops the native `poster` attribute/);
});

test("SKILL.md: fetchPriority has no effect on <video>", () => {
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /`fetchPriority` has \*\*no effect on `<video>`\*\*/);
});

test("SKILL.md: a repeating layout warms and holds the unique pool, nearest-first, paused while panning", () => {
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /warms and holds every unique tile once the first screen settles/);
  assert.match(doc, /paused outright while the reader is actively panning/);
});

test("SKILL.md: windowed mounting commits every mounted-set change before the next paint", () => {
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /every mounted-set change commits before the next paint/);
  assert.match(doc, /latest.*state eventually renders, not every intermediate one/);
});

test("SKILL.md: sizes replays the slot's real rendered-width formula, not an estimate", () => {
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /`sizes` replays the slot's real rendered-width formula/);
});

test("SKILL.md: phone checks target the view mobile actually shows", () => {
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /Phone checks target the view mobile actually shows/);
});

test("SKILL.md: done-when names both the paint signal (pixels, not .complete) and the gap scan", () => {
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /actual painted pixels/);
  assert.match(doc, /never `\.complete`\/DOM presence/);
  assert.match(doc, /no covering DOM element at all/);
});

test("SKILL.md: a headless/default run is named a floor, not proof", () => {
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /floor, not proof/);
});

test("SKILL.md points at both new references files, and both exist", () => {
  const doc = read("skills/media-loading/SKILL.md");
  assert.match(doc, /references\/PATTERNS\.md/);
  assert.match(doc, /references\/PROBE\.md/);
  assert.ok(existsSync(join(repo, "skills", "media-loading", "references", "PATTERNS.md")));
  assert.ok(existsSync(join(repo, "skills", "media-loading", "references", "PROBE.md")));
});

// --- (2) probe + lib: pixel-paint primary signal, gap scan, new CLI flags --

test("media-load-lib.mjs: the pixel-based paint classification functions exist", () => {
  const src = read("hooks/scripts/lib/media-load-lib.mjs");
  assert.match(src, /export function isPixelPainted/);
  assert.match(src, /export function isTransparentPaint/);
  assert.match(src, /export function isStuckOpacityZero/);
  assert.match(src, /export function isPaintedFromDomState/);
});

test("media-load-lib.mjs: the column-gap scan functions exist", () => {
  const src = read("hooks/scripts/lib/media-load-lib.mjs");
  assert.match(src, /export function coveredIntervalsAtY/);
  assert.match(src, /export function gapSegmentsAtY/);
  assert.match(src, /export function scanFrameForColumnGaps/);
  assert.match(src, /export function totalColumnGapsAcrossFrames/);
});

test("media-load-probe.mjs: samples real pixels in-page (canvas), not just DOM flags", () => {
  const src = read("hooks/scripts/media-load-probe.mjs");
  assert.match(src, /drawImage/);
  assert.match(src, /getImageData/);
});

test("media-load-probe.mjs: supports --channel (real installed browser), --headed, --duration, --settle, --reps", () => {
  const src = read("hooks/scripts/media-load-probe.mjs");
  assert.match(src, /channel/);
  assert.match(src, /headed/);
  assert.match(src, /driveFlingSession/);
  assert.match(src, /durationMs/);
  assert.match(src, /settleMs/);
  assert.match(src, /reps/);
});

test("media-load-probe.mjs: a headless/synthetic run prints a floor-not-proof note", () => {
  const src = read("hooks/scripts/media-load-probe.mjs");
  assert.match(src, /FLOOR, not proof/);
});

test("media-load-probe.mjs + lib both still carry their law-test pair", () => {
  for (const rel of [
    "hooks/scripts/media-load-probe.mjs",
    "hooks/scripts/media-load-probe.test.mjs",
    "hooks/scripts/lib/media-load-lib.mjs",
    "hooks/scripts/lib/media-load-lib.test.mjs",
  ]) {
    assert.ok(existsSync(join(repo, rel)), `${rel} must exist`);
  }
});

// --- CHANGED.txt + version bump ---------------------------------------------

test("the 1.96.0 CHANGED entry names the ruling and the method rewrite", () => {
  const changed = read("CHANGED.txt");
  const entryMatch = /^1\.96\.0 —[\s\S]*?(?=\n\n\d+\.\d+\.\d+ —|$)/m.exec(changed);
  assert.ok(entryMatch, "1.96.0's own CHANGED entry must exist");
  const entry = entryMatch[0];
  assert.match(entry, /media-loading-method/);
  assert.match(entry, /painted pixels/i);
});

test("plugin.json and marketplace.json agree at or past 1.96.0", () => {
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
  const atOrPast = (v) => {
    const [maj, min, patch] = v.split(".").map(Number);
    return maj > 1 || (maj === 1 && min > 96) || (maj === 1 && min === 96 && patch >= 0);
  };
  assert.ok(atOrPast(plugin.version), `plugin.json is at ${plugin.version}, want at or past 1.96.0`);
  assert.equal(plugin.version, marketplace.plugins[0].version, "plugin.json and marketplace.json must agree");
});
