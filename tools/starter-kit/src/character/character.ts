/**
 * The starter character's files (M6.5, D77, docs/specs/animation.md#the-starter-character), as a
 * project folder: one GLB, the skeleton already on the engine's rig, the mannequin skinned to it a
 * part a bone, and its clips sampled at 30 frames a second, packed as the import packs a model;
 * its model record, which says it is on the rig and lists its clips; a material record a slot;
 * the stock animator; and the provenance log that says it is RCJLabs's, dedicated to CC0.
 */
import { HUMANOID, PARENT } from '@eb/models/humanoid';
import { modelIO } from '@eb/models/io';
import { packModel } from '@eb/models/pack';
import type { MaterialRecord } from '@eb/schema';
import { Document, type Node } from '@gltf-transform/core';
import { arrays } from '../shapes.ts';
import { PARTS, SLOTS, type Slot } from './body.ts';
import { CLIPS } from './clips.ts';
import { grounded } from './ground.ts';
import { HEIGHT, offsetOf, REST } from './skeleton.ts';
import { STOCK_ANIMATOR } from './stock.ts';
import { turnOf } from './turns.ts';

export interface CharacterFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export const CHARACTER = 'starter-character';
export const CHARACTER_DATE = '2026-10-26';
const FPS = 30;

/** The slots' looks: the figure's clothes, trim and skin by default (D73), dark hair, darker soles. */
export const LOOKS: Readonly<Record<Slot, MaterialRecord>> = {
  clothes: { name: 'Clothes', color: '#4a6378', roughness: 0.85, metalness: 0 },
  trim: { name: 'Trim', color: '#6b4a2f', roughness: 0.8, metalness: 0 },
  skin: { name: 'Skin', color: '#c99a76', roughness: 0.7, metalness: 0 },
  hair: { name: 'Hair', color: '#3b2a1e', roughness: 0.9, metalness: 0 },
  soles: { name: 'Soles', color: '#2a2522', roughness: 0.95, metalness: 0 },
};

const round = (n: number) => Math.round(n * 1e5) / 1e5 + 0;

/** An sRGB colour as glTF's linear factors. */
function linear(hex: string): [number, number, number, number] {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return Math.round((c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * 1e4) / 1e4;
  };
  return [channel(0), channel(1), channel(2), 1];
}

/** The mesh: a primitive a slot, each vertex weighted wholly to its part's bone. */
function body(doc: Document, buffer: ReturnType<Document['createBuffer']>) {
  const mesh = doc.createMesh(CHARACTER);
  for (const slot of SLOTS) {
    const parts = PARTS.filter((part) => part.slot === slot);
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const joints: number[] = [];
    for (const part of parts) {
      const one = arrays([part.shape]);
      const first = positions.length / 3;
      positions.push(...one.positions);
      normals.push(...one.normals);
      for (const i of one.indices) indices.push(first + i);
      const joint = HUMANOID.indexOf(part.bone);
      for (let v = 0; v < one.positions.length / 3; v++) joints.push(joint, 0, 0, 0);
    }
    const weights = joints.map((_, i) => (i % 4 === 0 ? 1 : 0));
    const accessor = (type: 'VEC3' | 'VEC4' | 'SCALAR', array: Float32Array | Uint16Array) =>
      doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
    const look = LOOKS[slot];
    const material = doc
      .createMaterial(slot)
      .setBaseColorFactor(linear(look.color ?? '#b0b0b0'))
      .setRoughnessFactor(look.roughness ?? 0.8)
      .setMetallicFactor(look.metalness ?? 0);
    mesh.addPrimitive(
      doc
        .createPrimitive()
        .setAttribute('POSITION', accessor('VEC3', new Float32Array(positions)))
        .setAttribute('NORMAL', accessor('VEC3', new Float32Array(normals)))
        .setAttribute('JOINTS_0', accessor('VEC4', new Uint16Array(joints)))
        .setAttribute('WEIGHTS_0', accessor('VEC4', new Float32Array(weights)))
        .setIndices(accessor('SCALAR', new Uint16Array(indices)))
        .setMaterial(material),
    );
  }
  return mesh;
}

