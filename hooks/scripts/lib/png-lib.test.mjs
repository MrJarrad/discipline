// Tests for the PNG decoder + region cropper — round-tripped against
// synthetic PNGs built with this file's own tiny encoder (filter type 0,
// zero CRCs — `decodePng` never validates CRC, so a real one isn't needed to
// prove decode correctness). Run: node --test hooks/scripts/lib/png-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { decodePng, cropRegionPixels } from "./png-lib.mjs";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]); // zero CRC — unchecked
}

// Builds a minimal, unfiltered (filter type 0 every row), non-interlaced,
// 8-bit PNG from a flat pixel array (`{r,g,b,a}` for RGBA, `{r,g,b}` for RGB,
// `{g}` for grey, `{g,a}` for grey+alpha).
function encodeTestPng(width, height, colorType, pixels) {
  const channelsByType = { 0: ["g"], 2: ["r", "g", "b"], 4: ["g", "a"], 6: ["r", "g", "b", "a"] };
  const keys = channelsByType[colorType];
  const stride = width * keys.length;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type: None
    for (let x = 0; x < width; x++) {
      const p = pixels[y * width + x];
      for (let k = 0; k < keys.length; k++) {
        raw[y * (stride + 1) + 1 + x * keys.length + k] = p[keys[k]];
      }
    }
  }
  const compressed = deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(colorType, 9);
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter method
  ihdr.writeUInt8(0, 12); // interlace: none
  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0))]);
}

test("decodePng round-trips an RGBA image", () => {
  const pixels = [
    { r: 255, g: 0, b: 0, a: 255 },
    { r: 0, g: 255, b: 0, a: 255 },
    { r: 0, g: 0, b: 255, a: 128 },
    { r: 10, g: 20, b: 30, a: 0 },
  ];
  const png = encodeTestPng(2, 2, 6, pixels);
  const image = decodePng(png);
  assert.equal(image.width, 2);
  assert.equal(image.height, 2);
  assert.deepEqual(Array.from(image.data.subarray(0, 4)), [255, 0, 0, 255]);
  assert.deepEqual(Array.from(image.data.subarray(12, 16)), [10, 20, 30, 0]);
});

test("decodePng normalises RGB (no alpha) to RGBA with alpha 255", () => {
  const pixels = [{ r: 1, g: 2, b: 3 }, { r: 4, g: 5, b: 6 }];
  const png = encodeTestPng(2, 1, 2, pixels);
  const image = decodePng(png);
  assert.deepEqual(Array.from(image.data), [1, 2, 3, 255, 4, 5, 6, 255]);
});

test("decodePng normalises grey to RGBA by replicating the channel", () => {
  const pixels = [{ g: 128 }];
  const png = encodeTestPng(1, 1, 0, pixels);
  const image = decodePng(png);
  assert.deepEqual(Array.from(image.data), [128, 128, 128, 255]);
});

test("decodePng handles multiple rows and the Sub/Up/Paeth defilter path via a >1px image", () => {
  const pixels = Array.from({ length: 9 }, (_, i) => ({ r: i * 10, g: i * 10, b: i * 10, a: 255 }));
  const png = encodeTestPng(3, 3, 6, pixels);
  const image = decodePng(png);
  assert.equal(image.data[4 * 4], 40); // row 1, col 1 -> pixel index 4 -> value 40
});

test("decodePng rejects a bad signature", () => {
  assert.throws(() => decodePng(Buffer.from([1, 2, 3, 4])), /signature/);
});

test("decodePng rejects palette (colour type 3)", () => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(3, 9);
  const png = Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IEND", Buffer.alloc(0))]);
  assert.throws(() => decodePng(png), /colour type/);
});

test("decodePng rejects interlaced PNGs", () => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(1, 12); // Adam7
  const png = Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IEND", Buffer.alloc(0))]);
  assert.throws(() => decodePng(png), /interlaced/);
});

test("decodePng rejects bit depths other than 8", () => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr.writeUInt8(16, 8);
  ihdr.writeUInt8(6, 9);
  const png = Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IEND", Buffer.alloc(0))]);
  assert.throws(() => decodePng(png), /bit depth/);
});

// --- cropRegionPixels ----------------------------------------------------

const IMAGE_3X3 = {
  width: 3,
  height: 3,
  data: Buffer.from(
    Array.from({ length: 9 }, (_, i) => [i, i, i, 255]).flat(),
  ),
};

test("cropRegionPixels reads the requested rect row-major", () => {
  const pixels = cropRegionPixels(IMAGE_3X3, { left: 1, top: 0, right: 3, bottom: 1 });
  assert.deepEqual(pixels.map((p) => p.r), [1, 2]);
});

test("cropRegionPixels clamps a rect that overhangs the image bounds", () => {
  const pixels = cropRegionPixels(IMAGE_3X3, { left: -5, top: -5, right: 2, bottom: 2 });
  assert.equal(pixels.length, 4); // clamped to [0,2)x[0,2)
});

test("cropRegionPixels returns [] for a rect entirely outside the image", () => {
  assert.deepEqual(cropRegionPixels(IMAGE_3X3, { left: 10, top: 10, right: 20, bottom: 20 }), []);
});

test("cropRegionPixels returns [] for a zero-area rect", () => {
  assert.deepEqual(cropRegionPixels(IMAGE_3X3, { left: 1, top: 1, right: 1, bottom: 5 }), []);
});
