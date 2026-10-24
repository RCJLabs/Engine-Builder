/**
 * Models in the Scene panel (M5.5, D67, docs/specs/models.md#placing-and-drawing), in a chunk of
 * their own that loads with the first model drawn: three's GLTFLoader with its Draco, Meshopt and
 * KTX2 decoders, all from the editor's own files. Each file is decoded once, again only when its
 * bytes change, and each placement draws a copy of it: scaled, its slots given their material
 * records, its LOD levels cut, its collider a wire that the view shows while it is chosen.
 */
import type { Fields } from '@eb/compiler';
import { lodReady } from '@eb/models/lod';
import { type MaterialRecord, MODEL_DATA, type ModelCollider, type ModelRecord, schemaIssues } from '@eb/schema';
import dracoWasm from 'three/examples/jsm/libs/draco/draco_decoder.wasm?url';
import dracoWrapper from 'three/examples/jsm/libs/draco/draco_wasm_wrapper.js?url';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import * as THREE from 'three/webgpu';
import { noteError } from '../app/state.ts';
import { type LiveModels, type ModelFileRead, sourcesOf } from '../models/liveModels.ts';
import { modelHere } from '../models/placedModels.ts';
import {
  colliderWire,
  laySlots,
  materialOf,
  materialsOf,
  meshesOf,
  simplified,
  trianglesOf,
  withLevels,
} from './modelParts.ts';

/** What the view's hook says of each placed object drawn as a model. */
export interface ModelSummary {
  readonly model: string;
  readonly level: number;
  readonly levels: number;
  readonly triangles: number;
  readonly collider: ModelCollider | null;
  /** Each slot's colour as three draws it. */
  readonly materials: Readonly<Record<string, string>>;
}

interface Decoded {
  readonly hash: string;
  readonly gltf: GLTF | null;
  /** Each of the file's materials by its slot: its name, or "#" and its index. */
  readonly slots: ReadonlyMap<THREE.Material, string>;
}

interface Drawn {
  readonly id: string;
  readonly record: ModelRecord;
}

/** A .gltf's own files given to the loader as blob URLs, so each loader it hands an image to finds it. */
function withBlobs(file: ModelFileRead, urls: string[]): ArrayBuffer | string {
  const { bytes } = file;
  if (file.beside.size === 0) return bytes.slice().buffer;
  const json = JSON.parse(new TextDecoder().decode(bytes)) as {
    buffers?: { uri?: string }[];
    images?: { uri?: string }[];
  };
  for (const item of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    const found = item.uri === undefined ? undefined : file.beside.get(decodeURIComponent(item.uri));
    if (!found) continue;
    item.uri = URL.createObjectURL(new Blob([found as BlobPart]));
    urls.push(item.uri);
  }
  return JSON.stringify(json);
}

function slotsOf(gltf: GLTF): Map<THREE.Material, string> {
  const slots = new Map<THREE.Material, string>();
  for (const mesh of meshesOf(gltf.scene)) {
    for (const material of materialsOf(mesh)) {
      const index = gltf.parser.associations.get(material)?.materials;
      slots.set(material, material.name || `#${index ?? 0}`);
    }
  }
  return slots;
}

function disposeGltf(gltf: GLTF): void {
  for (const mesh of meshesOf(gltf.scene)) {
    mesh.geometry.dispose();
    for (const material of materialsOf(mesh)) {
      for (const value of Object.values(material))
        if ((value as THREE.Texture)?.isTexture) (value as THREE.Texture).dispose();
      material.dispose();
    }
  }
}

