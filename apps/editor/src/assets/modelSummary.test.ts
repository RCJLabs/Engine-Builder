import { describe, expect, it } from 'vitest';
import { LIMITS, mimeOf, sizeText, today } from './media.ts';
import { modelSummary } from './modelSummary.ts';

const encode = (text: string) => new TextEncoder().encode(text);

/** A .glb: the header, then the JSON chunk padded with spaces to four bytes, as the format asks. */
function glb(json: unknown): Uint8Array {
  let text = JSON.stringify(json);
  while (text.length % 4 !== 0) text += ' ';
  const body = encode(text);
  const out = new Uint8Array(20 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, body.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(body, 20);
  return out;
}

const SHIP = {
  asset: { version: '2.0' },
  accessors: [{ count: 36 }, { count: 24 }, { count: 10 }],
  meshes: [
    {
      primitives: [
        { attributes: { POSITION: 1 }, indices: 0 },
        { attributes: { POSITION: 2 }, mode: 5 },
      ],
    },
    { primitives: [{ attributes: { POSITION: 1 } }, { attributes: { POSITION: 1 }, mode: 1 }] },
  ],
  materials: [{}, {}],
  textures: [{}],
  animations: [{}],
  nodes: [{}, {}, {}],
  buffers: [{ uri: 'ship.bin' }, { uri: 'data:application/octet-stream;base64,AAAA' }],
  images: [{ uri: '../textures/hull%20plate.png' }, { uri: '../../outside.png' }],
};

describe('model summaries', () => {
  it('counts what a .glb holds, triangles over every kind of primitive', () => {
    expect(modelSummary('models/ship.glb', glb(SHIP), new Set())).toMatchObject({
      format: 'glb',
      version: '2.0',
      meshes: 2,
      // 36 indices (12), a strip of 10 (8), 24 positions (8); lines draw none.
      triangles: 28,
      materials: 2,
      textures: 1,
      animations: 1,
      nodes: 3,
    });
  });

  it('names the files a .gltf needs beside it, and which are there', () => {
    const summary = modelSummary('models/ship.gltf', encode(JSON.stringify(SHIP)), new Set(['models/ship.bin']));
    expect(typeof summary === 'string' ? summary : summary.external).toEqual([
      { path: 'models/ship.bin', found: true },
      { path: 'textures/hull plate.png', found: false },
      { path: '../../outside.png', found: false },
    ]);
  });

  it('says why a model can’t be read', () => {
    expect(modelSummary('a.glb', encode('not a model at all'), new Set())).toBe(
      'Not a .glb file: it doesn’t start with glTF',
    );
    expect(modelSummary('a.gltf', encode('{'), new Set())).toBe('Its JSON can’t be read');
    expect(modelSummary('a.gltf', encode('[]'), new Set())).toBe('Its JSON isn’t a glTF object');
    const cut = glb(SHIP).subarray(0, 40);
    expect(modelSummary('a.glb', cut, new Set())).toBe('Its JSON chunk is missing');
  });
});

describe('media', () => {
  it('types files by extension, in either case', () => {
    expect(mimeOf('a/B.SVG')).toBe('image/svg+xml');
    expect(mimeOf('theme.opus')).toBe('audio/ogg');
    expect(mimeOf('font.woff2')).toBe('font/woff2');
    expect(mimeOf('README')).toBe('application/octet-stream');
  });

  it('says sizes in plain words', () => {
    expect([1, 512, 1024, 1536, 10 * 1024, 3.4 * 1024 * 1024, LIMITS.file].map(sizeText)).toEqual([
      '1 byte',
      '512 bytes',
      '1 KB',
      '1.5 KB',
      '10 KB',
      '3.4 MB',
      '25 MB',
    ]);
  });

  it('writes today as the log writes dates', () => {
    expect(today(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
