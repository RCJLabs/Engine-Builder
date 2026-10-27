/**
 * The engine's room type (M7.3, D85, docs/specs/rooms.md#a-room): a name and the sprite a building draws
 * across each room of it, from the room's bottom-left, repeated as the room's width needs. What a room does
 * (who works there, what it costs) is the kits'; the building it stands in is a component of a 2D space's
 * object (componentTypes.ts), checked by the compiler (E094, buildings.ts in @eb/compiler).
 */
import type { TypeFile } from './typeFile.ts';
import { type DataType, typeFromFile } from './typeSchema.ts';

export const ROOM = 'room';

/** A room record as its file holds it. */
export interface RoomRecord {
  readonly name?: string;
  readonly sprite: string;
}

export const ROOM_TYPE_FILE: TypeFile = {
  title: 'Room',
  description: 'A room of a building in a 2D space: its name and the sprite drawn across it (docs/specs/rooms.md).',
  nameField: 'name',
  fields: {
    name: { kind: 'text', optional: true, label: 'Name' },
    sprite: {
      kind: 'ref',
      to: 'sprite',
      label: 'Sprite',
      description:
        'Drawn from the room’s bottom-left and repeated across it: one slot wide and one floor high fits it exactly',
    },
  },
};

export const ROOM_DATA: DataType = typeFromFile(ROOM, ROOM_TYPE_FILE);
