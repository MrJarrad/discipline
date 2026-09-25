// Pure media-paint arithmetic, isolated from Playwright so it's unit-testable
// without a browser — the same split `capture-website/scripts/lib/*` uses.
// A media-loading DONE means: every media element visible on screen shows at
// least its still/poster from first paint, throughout scroll/drag/hover/route
// change; never a blank or half-painted tile. This file decides, from a plain
// sampled DOM snapshot, whether one element counts as "empty and visible".

// An <img> is painted once the browser has decoded a non-zero frame.
// A <video> is painted once its poster has loaded (the fallback the operator
// named: "poster are there as fallbacks ... they should load first"), or once
// its own decode has reached HAVE_CURRENT_DATA (readyState >= 2) with a real
// frame size — whichever comes first, so the poster-then-video handoff never
// shows a gap.
const HAVE_CURRENT_DATA = 2;

export function isPainted(state) {
  if (state.tag === "img") {
    return Boolean(state.complete && state.naturalWidth > 0);
  }
  if (state.tag === "video") {
    if (state.posterLoaded) return true;
    return Boolean(state.readyState >= HAVE_CURRENT_DATA && state.videoWidth > 0);
  }
  return true; // not a media tag this probe tracks
}

// On screen means the element's rect overlaps the viewport rect at all —
// zero-size rects (display:none, not yet laid out) never count as visible.
export function isVisible(rect, viewport) {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < viewport.width &&
    rect.top < viewport.height
  );
}

// One frame's empty-visible-media set: on screen, and not yet painted.
export function emptyVisibleMedia(states, viewport) {
  return states.filter((s) => isVisible(s.rect, viewport) && !isPainted(s));
}

export function countEmptyVisibleMedia(states, viewport) {
  return emptyVisibleMedia(states, viewport).length;
}

// The probe's headline number: summed across every sampled frame of the
// driven interaction. Zero is the only passing value — `media-loading`'s
// done-when.
export function totalEmptyVisibleMediaAcrossFrames(frames, viewport) {
  return frames.reduce((sum, states) => sum + countEmptyVisibleMedia(states, viewport), 0);
}
