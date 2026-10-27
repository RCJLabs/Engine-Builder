/**
 * What an open 2D space's view needs from the project (M7.1, D83), read after each change: every
 * sprite record that passes its schema, and the sheet each names, with a hash of its bytes, so the
 * view decodes a sheet again only when its file changed. A sheet that is missing is null: E091
 * says so, and the view draws nothing for its sprites.
 */
import { ASSETS_DIR, type ProjectSource, parseJsonFile } from '@eb/compiler';
import { SPRITE, SPRITE_DATA, type SpriteRecord, schemaIssues } from '@eb/schema';

export interface SheetRead {
  readonly bytes: Uint8Array;
  readonly hash: string;
}

export interface LiveSprites {
  readonly records: ReadonlyMap<string, SpriteRecord>;
  /** By the path under assets/ the records name. */
  readonly sheets: ReadonlyMap<string, SheetRead | null>;
}

const DIR = `records/${SPRITE}/`;
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function recordOf(source: ProjectSource, file: string): Promise<SpriteRecord | null> {
  const bytes = await source.read(file);
  const parsed = bytes ? parseJsonFile(bytes) : null;
  if (!parsed?.ok) return null;
  return schemaIssues(SPRITE_DATA.recordType.schema, parsed.value).length === 0 ? (parsed.value as SpriteRecord) : null;
}

export async function readLiveSprites(source: ProjectSource): Promise<LiveSprites> {
  const files = (await source.files(DIR.slice(0, -1))).filter(
    (f) => f.startsWith(DIR) && f.endsWith('.json') && !f.slice(DIR.length).includes('/'),
  );
  const records = new Map<string, SpriteRecord>();
  for (const file of files) {
    const record = await recordOf(source, file);
    if (record) records.set(file.slice(DIR.length, -'.json'.length), record);
  }
  const sheets = new Map<string, SheetRead | null>();
  for (const sheet of new Set([...records.values()].map((r) => r.sheet))) {
    const bytes = await source.read(`${ASSETS_DIR}/${sheet}`);
    sheets.set(
      sheet,
      bytes ? { bytes, hash: hex(await crypto.subtle.digest('SHA-256', bytes as BufferSource)) } : null,
    );
  }
  return { records, sheets };
}