export function createModelsView(renderer: THREE.WebGPURenderer) {
  const draco = new DRACOLoader().setDecoderPath({ js: dracoWrapper, wasm: dracoWasm });
  const ktx2 = new KTX2Loader().detectSupport(renderer);
  const decoded = new Map<string, Decoded>();
  const cuts = new Map<string, THREE.BufferGeometry>();
  const materials = new Map<string, THREE.Material>();

  const decode = async (path: string, file: ModelFileRead): Promise<Decoded> => {
    const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
    const urls: string[] = [];
    try {
      const gltf = await loader.parseAsync(withBlobs(file, urls), '');
      return { hash: file.hash, gltf, slots: slotsOf(gltf) };
    } catch (error) {
      // E070 reads only the file's JSON, so a body three can't decode is said here; it draws its marker.
      noteError(`assets/${path} can’t be drawn: ${error instanceof Error ? error.message : String(error)}`);
      return { hash: file.hash, gltf: null, slots: new Map() };
    } finally {
      for (const url of urls) URL.revokeObjectURL(url);
    }
  };

  const cut = (geometry: THREE.BufferGeometry, ratio: number) => {
    const key = `${geometry.uuid}:${ratio}`;
    let made = cuts.get(key);
    if (!made) {
      made = simplified(geometry, ratio);
      cuts.set(key, made);
    }
    return made;
  };

  const recordMaterial = (id: string, record: MaterialRecord) => {
    const key = `${id}:${JSON.stringify(record)}`;
    let made = materials.get(key);
    if (!made) {
      made = materialOf(record);
      materials.set(key, made);
    }
    return made;
  };

  return {
    /** Decodes each file not decoded as it now is; resolves to whether any was. */
    async prepare(models: LiveModels): Promise<boolean> {
      await lodReady;
      let any = false;
      for (const [path, file] of models.files) {
        if (!file || decoded.get(path)?.hash === file.hash) continue;
        const made = await decode(path, file);
        const before = decoded.get(path)?.gltf;
        if (before) {
          // The levels cut from the file it replaces go with it.
          const gone = new Set(meshesOf(before.scene).map((mesh) => mesh.geometry.uuid));
          for (const [key, geometry] of cuts) {
            if (!gone.has(key.slice(0, key.indexOf(':')))) continue;
            geometry.dispose();
            cuts.delete(key);
          }
          disposeGltf(before);
        }
        decoded.set(path, made);
        any = true;
      }
      return any;
    },

    /** A placed record drawn as its model, or null while it draws as M5.2's marker. */
    draw(models: LiveModels, key: string, passed: readonly Fields[]): THREE.Object3D | null {
      const model = modelHere(key, passed, sourcesOf(models));
      if (!model || schemaIssues(MODEL_DATA.recordType.schema, model.value).length > 0) return null;
      const record = model.value as unknown as ModelRecord;
      const file = decoded.get(record.file);
      if (!file?.gltf || file.hash !== models.files.get(record.file)?.hash) return null;
      const body = withLevels(file.gltf.scene, record.lod, cut);
      const given = new Map(
        (record.materials ?? []).flatMap(({ slot, material }) => {
          const found = models.materials.get(material);
          return found ? [[slot, recordMaterial(material, found)] as const] : [];
        }),
      );
      laySlots(
        body,
        (material) => file.slots.get(material),
        (slot) => given.get(slot),
      );
      const holder = new THREE.Group();
      holder.scale.setScalar(record.scale ?? 1);
      holder.add(body);
      holder.userData.model = { id: model.id, record } satisfies Drawn;
      return holder;
    },

    /** The collider's wire for a model drawn by draw(), or null when it has none. */
    wireOf(holder: THREE.Object3D): THREE.Mesh | null {
      const drawn = holder.userData.model as Drawn | undefined;
      return drawn?.record.collider ? colliderWire(drawn.record.collider) : null;
    },

    /** What the hook says of a model drawn by draw(), as the last frame drew it. */
    summary(holder: THREE.Object3D): ModelSummary | null {
      const drawn = holder.userData.model as Drawn | undefined;
      if (!drawn) return null;
      const body = holder.children.find((child) => !child.userData.colliderWire);
      const levels = body instanceof THREE.LOD ? body : null;
      const level = levels?.getCurrentLevel() ?? 0;
      const shown = levels ? levels.levels[level]?.object : body;
      const colours: Record<string, string> = {};
      for (const mesh of meshesOf(levels ? (levels.levels[0]?.object ?? holder) : (body ?? holder))) {
        const slots = (mesh.userData.slots ?? []) as (string | undefined)[];
        materialsOf(mesh).forEach((material, i) => {
          const colour = (material as THREE.MeshStandardMaterial).color;
          const slot = slots[i];
          if (slot !== undefined && colour) colours[slot] = `#${colour.getHexString()}`;
        });
      }
      return {
        model: drawn.id,
        level,
        levels: levels ? levels.levels.length : 1,
        triangles: shown ? trianglesOf(shown) : 0,
        collider: drawn.record.collider ?? null,
        materials: colours,
      };
    },

    dispose() {
      for (const { gltf } of decoded.values()) if (gltf) disposeGltf(gltf);
      decoded.clear();
      for (const geometry of cuts.values()) geometry.dispose();
      cuts.clear();
      for (const material of materials.values()) material.dispose();
      materials.clear();
      draco.dispose();
      ktx2.dispose();
    },
  };
}

export type ModelsView = ReturnType<typeof createModelsView>;
