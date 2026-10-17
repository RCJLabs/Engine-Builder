import { z } from 'zod';

/**
 * The metadata key that marks an asset field: a file under the project's assets/ folder. Like
 * x-eb-ref, it reaches the JSON Schema export, so the editor knows to offer the asset picker.
 */
export const ASSET_KEY = 'x-eb-asset';

/**
 * The kinds of asset a field can ask for, by file extension. M2.7's asset browser imports the
 * same kinds. A field with no kind takes any file.
 */
export const ASSET_TYPES = {
  image: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'],
  audio: ['mp3', 'ogg', 'opus', 'wav', 'm4a', 'aac', 'flac'],
  model: ['glb', 'gltf'],
  font: ['woff2', 'woff', 'ttf', 'otf'],
} as const;

export type AssetKind = keyof typeof ASSET_TYPES;
export const ASSET_KINDS = Object.keys(ASSET_TYPES) as readonly AssetKind[];

// One folder or file name: not hidden (the compiler never reads those), none of the characters
// Windows refuses, so a zip made anywhere unpacks anywhere.
const SEGMENT = String.raw`(?!\.)(?!__MACOSX(?:/|$))[^/\\:*?"<>|\u0000-\u001f]+`;

/** A path inside assets/, with `/` between folders: `portraits/spiculus.png`. */
export const ASSET_PATH_PATTERN = new RegExp(`^${SEGMENT}(?:/${SEGMENT})*$`);

// Extensions in either case, spelled out so the JSON Schema pattern, which has no flags, agrees.
const anyCase = (ext: string) =>
  [...ext].map((c) => (c.toLowerCase() === c.toUpperCase() ? c : `[${c}${c.toUpperCase()}]`)).join('');
const extensionPattern = (kind: AssetKind) => new RegExp(`\\.(?:${ASSET_TYPES[kind].map(anyCase).join('|')})$`);

/**
 * A field holding the path of a file under assets/, of one kind or any. Validation checks the
 * file is there (E018) when it knows the project's files.
 */
const NOUNS: Record<AssetKind, string> = { image: 'image', audio: 'audio file', model: '3D model', font: 'font' };

export function asset(kind?: AssetKind): z.ZodString {
  if (kind !== undefined && !Object.hasOwn(ASSET_TYPES, kind)) throw new RangeError(`asset(): no asset kind "${kind}"`);
  const noun = kind === undefined ? 'file' : NOUNS[kind];
  let schema = z
    .string()
    .min(1, { error: `No ${noun} chosen yet`, abort: true })
    .regex(ASSET_PATH_PATTERN, { error: 'Expected a path inside assets/, with "/" between folders', abort: true });
  if (kind !== undefined) {
    const types = ASSET_TYPES[kind].map((ext) => `.${ext}`).join(', ');
    const article = /^[aeiou]/.test(noun) ? 'an' : 'a';
    schema = schema.regex(extensionPattern(kind), { error: `Expected ${article} ${noun}: ${types}` });
  }
  return schema.meta({ [ASSET_KEY]: kind ?? true });
}

/** The asset kind a schema asks for: a kind, true for any file, or undefined when it isn't an asset field. */
export function assetKindOf(schema: z.core.$ZodType): AssetKind | true | undefined {
  const kind: unknown = z.globalRegistry.get(schema)?.[ASSET_KEY];
  if (kind === undefined) return undefined;
  if (kind === true || (typeof kind === 'string' && Object.hasOwn(ASSET_TYPES, kind))) return kind as AssetKind | true;
  throw new TypeError(`${ASSET_KEY} must be an asset kind or true; use asset()`);
}

/** Whether a file at `path` in assets/ is of `kind`, by its extension. */
export const isAssetOf = (path: string, kind: AssetKind | true): boolean =>
  kind === true || extensionPattern(kind).test(path);
