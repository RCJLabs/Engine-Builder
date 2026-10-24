/**
 * PNG in and out, in plain code so an icon is the same bytes in the browser and in Node
 * (docs/specs/export.md#icons; Dirtbag's app/build/pwa.ts encodes its own the same way). Reads
 * 8-bit, non-interlaced PNGs of every colour type; writes RGBA. A terrain's heights (M5.3, D65)
 * are 16-bit greyscale, read and written by encodeGray16 and decodeGray16.
 */
import { unzlibSync, zlibSync } from 'fflate';

/** An image as straight (not premultiplied) RGBA, 8 bits a channel, rows top to bottom. */
export interface Rgba {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A PNG of IHDR's depth and colour type around rows already filtered, each led by its filter byte. */
function pngOf(width: number, height: number, depth: number, colour: number, raw: Uint8Array, level: 6 | 9) {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([depth, colour, 0, 0, 0], 8);
  const parts = [
    new Uint8Array(SIGNATURE),
    chunk('IHDR', header),
    chunk('IDAT', zlibSync(raw, { level })),
    chunk('IEND', new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** RGBA as a PNG: every row filtered with "none", deflated at level 9. */
export function encodePng({ width, height, data }: Rgba): Uint8Array {
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return pngOf(width, height, 8, 6, raw, 9);
}

/** Greyscale at 16 bits a sample, rows top to bottom: a terrain's heights (M5.3). */
export interface Gray16 {
  readonly width: number;
  readonly height: number;
  readonly data: Uint16Array;
}

/**
 * 16-bit greyscale as a PNG, each row filtered with "sub" (each byte less the one a sample before):
 * a smooth heightmap's neighbours differ little, so it deflates far smaller than unfiltered. Level 6,
 * as a stroke writes it again each time it ends.
 */
export function encodeGray16({ width, height, data }: Gray16): Uint8Array {
  const stride = width * 2;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    raw[row] = 1;
    let before = 0;
    let beforeLow = 0;
    for (let x = 0; x < width; x++) {
      const v = data[y * width + x] as number;
      const high = v >> 8;
      const low = v & 0xff;
      raw[row + 1 + x * 2] = (high - before) & 0xff;
      raw[row + 2 + x * 2] = (low - beforeLow) & 0xff;
      before = high;
      beforeLow = low;
    }
  }
  return pngOf(width, height, 16, 0, raw, 6);
}

/** A 16-bit greyscale PNG's samples, or an error that says what it is instead. */
export function decodeGray16(bytes: Uint8Array): Gray16 {
  const { header, data } = readChunks(bytes);
  if (header.depth !== 16 || header.colour !== 0 || header.interlace !== 0) {
    throw new Error('Heights are a 16-bit greyscale PNG, not interlaced');
  }
  const raw = unfilter(unzlibSync(data), header.width, header.height, 2);
  const out = new Uint16Array(header.width * header.height);
  for (let i = 0; i < out.length; i++) out[i] = ((raw[i * 2] as number) << 8) | (raw[i * 2 + 1] as number);
  return { width: header.width, height: header.height, data: out };
}

interface Header {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly colour: number;
  readonly interlace: number;
}

/** A PNG's header, palette, transparency and image data joined, or an error. */
function readChunks(bytes: Uint8Array): {
  header: Header;
  palette?: Uint8Array;
  transparency?: Uint8Array;
  data: Uint8Array;
} {
  if (!SIGNATURE.every((b, i) => bytes[i] === b)) throw new Error('It isn’t a PNG file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  let header: Header | undefined;
  let palette: Uint8Array | undefined;
  let transparency: Uint8Array | undefined;
  const data: Uint8Array[] = [];
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: view.getUint32(at + 8),
        height: view.getUint32(at + 12),
        depth: body[8] as number,
        colour: body[9] as number,
        interlace: body[12] as number,
      };
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') transparency = body;
    else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  if (!header) throw new Error('The PNG has no header');
  const joined = new Uint8Array(data.reduce((n, d) => n + d.length, 0));
  let offset = 0;
  for (const d of data) {
    joined.set(d, offset);
    offset += d.length;
  }
  return { header, ...(palette ? { palette } : {}), ...(transparency ? { transparency } : {}), data: joined };
}

// Samples a pixel of each colour type has.
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** A PNG's pixels, or an error that says what to save it as instead. */
export function decodePng(bytes: Uint8Array): Rgba {
  const { header, palette, transparency, data } = readChunks(bytes);
  const channels = CHANNELS[header.colour];
  if (header.depth !== 8 || channels === undefined || header.interlace !== 0) {
    throw new Error('Save it as an 8-bit PNG (RGB or RGBA), not interlaced');
  }
  const raw = unfilter(unzlibSync(data), header.width, header.height, channels);
  return { width: header.width, height: header.height, data: toRgba(raw, header.colour, palette, transparency) };
}

function unfilter(raw: Uint8Array, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp;
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] as number;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? (out[y * stride + x - bpp] as number) : 0;
      const b = y > 0 ? (out[(y - 1) * stride + x] as number) : 0;
      const c = x >= bpp && y > 0 ? (out[(y - 1) * stride + x - bpp] as number) : 0;
      const v = line[x] as number;
      const predicted =
        filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? paeth(a, b, c) : 0;
      out[y * stride + x] = (v + predicted) & 0xff;
    }
  }
  return out;
}

function toRgba(raw: Uint8Array, colour: number, palette?: Uint8Array, transparency?: Uint8Array): Uint8Array {
  const pixels = raw.length / (CHANNELS[colour] as number);
  const out = new Uint8Array(pixels * 4);
  for (let i = 0; i < pixels; i++) {
    let rgba: [number, number, number, number];
    if (colour === 6) rgba = [raw[i * 4], raw[i * 4 + 1], raw[i * 4 + 2], raw[i * 4 + 3]] as typeof rgba;
    else if (colour === 2) rgba = [raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2], 255] as typeof rgba;
    else if (colour === 4) rgba = [raw[i * 2], raw[i * 2], raw[i * 2], raw[i * 2 + 1]] as typeof rgba;
    else if (colour === 0) rgba = [raw[i], raw[i], raw[i], 255] as typeof rgba;
    else {
      const index = raw[i] as number;
      rgba = [
        palette?.[index * 3] ?? 0,
        palette?.[index * 3 + 1] ?? 0,
        palette?.[index * 3 + 2] ?? 0,
        transparency?.[index] ?? 255,
      ];
    }
    out.set(rgba, i * 4);
  }
  return out;
}
