/**
 * A building against itself and its space (M7.3, D85, docs/specs/rooms.md#a-building): each of E094's
 * problems at its room, its stair or its field, W158's floors no stair reaches, and format 19's building
 * as packed: its rooms by id, its stairs, the climb, and each object's floor and x.
 */
import { describe, expect, it } from 'vitest';
import {
  type BuildingFields,
  buildingProblems,
  checkBuildingSpace,
  floorsReached,
  packBuildingOf,
} from './buildings.ts';
import type { SpaceJson } from './spaceShape.ts';

const room = (id: string, floor: number, slot: number, span?: number) => ({
  id,
  room: 'hall',
  floor,
  slot,
  ...(span === undefined ? {} : { span }),
});

const TOWER: BuildingFields = {
  slot: [48, 24],
  slots: 2,
  floors: 3,
  rooms: [room('crypt', 0, 0), room('store', 0, 1), room('hall', 1, 0, 2), room('watch', 2, 1)],
  stairs: [
    { floor: 0, x: 12 },
    { floor: 1, x: 84 },
  ],
  stair: 'ladder',
};

describe('a building’s problems (E094)', () => {
  it('are none for rooms and stairs that fit', () => {
    expect(buildingProblems(TOWER)).toEqual([]);
  });

  it('are a room past its floors or slots, on another’s slot, or with another’s id', () => {
    const with_ = (rooms: BuildingFields['rooms']) => buildingProblems({ ...TOWER, rooms });
    expect(with_([room('attic', 3, 0)])).toEqual([['/rooms/0/floor', 'The building has floors 0 to 2']]);
    expect(with_([room('wing', 0, 1, 2)])).toEqual([['/rooms/0', 'It runs to slot 2: a floor has slots 0 to 1']]);
    expect(with_([room('hall', 1, 0, 2), room('nook', 1, 1)])).toEqual([
      ['/rooms/1', 'It is on floor 1, slot 1, which “hall” takes'],
    ]);
    expect(with_([room('crypt', 0, 0), room('crypt', 1, 0)])).toEqual([
      ['/rooms/1/id', 'Another room is “crypt”: a room’s id is its own'],
    ]);
  });

  it('are a stair from the top floor or past the building’s width, and stairs with no sprite', () => {
    const with_ = (stairs: BuildingFields['stairs']) => buildingProblems({ ...TOWER, stairs });
    expect(with_([{ floor: 2, x: 0 }])).toEqual([
      ['/stairs/0/floor', 'A stair climbs from a floor to the one above: the top floor is 2'],
    ]);
    expect(with_([{ floor: 0, x: 96 }])).toEqual([['/stairs/0/x', 'The building is 96 art pixels wide']]);
    expect(with_([{ floor: 0, x: 95 }])).toEqual([]);
    const { stair: _, ...bare } = TOWER;
    expect(buildingProblems(bare)).toEqual([['/stair', 'It has stairs and no sprite to draw them with']]);
    expect(buildingProblems({ ...bare, stairs: [] })).toEqual([]);
  });
});

describe('the floors the ground reaches', () => {
  it('are each floor a stair climbs to from one reached, and no further', () => {
    expect([...floorsReached(TOWER)].sort()).toEqual([0, 1, 2]);
    expect([...floorsReached({ floors: 3, stairs: [{ floor: 1, x: 0 }] })]).toEqual([0]);
    // Listed top first, the climb is still found.
    expect([...floorsReached({ floors: 3, stairs: [...TOWER.stairs].reverse() })].sort()).toEqual([0, 1, 2]);
  });
});

const space = (objects: SpaceJson['objects']): SpaceJson => ({ name: 'Tower', view: '2d', objects }) as SpaceJson;

describe('a space’s building', () => {
  it('is one, not beside a tilemap, and warns of each floor with a room no stair reaches (W158)', () => {
    const tower = { id: 'tower', shape: 'box', components: { building: { ...TOWER, stairs: [] } } };
    const codes = (objects: unknown[]) =>
      checkBuildingSpace('spaces/tower.json', space(objects as SpaceJson['objects']), {}).map(
        (d) => `${d.code} ${d.path} ${d.message}`,
      );
    expect(codes([tower])).toEqual([
      'W158 /objects/0/components/building/stairs No stair reaches floor 1 from the ground: its rooms can’t be walked to',
      'W158 /objects/0/components/building/stairs No stair reaches floor 2 from the ground: its rooms can’t be walked to',
    ]);
    const deck = { id: 'deck', shape: 'box', components: { tilemap: { tileset: 'deck', size: [1, 1], layers: [] } } };
    const again = { id: 'again', shape: 'box', components: { building: TOWER } };
    expect(codes([{ ...tower, components: { building: TOWER } }, again, deck])).toEqual([
      'E094 /objects/1/components/building A space has one building: “tower” is its first',
      'E094 /objects/0/components/building A space has a building or a tilemap, not both: “deck” is its tilemap',
    ]);
  });
});

describe('format 19’s building', () => {
  it('is the space’s first, its rooms by id, its climb a floor’s height unless set, and where each object stands', () => {
    const packed = packBuildingOf(
      space([
        { id: 'tower', shape: 'box', at: [32, 8, 0], components: { building: TOWER } },
        { id: 'bell', shape: 'box', at: [82.5, 40, 1] },
        { id: 'warden', shape: 'box', at: [130, 60, 1] },
        { id: 'below', shape: 'box', at: [40, 0, 1] },
      ] as SpaceJson['objects']),
      {},
    );
    expect(packed).toEqual({
      object: 'tower',
      at: [32, 8],
      slot: [48, 24],
      slots: 2,
      floors: 3,
      climb: 24,
      rooms: { crypt: [0, 0, 1], hall: [1, 0, 2], store: [0, 1, 1], watch: [2, 1, 1] },
      stairs: [
        [0, 12],
        [1, 84],
      ],
      places: { bell: [1, 50] },
    });
    expect(Object.keys(packed?.rooms ?? {})).toEqual(['crypt', 'hall', 'store', 'watch']);
    const steep = packBuildingOf(
      space([{ id: 't', shape: 'box', components: { building: { ...TOWER, climb: 9 } } }]),
      {},
    );
    expect(steep?.climb).toBe(9);
  });

  it('is none for a space with no building, or one beside a tilemap', () => {
    expect(packBuildingOf(space([{ id: 'crate', shape: 'box' }] as SpaceJson['objects']), {})).toBeUndefined();
    const deck = { id: 'deck', shape: 'box', components: { tilemap: { tileset: 'deck', size: [1, 1], layers: [] } } };
    const tower = { id: 'tower', shape: 'box', components: { building: TOWER } };
    expect(packBuildingOf(space([tower, deck] as SpaceJson['objects']), {})).toBeUndefined();
  });
});
