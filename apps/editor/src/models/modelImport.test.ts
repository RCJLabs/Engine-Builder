/**
 * The import's plan for models (M5.5, D67, docs/specs/models.md#import): models to GLBs in models/,
 * a .gltf's files folded into its GLB, what can't go said before it is tried, and the record each
 * model starts as.
 */
import { describe, expect, it } from 'vitest';
import { gltfNames, LOD_START, modelRecordOf, pickBlocked, planPick, rigOf, stemOf } from './modelImport.ts';

const MB = 1024 * 1024;
const file = (name: string, size = 100) => ({ name, size });
const box = { shape: 'box', center: [0, 0.5, 0], size: [1, 1, 1] } as const;

describe('a .gltf’s names', () => {
  it('lists its buffers’ and images’ files, decoded, data: URIs aside', () => {
    const text = JSON.stringify({
      asset: { version: '2.0' },
      buffers: [{ uri: 'ship%20hull.bin', byteLength: 4 }, { uri: 'data:application/octet-stream;base64,AAAA' }],
      images: [{ uri: 'textures/paint.ktx2' }, { bufferView: 0, mimeType: 'image/png' }],
    });
    expect(gltfNames(text)).toEqual(['ship hull.bin', 'textures/paint.ktx2']);
  });

  it('throws for text that isn’t JSON', () => {
    expect(() => gltfNames('glTF')).toThrow();
  });
});

describe('planning a pick with models in it', () => {
  it('folds the files a .gltf names into its GLB, found by path or name, and plans the rest as any import', () => {
    const gltf = file('ship.gltf');
    const bin = file('ship.bin');
    const paint = file('paint.ktx2');
    const icon = file('icon.png');
    const plan = planPick([gltf, bin, paint, icon], new Map([[gltf, ['ship.bin', 'textures/paint.ktx2']]]), '', []);
    expect(plan.models).toEqual([{ file: gltf, beside: [bin, paint], path: 'models/ship.glb', refused: null }]);
    expect(plan.others.map((p) => p.path)).toEqual(['images/icon.png']);
  });

  it('never lands on a path that is taken, nor on another model’s', () => {
    const plan = planPick([file('Crate.glb'), file('props/crate.gltf')], new Map(), 'props', ['props/crate.glb']);
    expect(plan.models.map((m) => m.path)).toEqual(['props/Crate-2.glb', 'props/crate-3.glb']);
  });

  it('refuses a .gltf whose files weren’t picked, or that can’t be read, saying why', () => {
    const lost = file('lost.gltf');
    const broken = file('broken.gltf');
    const plan = planPick(
      [lost, broken],
      new Map<typeof lost, readonly string[] | string>([
        [lost, ['lost.bin', 'skin.png']],
        [broken, 'Unexpected token'],
      ]),
      '',
      [],
    );
    expect(plan.models.map((m) => m.refused)).toEqual([
      'It needs lost.bin, skin.png beside it: pick them with the model',
      'It can’t be read: Unexpected token',
    ]);
    expect(pickBlocked(plan)).toBe('None of these files can be imported.');
  });

  it('holds a model and its files together to 25 MB, and a pick to 50 MB', () => {
    const gltf = file('big.gltf', MB);
    const bin = file('big.bin', 24.5 * MB);
    const big = planPick([gltf, bin], new Map([[gltf, ['big.bin']]]), '', []);
    expect(big.models[0]?.refused).toBe('Too big: 26 MB, and the most is 25 MB');
    const many = planPick([file('a.glb', 20 * MB), file('b.glb', 20 * MB), file('c.png', 11 * MB)], new Map(), '', []);
    expect(many.models.map((m) => m.refused)).toEqual([null, null]);
    expect(pickBlocked(many)).toBe('These come to 51 MB, and the most at once is 50 MB: import fewer.');
  });
});

describe('a model’s first record', () => {
  it('is named for the file, with its GLB and the box fitted to it', () => {
    expect(stemOf('props/Old Crate.gltf')).toBe('Old Crate');
    expect(
      modelRecordOf('props/Old Crate.gltf', 'models/Old Crate.glb', { triangles: 12, collider: box }, new Set()),
    ).toEqual({
      id: 'old-crate',
      value: { name: 'Old Crate', file: 'models/Old Crate.glb', collider: box },
    });
  });

  it('has LOD levels over 1,000 triangles, and none at 1,000', () => {
    const at = (triangles: number) =>
      modelRecordOf('rock.glb', 'models/rock.glb', { triangles, collider: box }, new Set());
    expect(at(1000).value.lod).toBeUndefined();
    expect(at(1001).value.lod).toEqual(LOD_START);
  });

  it('starts a model on the rig with its bones and its clips, paced, and no LOD (M6.5)', () => {
    const rig = {
      rigged: true,
      bones: { hips: 'mixamorig:Hips', head: 'mixamorig:Head' },
      missing: [],
      clips: [
        { name: 'walk', length: 1, pace: 1.4 },
        { name: 'idle', length: 2, pace: 0 },
      ],
    };
    const record = modelRecordOf('hero.glb', 'models/hero.glb', { triangles: 5000, collider: box, rig }, new Set());
    expect(record.value.rig).toEqual({ bones: rig.bones });
    expect(record.value.clips).toEqual([
      { name: 'walk', length: 1, pace: 1.4 },
      { name: 'idle', length: 2 },
    ]);
    expect(record.value.lod).toBeUndefined();
    // One whose required bones weren't all found gets neither: W152 says so.
    expect(rigOf({ ...rig, rigged: false, missing: ['head'] })).toEqual({});
    expect(rigOf(null)).toEqual({});
  });

  it('takes the first free id, and "model" for a name with no letter or digit', () => {
    const taken = new Set(['rock', 'rock-2', 'model']);
    expect(modelRecordOf('rock.glb', 'models/rock-3.glb', { triangles: 1, collider: box }, taken).id).toBe('rock-3');
    expect(modelRecordOf('___.glb', 'models/___.glb', { triangles: 1, collider: box }, taken).id).toBe('model-2');
  });
});
