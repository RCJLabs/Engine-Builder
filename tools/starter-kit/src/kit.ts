/**
 * The starter kit's files (M5.5, D67, docs/specs/models.md#the-starter-kit), as a project folder:
 * each piece's GLB packed as the import packs a model, its model record with a fitted collider and
 * its slots given the kit's materials, the material records, and the provenance log that says the
 * kit is RCJLabs's, dedicated to CC0. The same code gives the same bytes, which the test holds.
 */
import { fitBox, fitCapsule, fitSphere, modelPositions } from '@eb/models/colliders';
import { fitHull } from '@eb/models/hull';
import { modelIO } from '@eb/models/io';
import { packModel, readModel } from '@eb/models/pack';
import { type ColliderShape, MATERIAL_PRESETS, type MaterialRecord, type ModelCollider } from '@eb/schema';
import { Document } from '@gltf-transform/core';
import { KIT_MATERIALS, type KitMaterial, PIECES, type Piece } from './pieces.ts';
import { arrays } from './shapes.ts';

export interface KitFile {
  /** Its path inside starter-kit/, as a project holds it. */
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** The day the kit's files were first made: fixed, so the log is the same each time it is written. */
export const KIT_DATE = '2026-10-24';

/** The kit's folder inside a project's assets/. */
export const KIT_FOLDER = 'starter-kit';

const LEAVES: MaterialRecord = { color: '#4f7f3a', roughness: 0.9, metalness: 0 };

/** The kit's materials: the presets of the same name, and a green for leaves, which no preset is. */
export function kitMaterial(name: KitMaterial): MaterialRecord {
  const preset = MATERIAL_PRESETS.find((p) => p.id === name);
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  return { name: title, ...(preset?.value ?? LEAVES) };
}

/** An sRGB colour as glTF's linear factors. */
function linear(hex: string): [number, number, number, number] {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return Math.round((c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * 1e4) / 1e4;
  };
  return [channel(0), channel(1), channel(2), 1];
}

/** A piece as a glTF document: one mesh, a primitive for each of its materials, named by it. */
function pieceDocument(piece: Piece): Document {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const mesh = doc.createMesh(piece.id);
  for (const name of KIT_MATERIALS) {
    const shapes = piece.parts[name];
    if (!shapes) continue;
    const { positions, normals, indices } = arrays(shapes);
    const look = kitMaterial(name);
    const material = doc
      .createMaterial(name)
      .setBaseColorFactor(linear(look.color ?? '#b0b0b0'))
      .setRoughnessFactor(look.roughness ?? 0.8)
      .setMetallicFactor(look.metalness ?? 0);
    if (look.emissive) material.setEmissiveFactor(linear(look.emissive).slice(0, 3) as [number, number, number]);
    mesh.addPrimitive(
      doc
        .createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(normals).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer))
        .setMaterial(material),
    );
  }
  doc.createScene(piece.id).addChild(doc.createNode(piece.id).setMesh(mesh));
  return doc;
}

const FITS: Record<ColliderShape, (points: Float32Array) => ModelCollider> = {
  box: fitBox,
  sphere: fitSphere,
  capsule: fitCapsule,
  hull: fitHull,
};

const json = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

/** A piece packed, and its model record. */
async function pieceFiles(piece: Piece): Promise<KitFile[]> {
  const plain = await (await modelIO()).writeBinary(pieceDocument(piece));
  const glb = await packModel({ name: `${piece.id}.glb`, bytes: plain }, [], {});
  const collider = FITS[piece.collider](
    modelPositions(await readModel({ name: `${piece.id}.glb`, bytes: glb }, [], {})),
  );
  const materials = KIT_MATERIALS.filter((name) => piece.parts[name]).map((name) => ({
    slot: name,
    material: `kit-${name}`,
  }));
  const record = { name: piece.name, file: `${KIT_FOLDER}/${piece.id}.glb`, materials, collider };
  return [
    { path: `assets/${KIT_FOLDER}/${piece.id}.glb`, bytes: glb },
    { path: `records/model/kit-${piece.id}.json`, bytes: json(record) },
  ];
}

/** Every file of the kit, sorted by path. */
export async function makeKit(): Promise<KitFile[]> {
  const files: KitFile[] = [];
  for (const piece of PIECES) files.push(...(await pieceFiles(piece)));
  for (const name of KIT_MATERIALS)
    files.push({ path: `records/material/kit-${name}.json`, bytes: json(kitMaterial(name)) });
  const entry = {
    licence: 'CC0-1.0',
    author: 'RCJLabs',
    source: 'Made in code by RCJLabs for Engine-Builder, dedicated to the public domain',
    date: KIT_DATE,
    tool: 'tools/starter-kit',
  };
  const log = Object.fromEntries(PIECES.map((piece) => [`${KIT_FOLDER}/${piece.id}.glb`, entry]));
  files.push({ path: 'assets/assets.json', bytes: json({ files: log }) });
  files.push({
    path: 'project.json',
    bytes: json({ format: 1, id: 'starter-kit', name: 'Starter kit', version: '1.0.0' }),
  });
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
