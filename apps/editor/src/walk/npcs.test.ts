/**
 * NPCs as plain values (M6.1, D73, docs/specs/npcs.md#the-look): an actor's figure through its
 * placement's overrides, its height held to 0.5–2.5 m, and in the walk its capsule and its Talk at
 * its chest; one drawn as a model keeps its model's collider.
 */
import { describe, expect, it } from 'vitest';
import { chestOf, FIGURE, figureOf, figuresFrom, heightOf, npcsFrom } from '../spaces/figureLook.ts';
import { partsOf } from './solids.ts';

const at = (x: number, y: number, z: number): [number, number, number] => [x, y, z];

describe('an NPC’s look', () => {
  it('draws an actor with no model as the figure, its colours and height its own or the engine’s', () => {
    const ada = { name: 'Ada', figure: { height: 1.6, clothes: '#7a4a2a' } };
    expect(figureOf('actor:smith', ada, [])).toEqual({
      height: 1.6,
      clothes: '#7a4a2a',
      trim: FIGURE.trim,
      skin: FIGURE.skin,
    });
    expect(figureOf('actor:smith', { name: 'Ada' }, [])).toEqual({
      height: FIGURE.height,
      clothes: FIGURE.clothes,
      trim: FIGURE.trim,
      skin: FIGURE.skin,
    });
    // A colour that isn't one is the engine's, as the schema would refuse it.
    expect(figureOf('actor:smith', { figure: { skin: 'pink' } }, [])?.skin).toBe(FIGURE.skin);
  });

  it('draws one naming a model as its model, and nothing that isn’t an actor as a figure', () => {
    expect(figureOf('actor:warden', { model: 'kit-pillar', figure: { height: 2.5 } }, [])).toBeNull();
    expect(figureOf('item:horseshoe', { name: 'Horseshoe' }, [])).toBeNull();
    // Its height is still its figure's: where its Talk is measured from.
    expect(heightOf({ model: 'kit-pillar', figure: { height: 2.5 } }, [])).toBe(2.5);
  });

  it('holds the height to 0.5–2.5 m, and reads it through what the placement overrides', () => {
    expect(heightOf({ figure: { height: 9 } }, [])).toBe(FIGURE.highest);
    expect(heightOf({ figure: { height: 0.1 } }, [])).toBe(FIGURE.lowest);
    expect(heightOf({ figure: { height: 'tall' } }, [])).toBe(FIGURE.height);
    const passed = [{ figure: { height: 1.2, trim: '#000000' } }];
    expect(figureOf('actor:smith', { figure: { height: 1.9 } }, passed)).toMatchObject({
      height: 1.2,
      trim: '#000000',
    });
    // An override that names a model draws it as one.
    expect(figureOf('actor:smith', {}, [{ model: 'kit-pillar' }])).toBeNull();
  });

  it('looks each record up by its key, and an NPC carries its height drawn either way', () => {
    const records: Record<string, unknown> = {
      'actor:smith': { figure: { height: 1.5 } },
      'actor:warden': { model: 'kit-pillar' },
    };
    const look = figuresFrom((key) => records[key]);
    expect(look('actor:smith', [])?.height).toBe(1.5);
    expect(look('flag:met', [])).toBeNull();
    const npcs = npcsFrom((key) => records[key]);
    expect(npcs('actor:warden', [])).toEqual({ figure: null, height: FIGURE.height, animator: null });
    // Its animator, through what its placement overrides (M6.5).
    expect(npcs('actor:warden', [{ animator: 'slow' }])?.animator).toBe('slow');
    expect(npcs('flag:met', [])).toBeNull();
    expect(chestOf(1.5)).toBe(1);
  });
});

describe('an NPC in the walk', () => {
  const records: Record<string, unknown> = {
    'actor:smith': { figure: { height: 1.5 } },
    'actor:warden': { model: 'kit-pillar' },
    'actor:drover': {},
    'actor:bell': {},
  };
  const space = {
    name: 'Ford',
    objects: [
      { id: 'smith', record: 'actor:smith', at: at(2, 1, 0) },
      { id: 'warden', record: 'actor:warden', at: at(-2, 0, 0), scale: at(1, 2, 1) },
      { id: 'drover', record: 'actor:drover', at: at(0, 0, 4) },
      { id: 'bell', record: 'actor:bell', at: at(0, 0, -4), components: { interact: { label: 'Ring', effects: [] } } },
    ],
  };
  const models = (key: string) =>
    key === 'actor:warden' ? { collider: { shape: 'box' as const, center: at(0, 1, 0), size: at(1, 2, 1) } } : null;
  const uses = new Map([
    ['smith', 'Talk'],
    ['warden', 'Talk'],
    ['bell', 'Ring'],
  ]);
  const parts = partsOf(
    space as never,
    new Map(),
    models,
    new Set(),
    uses,
    npcsFrom((key) => records[key]),
  );

  it('stands a figure on a fixed capsule its height tall, and one drawn as a model on its collider', () => {
    expect(parts.solids.map((s) => [s.path, s.kind])).toEqual([
      ['smith', 'capsule'],
      ['warden', 'box'],
      ['drover', 'capsule'],
      ['bell', 'capsule'],
    ]);
    expect(parts.solids[0]).toMatchObject({ center: [2, 1.75, 0], radius: FIGURE.radius, moves: false });
    const capsule = parts.solids[0] as { halfHeight: number; radius: number };
    expect(capsule.halfHeight + capsule.radius).toBeCloseTo(0.75, 9);
  });

  it('puts its Talk at its chest, scaled with it; an interact of its own where interacts are, and none without', () => {
    const byPath = Object.fromEntries(parts.uses.map((u) => [u.path, u]));
    expect(byPath.smith).toEqual({ path: 'smith', center: [2, 2, 0], label: 'Talk' });
    // The pillar is scaled 2 tall: its chest is 2/3 of 1.75 m twice over.
    expect(byPath.warden?.center[1]).toBeCloseTo((1.75 * 2 * 2) / 3, 9);
    expect(byPath.bell?.label).toBe('Ring');
    expect(byPath.bell?.center[1]).not.toBeCloseTo(chestOf(FIGURE.height), 3);
    expect(byPath.drover).toBeUndefined();
    expect(parts.uses).toHaveLength(3);
  });
});
