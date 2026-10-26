/**
 * What a glTF model holds, read from its JSON without decoding a byte of geometry (M2.7, moved here
 * for M5.5's checks): counts, its materials' names, the extensions it uses and needs, and the files
 * it names beside itself. A .glb carries its JSON in its first chunk (glTF 2.0, section 4.4).
 */

export interface GltfSummary {
  readonly format: 'glb' | 'gltf';
  readonly version: string | undefined;
  readonly meshes: number;
  /** Triangles drawn, over every primitive that draws them: what a phone's budget counts. */
  readonly triangles: number;
  readonly materials: number;
  /** Each material's slot name, in order: its name, or "#0", "#1"… for one without (docs/specs/models.md). */
  readonly slots: readonly string[];
  readonly textures: number;
  readonly animations: number;
  /** Skins: a skinned model goes on the engine's rig as it is imported (M6.5), or draws unanimated (W152). */
  readonly skins: number;
  readonly nodes: number;
  readonly extensionsUsed: readonly string[];
  readonly extensionsRequired: readonly string[];
  /** Files it names beside itself (buffers and images), by path inside assets/, and whether each is there. */
  readonly external: readonly { readonly path: string; readonly found: boolean }[];
}

/**
 * The extensions the engine draws, as three's GLTFLoader reads them and the import's reader does
 * (docs/specs/models.md#the-checks). One a file requires that isn't here is E070.
 */
export const READ_EXTENSIONS: readonly string[] = Object.freeze([
  'KHR_draco_mesh_compression',
  'EXT_meshopt_compression',
  'KHR_mesh_quantization',
  'KHR_texture_basisu',
  'KHR_texture_transform',
  'EXT_texture_webp',
  'KHR_materials_emissive_strength',
  'KHR_materials_unlit',
  'KHR_materials_ior',
  'KHR_materials_specular',
  'KHR_materials_transmission',
  'KHR_materials_clearcoat',
  'KHR_materials_sheen',
  'KHR_materials_volume',
  'KHR_lights_punctual',
]);

const GLB_MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const texts = (value: unknown): string[] => list(value).filter((v): v is string => typeof v === 'string');

/** The JSON a model holds, or why it can't be read. */
export function gltfJson(format: 'glb' | 'gltf', bytes: Uint8Array): Json | string {
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

/** A material's slot name: its name when it has one, else "#" and its index. */
export const slotName = (material: unknown, index: number): string =>
  isObject(material) && typeof material.name === 'string' && material.name !== '' ? material.name : `#${index}`;

/** The summary of the model at `path` (inside assets/), or why it can't be read. */
export function gltfSummary(path: string, bytes: Uint8Array, assets: ReadonlySet<string>): GltfSummary | string {
  const format = path.toLowerCase().endsWith('.glb') ? 'glb' : 'gltf';
  const json = gltfJson(format, bytes);
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
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const external = uris.map((uri) => {
    const resolved = resolve(folder, uri);
    return { path: resolved ?? uri, found: resolved !== null && assets.has(resolved) };
  });
  const asset = isObject(json.asset) ? json.asset : {};
  const materials = list(json.materials);
  return {
    format,
    version: typeof asset.version === 'string' ? asset.version : undefined,
    meshes: meshes.length,
    triangles,
    materials: materials.length,
    slots: materials.map(slotName),
    textures: list(json.textures).length,
    animations: list(json.animations).length,
    skins: list(json.skins).length,
    nodes: list(json.nodes).length,
    extensionsUsed: texts(json.extensionsUsed),
    extensionsRequired: texts(json.extensionsRequired),
    external,
  };
}

/** Why the engine can't draw a model, from its summary: nothing when it can (E070's messages). */
export function gltfProblems(summary: GltfSummary | string): string[] {
  if (typeof summary === 'string') return [summary];
  const problems: string[] = [];
  if (summary.version === undefined || !/^2\.\d+$/.test(summary.version))
    problems.push(`It is glTF ${summary.version ?? 'of no version'}: the engine reads glTF 2.0`);
  for (const name of summary.extensionsRequired) {
    if (!READ_EXTENSIONS.includes(name)) problems.push(`It needs ${name}, which the engine doesn’t read`);
  }
  for (const file of summary.external) {
    if (!file.found) problems.push(`It names assets/${file.path}, which isn’t there`);
  }
  return problems;
}
