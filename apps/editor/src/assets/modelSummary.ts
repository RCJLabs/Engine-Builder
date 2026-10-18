/**
 * What a 3D model holds, read from its glTF JSON without drawing it (M2.7): the Assets panel
 * shows counts and the files a .gltf needs beside it, since rendering waits for the 3D viewport
 * (Phase 5). A .glb carries its JSON in its first chunk (glTF 2.0, section 4.4).
 */
import { folderOf } from './assetPaths.ts';

export interface ModelSummary {
  readonly format: 'glb' | 'gltf';
  readonly version: string | undefined;
  readonly meshes: number;
  /** Triangles drawn, over every primitive that draws them: what a phone's budget counts. */
  readonly triangles: number;
  readonly materials: number;
  readonly textures: number;
  readonly animations: number;
  readonly nodes: number;
  /** Files it names beside itself (buffers and images), by path inside assets/, and whether each is there. */
  readonly external: readonly { readonly path: string; readonly found: boolean }[];
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** The JSON a model holds, or why it can't be read. */
function modelJson(format: 'glb' | 'gltf', bytes: Uint8Array): Json | string {
  let text: string;
  if (format === 'glb') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC)
      return 'Not a .glb file: it doesn’t start with glTF';
    const length = view.getUint32(12, true);
    if (view.getUint32(16, true) !== JSON_CHUNK || 20 + length > bytes.byteLength) return 'Its JSON chunk is missing';
    text = new TextDecoder().decode(bytes.subarray(20, 20 + length));
  } else text = new TextDecoder().decode(bytes);
  try {
    const json: unknown = JSON.parse(text);
    return isObject(json) ? json : 'Its JSON isn’t a glTF object';
  } catch {
    return 'Its JSON can’t be read';
  }
}

/** Triangles a primitive draws: triangles (mode 4, the default), strips and fans (5 and 6). */
function trianglesOf(primitive: unknown, accessors: unknown[]): number {
  if (!isObject(primitive)) return 0;
  const mode = primitive.mode ?? 4;
  const attributes = isObject(primitive.attributes) ? primitive.attributes : {};
  const at = typeof primitive.indices === 'number' ? primitive.indices : attributes.POSITION;
  const accessor = typeof at === 'number' ? accessors[at] : undefined;
  const count = isObject(accessor) && typeof accessor.count === 'number' ? accessor.count : 0;
  if (mode === 4) return Math.floor(count / 3);
  return mode === 5 || mode === 6 ? Math.max(0, count - 2) : 0;
}

/** A relative URI from the model's folder as a path inside assets/, or null when it leaves assets/ or can't be read. */
function resolve(folder: string, uri: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    return null;
  }
  const parts = folder === '' ? [] : folder.split('/');
  for (const part of decoded.split('/')) {
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/');
}

/** The summary of the model at `path` (inside assets/), or why it can't be read. */
export function modelSummary(path: string, bytes: Uint8Array, assets: ReadonlySet<string>): ModelSummary | string {
  const format = path.toLowerCase().endsWith('.glb') ? 'glb' : 'gltf';
  const json = modelJson(format, bytes);
  if (typeof json === 'string') return json;
  const accessors = list(json.accessors);
  const meshes = list(json.meshes);
  const triangles = meshes.reduce<number>(
    (sum, mesh) =>
      sum + list(isObject(mesh) ? mesh.primitives : []).reduce<number>((n, p) => n + trianglesOf(p, accessors), 0),
    0,
  );
  const uris = [...list(json.buffers), ...list(json.images)]
    .map((item) => (isObject(item) && typeof item.uri === 'string' ? item.uri : null))
    .filter((uri): uri is string => uri !== null && !uri.startsWith('data:'));
  const external = uris.map((uri) => {
    const resolved = resolve(folderOf(path), uri);
    return { path: resolved ?? uri, found: resolved !== null && assets.has(resolved) };
  });
  const asset = isObject(json.asset) ? json.asset : {};
  return {
    format,
    version: typeof asset.version === 'string' ? asset.version : undefined,
    meshes: meshes.length,
    triangles,
    materials: list(json.materials).length,
    textures: list(json.textures).length,
    animations: list(json.animations).length,
    nodes: list(json.nodes).length,
    external,
  };
}
