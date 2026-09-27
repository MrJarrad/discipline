// Minimal PNG decoder + region cropper for media-load-probe.mjs — reads
// exactly what Playwright's `page.screenshot()` produces (8-bit depth,
// non-interlaced, colour type 0/2/4/6 — grey / RGB / grey+alpha / RGBA), with
// only Node's built-in `zlib` for the deflate stream. No image-processing
// dependency: `mechanical over AI` prefers a repo-wide `npm i -D playwright`
// over adding a second package (`sharp`/`pngjs`) to every consuming repo just
// to read the probe's own screenshots. Anything outside that shape (palette
// images, >8-bit depth, interlacing) throws a named error rather than
// silently misreading pixels — this is not a general-purpose PNG library.
import { inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS_BY_COLOR_TYPE = { 0: 1, 2: 3, 4: 2, 6: 4 };

function readChunks(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error("Not a PNG (bad signature)");
  }
  const chunks = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 12 + length; // length(4) + type(4) + data(length) + crc(4) — CRC is not verified
  }
  return chunks;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// Standard PNG scanline defiltering (bit depth 8 only: 1 byte/channel).
function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filterType = raw[y * (stride + 1)];
    const srcRow = y * (stride + 1) + 1;
    const dstRow = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[srcRow + i];
      const a = i >= bpp ? out[dstRow + i - bpp] : 0;
      const b = y > 0 ? out[dstRow - stride + i] : 0;
      const c = y > 0 && i >= bpp ? out[dstRow - stride + i - bpp] : 0;
      let value;
      switch (filterType) {
        case 0:
          value = x;
          break;
        case 1:
          value = x + a;
          break;
        case 2:
          value = x + b;
          break;
        case 3:
          value = x + Math.floor((a + b) / 2);
          break;
        case 4:
          value = x + paeth(a, b, c);
          break;
        default:
          throw new Error(`Unsupported PNG filter type ${filterType}`);
      }
      out[dstRow + i] = value & 0xff;
    }
  }
  return out;
}

// Normalises any supported colour type to flat RGBA (4 bytes/pixel) so the
// crop/classify code never branches on source channel count.
function toRgba(pixels, width, height, colorType) {
  const channels = CHANNELS_BY_COLOR_TYPE[colorType];
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    const d = i * 4;
    if (colorType === 0) {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = pixels[s];
      rgba[d + 3] = 255;
    } else if (colorType === 2) {
      rgba[d] = pixels[s];
      rgba[d + 1] = pixels[s + 1];
      rgba[d + 2] = pixels[s + 2];
      rgba[d + 3] = 255;
    } else if (colorType === 4) {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = pixels[s];
      rgba[d + 3] = pixels[s + 1];
    } else {
      // colorType === 6
      rgba[d] = pixels[s];
      rgba[d + 1] = pixels[s + 1];
      rgba[d + 2] = pixels[s + 2];
      rgba[d + 3] = pixels[s + 3];
    }
  }
  return rgba;
}

// Decodes a PNG buffer to `{ width, height, data }`, `data` a flat RGBA
// Buffer (4 bytes/pixel, row-major). Throws on anything this decoder does
// not support (see file header) rather than guessing.
export function decodePng(buffer) {
  const chunks = readChunks(buffer);
  const ihdr = chunks.find((c) => c.type === "IHDR");
  if (!ihdr) throw new Error("PNG missing IHDR chunk");
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data.readUInt8(8);
  const colorType = ihdr.data.readUInt8(9);
  const interlace = ihdr.data.readUInt8(12);
  if (bitDepth !== 8) {
    throw new Error(`Unsupported PNG bit depth ${bitDepth} (only 8-bit screenshots are supported)`);
  }
  if (interlace !== 0) {
    throw new Error("Unsupported interlaced PNG");
  }
  if (!(colorType in CHANNELS_BY_COLOR_TYPE)) {
    throw new Error(`Unsupported PNG colour type ${colorType} (indexed/palette images are not supported)`);
  }
  const idat = Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data));
  const raw = inflateSync(idat);
  const bpp = CHANNELS_BY_COLOR_TYPE[colorType];
  const filtered = unfilter(raw, width, height, bpp);
  const data = toRgba(filtered, width, height, colorType);
  return { width, height, data };
}

// Crops an integer-pixel rect out of a decoded RGBA image, clamped to the
// image bounds, into a flat array of `{r,g,b,a}` — the shape the paint
// classifier in `media-load-lib.mjs` consumes. A rect with no on-image area
// (fully out of bounds, or zero/negative width or height) returns `[]`.
export function cropRegionPixels(image, rect) {
  const left = Math.max(0, Math.floor(rect.left));
  const top = Math.max(0, Math.floor(rect.top));
  const right = Math.min(image.width, Math.ceil(rect.right));
  const bottom = Math.min(image.height, Math.ceil(rect.bottom));
  const pixels = [];
  if (right <= left || bottom <= top) return pixels;
  for (let y = top; y < bottom; y++) {
    const rowOffset = y * image.width;
    for (let x = left; x < right; x++) {
      const i = (rowOffset + x) * 4;
      pixels.push({ r: image.data[i], g: image.data[i + 1], b: image.data[i + 2], a: image.data[i + 3] });
    }
  }
  return pixels;
}
