/**
 * What an open 2D space's view needs from the project (M7.1, D83), read after each change: every
 * sprite record that passes its schema, and the sheet each names, with a hash of its bytes, so the
 * view decodes a sheet again only when its file changed. A sheet that is missing is null: E091
 * says so, and the view draws nothing for its sprites. Since M7.2 every tileset too, and its sheet; since
 * M7.3 every room record, for the Rooms row's buttons.
 */
import { ASSETS_DIR, type ProjectSource, parseJsonFile } from '@eb/compiler';
import {
  type DataType,
  ROOM,
  ROOM_DATA,
  type RoomRecord,
  SPRITE,
  SPRITE_DATA,
  type SpriteRecord,
  schemaIssues,
  TILESET,
  TILESET_DATA,
  type TilesetRecord,
} from '@eb/schema';

export interface SheetRead {
  readonly bytes: Uint8Array;
  readonly hash: string;
}

export interface LiveSprites {
  readonly records: ReadonlyMap<string, SpriteRecord>;
  readonly tilesets: ReadonlyMap<string, TilesetRecord>;
  readonly rooms: ReadonlyMap<string, RoomRecord>;
  /** By the path under assets/ the records name. */
  readonly sheets: ReadonlyMap<string, SheetRead | null>;
}

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Every record of a type that passes its schema, by id. */
async function recordsOf<T>(source: ProjectSource, type: string, data: DataType): Promise<Map<string, T>> {
  const dir = `records/${type}/`;
  const files = (await source.files(dir.slice(0, -1))).filter(
    (f) => f.startsWith(dir) && f.endsWith('.json') && !f.slice(dir.length).includes('/'),
  );
  const found = new Map<string, T>();
  for (const file of files) {
    const bytes = await source.read(file);
    const parsed = bytes ? parseJsonFile(bytes) : null;
    if (parsed?.ok && schemaIssues(data.recordType.schema, parsed.value).length === 0)
      found.set(file.slice(dir.length, -'.json'.length), parsed.value as T);
  }
  return found;
}

export async function readLiveSprites(source: ProjectSource): Promise<LiveSprites> {
  const records = await recordsOf<SpriteRecord>(source, SPRITE, SPRITE_DATA);
  const tilesets = await recordsOf<TilesetRecord>(source, TILESET, TILESET_DATA);
  const rooms = await recordsOf<RoomRecord>(source, ROOM, ROOM_DATA);
  const sheets = new Map<string, SheetRead | null>();
  for (const sheet of new Set([...records.values(), ...tilesets.values()].map((r) => r.sheet))) {
    const bytes = await source.read(`${ASSETS_DIR}/${sheet}`);
    sheets.set(
      sheet,
      bytes ? { bytes, hash: hex(await crypto.subtle.digest('SHA-256', bytes as BufferSource)) } : null,
    );
  }
  return { records, tilesets, rooms, sheets };
}
