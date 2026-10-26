/**
 * A space's map beside it (M6.6, D78, docs/specs/markers.md#the-map): spaces/<id>.map.json holds the
 * ground it covers, its image's size and file, and the hash of what was drawn; the image is
 * spaces/<id>.map.webp, or .png from a browser that can't write WebP. E087 for one that can't be
 * read, whose image isn't there or whose space isn't; W154 for one baked before the space last changed.
 */
import { type Diagnostic, type DiagnosticCode, severityOf, z } from '@eb/schema';
import { parseJsonFile } from './decode.ts';
import { SPACES_DIR } from './spaceFiles.ts';

/** A map file's JSON. */
export interface SpaceMapFile {
  /** The ground it covers in metres: [least x, least z, most x, most z]. */
  readonly bounds: readonly [number, number, number, number];
  /** The image's width and height in pixels. */
  readonly size: readonly [number, number];
  /** The image's file name beside it. */
  readonly image: string;
  /** What was drawn, as mapInputsHash works it out: 16 hex digits. */
  readonly hash: string;
}

/** A map file under spaces/, read: `map` is null and `problem` says why when it can't be used. */
export interface MapFileRead {
  readonly file: string;
  readonly id: string;
  readonly map: SpaceMapFile | null;
  readonly problem: string | null;
}

/** The image's names a map may give: WebP, or PNG where the browser writes no WebP. */
export const mapImageNames = (id: string) => [`${id}.map.webp`, `${id}.map.png`];

const pixels = z.number().int().positive();
const mapSchema = z.strictObject({
  bounds: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .refine(([x0, z0, x1, z1]) => x0 < x1 && z0 < z1, { error: 'Bounds are [least x, least z, most x, most z]' }),
  size: z.tuple([pixels, pixels]),
  image: z.string(),
  hash: z.string().regex(/^[0-9a-f]{16}$/, { error: 'A hash is 16 hex digits' }),
});

/** A map file's bytes read: `present` holds every path under spaces/, so its image is found or not. */
export function readMapFile(
  file: string,
  id: string,
  bytes: Uint8Array | undefined,
  present: ReadonlySet<string>,
): MapFileRead {
  const fail = (problem: string): MapFileRead => ({ file, id, map: null, problem });
  if (bytes === undefined) return fail('Missing file');
  const parsed = parseJsonFile(bytes);
  if (!parsed.ok) return fail(parsed.message);
  const shaped = mapSchema.safeParse(parsed.value);
  if (!shaped.success) {
    const issue = shaped.error.issues[0];
    return fail(`Not a map: ${issue?.path.join('.') || 'the file'}: ${issue?.message ?? 'wrong shape'}`);
  }
  const map = shaped.data;
  if (!mapImageNames(id).includes(map.image)) {
    return fail(`Its image is ${mapImageNames(id).join(' or ')}, not "${map.image}"`);
  }
  if (!present.has(`${SPACES_DIR}/${map.image}`)) return fail(`Its image, ${SPACES_DIR}/${map.image}, isn't there`);
  return { file, id, map, problem: null };
}

const at = (file: string, code: DiagnosticCode, message: string): Diagnostic => ({
  code,
  severity: severityOf(code),
  message,
  file,
  path: '',
});

/**
 * E087 and W154 over the map files: `spaces` are the project's space ids, and `hashes` each one's
 * inputs worked out as a bake would (mapHashes), none for a space that isn't sound yet.
 */
export function checkMapFiles(
  maps: readonly MapFileRead[],
  spaces: ReadonlySet<string>,
  hashes: ReadonlyMap<string, string>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const read of maps) {
    const now = hashes.get(read.id);
    if (!spaces.has(read.id)) {
      diagnostics.push(at(read.file, 'E087', `No space "${read.id}" for this map: spaces/${read.id}.json isn't there`));
    } else if (read.map === null) {
      diagnostics.push(at(read.file, 'E087', `${read.problem ?? 'Not a map'}: open its space and press Bake map`));
    } else if (now !== undefined && read.map.hash !== now) {
      diagnostics.push(at(read.file, 'W154', 'Baked before the space last changed: press Bake map again'));
    }
  }
  return diagnostics;
}
