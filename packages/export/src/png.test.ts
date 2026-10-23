import { zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { iconFiles, onGround, readIcon, scaled } from './icons.ts';
import { decodePng, encodePng, type Rgba } from './png.ts';

/** A test's own PNG writer: any colour type and depth, each row with the filter named, as other tools write them. */
function png(
  width: number,
  height: number,
  colour: number,
  rows: number[][],
  filters: number[],
  depth = 8,
): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of bytes) c = (crcTable[(c ^ b) & 0xff] as number) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[colour] as number;
  const raw: number[] = [];
  rows.forEach((row, y) => {
    const f = filters[y % filters.length] as number;
    raw.push(f);
    row.forEach((v, x) => {
      const a = x >= bpp ? (row[x - bpp] as number) : 0;
      const b = y > 0 ? (rows[y - 1]?.[x] as number) : 0;
      const c = x >= bpp && y > 0 ? (rows[y - 1]?.[x - bpp] as number) : 0;
      const p = a + b - c;
      const paeth =
        Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
          ? a
          : Math.abs(p - b) <= Math.abs(p - c)
            ? b
            : c;
      const predicted = [0, a, b, (a + b) >> 1, paeth][f] as number;
      raw.push((v - predicted) & 0xff);
    });
  });
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, width);
  new DataView(header.buffer).setUint32(4, height);
  header.set([depth, colour, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlibSync(new Uint8Array(raw))),
    chunk('IEND', new Uint8Array()),
  ];
  return new Uint8Array(parts.flatMap((p) => [...p]));
}

const gradient = (size: number): Rgba => {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) data.set([x % 256, y % 256, (x + y) % 256, 255], (y * size + x) * 4);
  return { width: size, height: size, data };
};

describe('PNG (M4.10)', () => {
  it('reads back what it writes', () => {
    const image = gradient(20);
    expect(decodePng(encodePng(image))).toEqual(image);
  });

  it('reads RGB and grey PNGs whose rows use every filter, as other tools write them', () => {
    const rgbRows = [
      [10, 20, 30, 40, 50, 60, 70, 80, 90],
      [200, 100, 50, 25, 12, 6, 3, 1, 0],
      [5, 250, 5, 250, 5, 250, 5, 250, 5],
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [255, 0, 255, 0, 255, 0, 255, 0, 255],
    ];
    const rgb = decodePng(png(3, 5, 2, rgbRows, [0, 1, 2, 3, 4]));
    expect([...rgb.data.subarray(0, 12)]).toEqual([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255]);
    expect([...rgb.data.subarray(48, 60)]).toEqual([255, 0, 255, 255, 0, 255, 0, 255, 255, 0, 255, 255]);
    const grey = decodePng(
      png(
        2,
        2,
        4,
        [
          [9, 255, 99, 128],
          [1, 0, 2, 64],
        ],
        [4, 3],
      ),
    );
    expect([...grey.data]).toEqual([9, 9, 9, 255, 99, 99, 99, 128, 1, 1, 1, 0, 2, 2, 2, 64]);
  });

  it('refuses 16-bit, and what isn’t a PNG, saying what to save instead', () => {
    expect(() => decodePng(png(1, 1, 6, [[0, 0, 0, 0, 0, 0, 0, 0]], [0], 16))).toThrow('Save it as an 8-bit PNG');
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow('It isn’t a PNG file');
  });
});

describe('icons from a project’s PNG (M4.10)', () => {
  it('must be square and at least 512 px', () => {
    expect(() => readIcon(encodePng(gradient(256)))).toThrow('It is 256 px: an icon must be at least 512 px');
    const wide = { width: 600, height: 512, data: new Uint8Array(600 * 512 * 4) };
    expect(() => readIcon(encodePng(wide))).toThrow('It is 600×512: an icon must be square');
  });

  it('scale down by averaging, a flat colour staying itself and a clear edge not darkening it', () => {
    const flat = { width: 4, height: 4, data: new Uint8Array(64).fill(200) };
    expect([...scaled(flat, 3).data.subarray(0, 4)]).toEqual([200, 200, 200, 200]);
    // Half clear, half opaque red: the mean is half-clear red, not half-dark red.
    const edge = { width: 2, height: 1, data: new Uint8Array([0, 0, 0, 0, 255, 0, 0, 255]) };
    expect([...scaled({ ...edge, height: 1 }, 1).data]).toEqual([255, 0, 0, 128]);
  });

  it('sit inside the middle 80% of the maskable one, on the background', () => {
    const red = {
      width: 10,
      height: 10,
      data: new Uint8Array(400).map((_, i) => (i % 4 === 0 || i % 4 === 3 ? 255 : 0)),
    };
    const masked = onGround(red, 10, '#0000ff');
    expect([...masked.data.subarray(0, 4)]).toEqual([0, 0, 255, 255]);
    expect([...masked.data.subarray((5 * 10 + 5) * 4, (5 * 10 + 5) * 4 + 4)]).toEqual([255, 0, 0, 255]);
    const files = iconFiles(readIcon(encodePng(gradient(512))), {
      background: '#000000',
      theme: '#000000',
      accent: '#ffffff',
    });
    expect(decodePng(files.get('icons/icon-192.png') as Uint8Array).width).toBe(192);
  });
});
