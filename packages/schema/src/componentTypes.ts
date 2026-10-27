/**
 * The engine's component kinds (M5.2, D64, docs/specs/components.md): what an object in a space can
 * carry, each a type file as a project's own kinds in components/ are, so a kind's form is drawn
 * and its fields checked as a record's are. Nothing runs them until M5.8, which fills in what a
 * file leaves out: a light is white, of intensity 1 and range 10 m; a collider a still box; a sound
 * plays at volume 1 to 10 m; water is #3a6d8c, of clarity 0.6 (M5.3). A sprite and a parallax
 * layer are a 2D space's (M7.1, D83), and so are a tilemap (M7.2, D84) and a building (M7.3, D85).
 */
import type { TypeFile } from './typeFile.ts';
import { type DataType, typeFromFile } from './typeSchema.ts';

const metres = (label: string, description: string) =>
  ({ kind: 'number', optional: true, min: 0.1, max: 1000, label, description }) as const;

const KINDS: Readonly<Record<string, TypeFile>> = {
  light: {
    title: 'Light',
    description: 'A point light at the object.',
    fields: {
      color: { kind: 'colour', optional: true, label: 'Colour', description: 'White when left out' },
      intensity: {
        kind: 'number',
        optional: true,
        min: 0,
        max: 100,
        label: 'Intensity',
        description: '1 when left out',
      },
      range: metres('Range, in metres', 'How far it reaches: 10 m when left out'),
    },
  },
  collider: {
    title: 'Collider',
    description: 'Something solid, the size of the object.',
    fields: {
      shape: {
        kind: 'enum',
        values: ['box', 'sphere', 'capsule'],
        optional: true,
        label: 'Shape',
        description: 'A box when left out',
      },
      moves: { kind: 'bool', optional: true, label: 'Moves', description: 'Pushed and falling; still when left out' },
    },
  },
  trigger: {
    title: 'Trigger zone',
    description: 'A zone the size of the object whose effects run as the player comes in.',
    fields: {
      when: { kind: 'condition', optional: true, label: 'When', description: 'Every time when left out' },
      effects: { kind: 'effects', label: 'Effects' },
      once: { kind: 'bool', optional: true, label: 'Once', description: 'Only the first time the player comes in' },
    },
  },
  // M5.9 (D71): what the player takes, opens or reads, with Interact.
  interact: {
    title: 'Interact',
    description: 'Something the player uses: a prompt when they face it within reach, and what using it does.',
    fields: {
      label: { kind: 'text', label: 'Label', description: 'What the prompt says: Take, Open, Read' },
      when: { kind: 'condition', optional: true, label: 'When', description: 'Always when left out' },
      effects: { kind: 'effects', label: 'Effects' },
      once: { kind: 'bool', optional: true, label: 'Once', description: 'Only the first time' },
      takes: {
        kind: 'bool',
        optional: true,
        label: 'Takes',
        description: 'Using it takes the object: it is gone, and stays gone in saves',
      },
      // M6.8 (D80): a chest, a barrel, a sack: using it opens these to take from and put into.
      holds: {
        kind: 'map',
        key: { kind: 'ref', to: 'item' },
        of: { kind: 'int', min: 1 },
        optional: true,
        label: 'Holds',
        description: 'A container: using it opens what it holds, by item, to take from and put into',
      },
    },
  },
  spawn: {
    title: 'Spawn point',
    description: 'A place the player can arrive at, facing the way the object is turned.',
    fields: {
      start: { kind: 'bool', optional: true, label: 'Start', description: 'Where the space is entered first' },
      // M5.8 (D70): the camera the walk starts with here.
      view: {
        kind: 'enum',
        values: ['third', 'first'],
        optional: true,
        label: 'View',
        description: 'Third person when left out',
      },
    },
  },
  // M5.3 (D65): water at a plane's height, as many as a space needs.
  water: {
    title: 'Water',
    description: 'Water at the object, which must be a plane: its top is the surface.',
    fields: {
      color: { kind: 'colour', optional: true, label: 'Colour', description: '#3a6d8c when left out' },
      clarity: {
        kind: 'number',
        optional: true,
        min: 0,
        max: 1,
        label: 'Clarity',
        description: 'How far the eye sees into it, 0 to 1: 0.6 when left out',
      },
    },
  },
  // M7.1 (D83): what a 2D space draws.
  sprite: {
    title: 'Sprite',
    description: 'A sprite drawn at the object in a 2D space, its origin on the object’s place.',
    fields: {
      sprite: { kind: 'ref', to: 'sprite', label: 'Sprite' },
      clip: { kind: 'text', min: 1, optional: true, label: 'Clip', description: 'The sprite’s own when left out' },
      flip: { kind: 'bool', optional: true, label: 'Flip', description: 'Drawn mirrored across' },
      phase: {
        kind: 'number',
        optional: true,
        min: 0,
        max: 1000,
        label: 'Phase',
        description: 'Where in its clip it starts, in frames: 0 when left out',
      },
    },
  },
  parallax: {
    title: 'Parallax',
    description: 'A layer of a 2D space that moves at a share of the camera’s movement, for depth.',
    fields: {
      factor: {
        kind: 'list',
        of: { kind: 'number', min: 0, max: 4 },
        min: 2,
        max: 2,
        label: 'Factor',
        description: 'Across and up: 0 stays with the camera, 1 moves with the world, between them farther off',
      },
      repeat: { kind: 'bool', optional: true, label: 'Repeats', description: 'Tiled across the view' },
    },
  },
  // M7.2 (D84): a grid of tiles, its layers through a tileset's legend and its edges in Space-Wrecked's map text.
  tilemap: {
    title: 'Tilemap',
    description: 'A grid of tiles in a 2D space, drawn through a tileset, with walls and doors on its edges.',
    fields: {
      tileset: { kind: 'ref', to: 'tileset', label: 'Tileset' },
      size: {
        kind: 'list',
        of: { kind: 'int', min: 1, max: 256 },
        min: 2,
        max: 2,
        label: 'Size',
        description: 'Its columns and rows',
      },
      layers: {
        kind: 'list',
        min: 1,
        label: 'Layers',
        description: 'Later layers draw over earlier ones; a cell’s rules are its topmost tile’s',
        of: {
          kind: 'group',
          fields: {
            id: { kind: 'text', min: 1, label: 'Layer' },
            rows: {
              kind: 'list',
              of: { kind: 'text' },
              lines: true,
              label: 'Rows',
              description: 'One character a tile, through the tileset’s legend; a space is no tile',
            },
          },
        },
      },
      edges: {
        kind: 'list',
        of: { kind: 'text' },
        lines: true,
        optional: true,
        label: 'Edges',
        description: 'Space-Wrecked’s map text: - | a wall, = I the hull, / a door, o a hatch, + where they meet',
      },
    },
  },
  // M7.3 (D85): floors of rooms seen side on, and the stairs between them.
  building: {
    title: 'Building',
    description: 'Floors of rooms seen side on in a 2D space, from the object’s place up, with stairs between them.',
    fields: {
      slot: {
        kind: 'list',
        of: { kind: 'int', min: 1, max: 1024 },
        min: 2,
        max: 2,
        label: 'Slot',
        description: 'A slot’s width and a floor’s height in art pixels, the floor under it included',
      },
      slots: { kind: 'int', min: 1, max: 32, label: 'Slots', description: 'Slots a floor, the same on every floor' },
      floors: { kind: 'int', min: 1, max: 64, label: 'Floors', description: 'Counted from the ground, floor 0, up' },
      rooms: {
        kind: 'list',
        label: 'Rooms',
        description: 'A slot no room takes is bare: walkers cross it and nothing is drawn there',
        of: {
          kind: 'group',
          fields: {
            id: { kind: 'text', min: 1, label: 'Id', description: 'What world.room says of a walker in it' },
            room: { kind: 'ref', to: 'room', label: 'Room' },
            floor: { kind: 'int', min: 0, label: 'Floor' },
            slot: { kind: 'int', min: 0, label: 'Slot', description: 'Its first slot from the left, from 0' },
            span: {
              kind: 'int',
              min: 1,
              optional: true,
              label: 'Span',
              description: 'The slots it takes: 1 when left out',
            },
          },
        },
      },
      stairs: {
        kind: 'list',
        label: 'Stairs',
        description: 'Each from a floor to the one above, taking no slot',
        of: {
          kind: 'group',
          fields: {
            floor: { kind: 'int', min: 0, label: 'From floor' },
            x: { kind: 'int', min: 0, label: 'At', description: 'Art pixels from the building’s left' },
          },
        },
      },
      stair: {
        kind: 'ref',
        to: 'sprite',
        optional: true,
        label: 'Stairs drawn with',
        description: 'Repeated up from the lower floor to the upper',
      },
      climb: {
        kind: 'int',
        min: 1,
        optional: true,
        label: 'Climb',
        description: 'What a climb costs a route, in art pixels walked: a floor’s height when left out',
      },
    },
  },
  sound: {
    title: 'Sound',
    description: 'A sound or an ambience heard near the object.',
    fields: {
      of: { kind: 'ref', to: ['sound', 'ambience'], label: 'Sound' },
      volume: { kind: 'number', optional: true, min: 0, max: 1, label: 'Volume', description: '1 when left out' },
      range: metres('Range, in metres', 'How far it is heard: 10 m when left out'),
    },
  },
};

/** The engine's kinds in the order Add component offers them. */
export const ENGINE_COMPONENTS: ReadonlyMap<string, DataType> = new Map(
  Object.entries(KINDS).map(([kind, file]) => [kind, typeFromFile(kind, file)]),
);

export const isEngineComponent = (kind: string): boolean => ENGINE_COMPONENTS.has(kind);
