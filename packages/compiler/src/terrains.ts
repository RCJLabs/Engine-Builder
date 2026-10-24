/**
 * A space's terrain files (M5.3, D65, docs/specs/terrain.md): its heights and paint PNGs beside it,
 * read only as far as their headers. E067 for one that is missing, isn't a PNG, or isn't of its kind
 * and size; W144 for one whose space has no terrain. The compiler never decodes the images: the
 * editor draws them, and M5.8 will pack them.
 */
import { type Diagnostic, type DiagnosticCode, severityOf } from '@eb/schema';
import { type TerrainPart, terrainPath } from './spaceFiles.ts';
import type { SpaceJson } from './spaceShape.ts';

export interface PngHeader {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  /** PNG's colour type: 0 greyscale, 2 RGB, 3 palette, 4 grey and alpha, 6 RGBA. */
  readonly colorType: number;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** The header of a PNG, from its first chunk, or null when the bytes aren't a PNG. */
export function pngHeader(bytes: Uint8Array): PngHeader | null {
  if (bytes.length < 33 || SIGNATURE.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = String.fromCharCode(...bytes.subarray(12, 16));
  if (view.getUint32(8) !== 13 || type !== 'IHDR') return null;
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
    bitDepth: bytes[24] as number,
    colorType: bytes[25] as number,
  };
}

/** A terrain file under spaces/, read: its header is null when it isn't a PNG. */
export interface TerrainFileRead {
  readonly file: string;
  readonly id: string;
  readonly part: TerrainPart;
  readonly header: PngHeader | null;
}

/** What each part must be: the heights 16-bit greyscale, the paint 8-bit RGBA. */
const KINDS: Readonly<Record<TerrainPart, { bitDepth: number; colorType: number; words: string }>> = {
  heights: { bitDepth: 16, colorType: 0, words: '16-bit greyscale' },
  paint: { bitDepth: 8, colorType: 6, words: '8-bit RGBA' },
};

const at = (file: string, code: DiagnosticCode, path: string, message: string): Diagnostic => ({
  code,
  severity: severityOf(code),
  message,
  file,
  path,
});

/**
 * E067 and W144 over the spaces whose shape is sound, by id, and the terrain files there are. A
 * space whose file isn't sound (E007, E058) is in `present` alone: its files wait, unjudged.
 */
export function checkTerrains(
  spaces: ReadonlyMap<string, { file: string; space: SpaceJson }>,
  present: ReadonlySet<string>,
  terrains: readonly TerrainFileRead[],
): Diagnostic[] {
  const found: Diagnostic[] = [];
  const byFile = new Map(terrains.map((t) => [t.file, t]));
  for (const [id, { file, space }] of spaces) {
    const terrain = space.terrain;
    if (!terrain) continue;
    for (const part of ['heights', 'paint'] as const) {
      const path = terrainPath(id, part);
      const read = byFile.get(path);
      const kind = KINDS[part];
      if (!read) {
        found.push(at(file, 'E067', '/terrain', `No ${path}: a terrain's ${part} sit beside its space`));
      } else if (!read.header) {
        found.push(at(path, 'E067', '', 'It isn’t a PNG'));
      } else if (read.header.bitDepth !== kind.bitDepth || read.header.colorType !== kind.colorType) {
        found.push(at(path, 'E067', '', `The ${part} are a ${kind.words} PNG`));
      } else if (read.header.width !== terrain.size || read.header.height !== terrain.size) {
        const { width, height } = read.header;
        found.push(at(path, 'E067', '', `It is ${width}×${height}; the terrain is ${terrain.size}×${terrain.size}`));
      }
    }
  }
  for (const read of terrains) {
    if (spaces.get(read.id)?.space.terrain || (present.has(read.id) && !spaces.has(read.id))) continue;
    const whose = spaces.has(read.id) ? `spaces/${read.id}.json has no terrain` : `there is no spaces/${read.id}.json`;
    found.push(at(read.file, 'W144', '', `Ignored: ${whose}`));
  }
  return found;
}
