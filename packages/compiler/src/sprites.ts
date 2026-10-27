/**
 * Each sprite record's sheet, read only as far as its PNG header (M7.1, D83,
 * docs/specs/2d-scenes.md#sprites): E091 for a sheet that isn't a PNG, one that isn't a whole number
 * of frames across and down, and a clip that runs past its last frame. The record's own rules are
 * checked with it (spriteTypes.ts in @eb/schema); a sheet that isn't in assets/ is E018 already, from
 * the record's asset field, and isn't read again here. The editor runs the same check after its
 * record index.
 */
import { type Diagnostic, isAssetOf, type RecordInput, SPRITE, severityOf } from '@eb/schema';
import type { ProjectSource } from './source.ts';
import { type PngHeader, pngHeader } from './terrains.ts';

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isPair = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every((n) => Number.isInteger(n) && n >= 1);

/** A sprite record's sheet, when its value names one that is there and is an image. */
export function spriteSheetOf(value: unknown, assets: ReadonlySet<string>): string | null {
  if (!isObject(value) || typeof value.sheet !== 'string') return null;
  return assets.has(value.sheet) && isAssetOf(value.sheet, 'image') ? value.sheet : null;
}

/** How many frames a sheet of this size holds, or a sentence saying why it isn't whole frames. */
export function framesOf(header: PngHeader, frame: readonly [number, number]): number | string {
  const [w, h] = frame;
  if (header.width % w === 0 && header.height % h === 0) return (header.width / w) * (header.height / h);
  return `The sheet’s ${header.width} by ${header.height} pixels aren’t a whole number of ${w} by ${h} frames`;
}

/** E091 for one sprite record, given its sheet's header: null when it isn't a PNG. */
export function spriteDiagnostics(record: RecordInput, header: PngHeader | null): Diagnostic[] {
  const at = (path: string, message: string): Diagnostic => ({
    code: 'E091',
    severity: severityOf('E091'),
    message,
    type: record.type,
    id: record.id,
    ...(record.file !== undefined ? { file: record.file } : {}),
    path,
  });
  if (header === null) return [at('/sheet', 'It isn’t a PNG: a sheet is read as one')];
  const value = record.value as Json;
  if (!isPair(value.frame)) return [];
  const count = framesOf(header, value.frame);
  if (typeof count === 'string') return [at('/frame', count)];
  const found: Diagnostic[] = [];
  for (const [name, clip] of Object.entries(isObject(value.clips) ? value.clips : {})) {
    const last = isObject(clip) && Array.isArray(clip.frames) ? clip.frames[1] : undefined;
    if (typeof last === 'number' && last >= count)
      found.push(
        at(`/clips/${name}/frames`, `It runs to frame ${last}: the sheet has ${count}, from 0 to ${count - 1}`),
      );
  }
  return found;
}

/** E091 over the project's sprite records, each sheet read once. */
export async function checkSprites(
  source: ProjectSource,
  records: readonly RecordInput[],
  assets: ReadonlySet<string>,
): Promise<Diagnostic[]> {
  const headers = new Map<string, PngHeader | null>();
  const diagnostics: Diagnostic[] = [];
  for (const record of records) {
    if (record.type !== SPRITE || record.unreadable) continue;
    const sheet = spriteSheetOf(record.value, assets);
    if (sheet === null) continue;
    let header = headers.get(sheet);
    if (header === undefined) {
      const bytes = await source.read(`assets/${sheet}`);
      header = bytes ? pngHeader(bytes) : null;
      headers.set(sheet, header);
    }
    diagnostics.push(...spriteDiagnostics(record, header));
  }
  return diagnostics;
}