/** Each clip as an animation: every bone's turn and the hips' place, a key a frame, kept out of the ground. */
function clips(doc: Document, buffer: ReturnType<Document['createBuffer']>, nodes: ReadonlyMap<string, Node>) {
  for (const clip of CLIPS) {
    const animation = doc.createAnimation(clip.name);
    const frames = Math.round(clip.length * FPS);
    const times = Array.from({ length: frames + 1 }, (_, k) => round((k * clip.length) / frames));
    const poses = times.map((t) => grounded(clip.at(t)));
    const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(times)).setBuffer(buffer);
    const channel = (node: Node, path: 'rotation' | 'translation', type: 'VEC3' | 'VEC4', keys: number[]) => {
      const output = doc.createAccessor().setType(type).setArray(new Float32Array(keys)).setBuffer(buffer);
      const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
      animation
        .addSampler(sampler)
        .addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
    };
    for (const bone of HUMANOID) {
      const keys = poses.flatMap((pose) => turnOf(pose.turns[bone] ?? [0, 0, 0]));
      channel(nodes.get(bone) as Node, 'rotation', 'VEC4', keys);
    }
    const hips = poses.flatMap((pose) => (pose.hips ?? REST.hips).map(round));
    channel(nodes.get('hips') as Node, 'translation', 'VEC3', hips);
  }
}

/** The character as a glTF document: the skeleton at rest, the skinned body, and the clips. */
export function characterDocument(): Document {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(CHARACTER);
  const nodes = new Map<string, Node>();
  for (const bone of HUMANOID) {
    const node = doc.createNode(bone).setTranslation([...offsetOf(bone)]);
    nodes.set(bone, node);
    const up = PARENT[bone];
    if (up) (nodes.get(up) as Node).addChild(node);
    else scene.addChild(node);
  }
  // At rest every joint's world is a move to where it sits, so its inverse bind is the move back.
  const binds = new Float32Array(HUMANOID.length * 16);
  HUMANOID.forEach((bone, i) => {
    const [x, y, z] = REST[bone];
    binds.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1], i * 16);
  });
  const skin = doc
    .createSkin(CHARACTER)
    .setSkeleton(nodes.get('hips') as Node)
    .setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(binds).setBuffer(buffer));
  for (const bone of HUMANOID) skin.addJoint(nodes.get(bone) as Node);
  scene.addChild(doc.createNode(CHARACTER).setMesh(body(doc, buffer)).setSkin(skin));
  clips(doc, buffer, nodes);
  return doc;
}

const json = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

/** Every file of the starter character's folder, sorted by path. */
export async function makeCharacter(): Promise<CharacterFile[]> {
  const plain = await (await modelIO()).writeBinary(characterDocument());
  const glb = await packModel({ name: `${CHARACTER}.glb`, bytes: plain }, [], {});
  const model = {
    name: 'Starter character',
    file: `${CHARACTER}/${CHARACTER}.glb`,
    materials: SLOTS.map((slot) => ({ slot, material: `character-${slot}` })),
    collider: { shape: 'capsule', center: [0, HEIGHT / 2, 0], radius: 0.3, height: HEIGHT },
    rig: { bones: Object.fromEntries(HUMANOID.map((bone) => [bone, bone])) },
    clips: CLIPS.map((clip) => ({ name: clip.name, length: clip.length, ...(clip.pace ? { pace: clip.pace } : {}) })),
  };
  const files: CharacterFile[] = [
    { path: `assets/${CHARACTER}/${CHARACTER}.glb`, bytes: glb },
    { path: `records/model/${CHARACTER}.json`, bytes: json(model) },
    { path: `records/animator/${CHARACTER}.json`, bytes: json(STOCK_ANIMATOR) },
    ...SLOTS.map((slot) => ({ path: `records/material/character-${slot}.json`, bytes: json(LOOKS[slot]) })),
  ];
  const entry = {
    licence: 'CC0-1.0',
    author: 'RCJLabs',
    source: 'Made in code by RCJLabs for Engine-Builder, dedicated to the public domain',
    date: CHARACTER_DATE,
    tool: 'tools/starter-kit (character)',
  };
  files.push({ path: 'assets/assets.json', bytes: json({ files: { [`${CHARACTER}/${CHARACTER}.glb`]: entry } }) });
  files.push({
    path: 'project.json',
    bytes: json({ format: 1, id: CHARACTER, name: 'Starter character', version: '1.0.0' }),
  });
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
