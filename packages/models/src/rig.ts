/**
 * A model put on the engine's rig as it is imported (M6.5, D77, docs/specs/animation.md#importing-a-rigged-model):
 * its skeleton's joints mapped to the humanoid, normalised, and its clips made to play in place.
 * A skin missing a required bone is left as it came, its clips listed but not moved. A file with
 * clips and no skin (a clip set) is mapped from the nodes its clips move.
 */
import type { Document, Node } from '@gltf-transform/core';
import type { HumanBone } from './humanoid.ts';
import { type Clip, inPlace } from './inPlace.ts';
import { normaliseRig } from './normalise.ts';
import { type Joint, mapJoints } from './rigMap.ts';

export interface Rigged {
  /** Whether it was normalised onto the rig: false when a required bone is missing (W152). */
  readonly rigged: boolean;
  /** The humanoid bones found, each as its joint's name before normalising renamed it. */
  readonly bones: Partial<Record<HumanBone, string>>;
  readonly missing: readonly HumanBone[];
  /** The bones turned to the T-pose, and whether the model was turned to face −z. */
  readonly turned: readonly HumanBone[];
  readonly faced: boolean;
  readonly clips: readonly Clip[];
}

/** A clip set's skeleton: every node under the highest one its clips move, with no mesh of its own. */
function clipSkeleton(doc: Document): Node[] {
  const moved = new Set<Node>();
  for (const animation of doc.getRoot().listAnimations()) {
    for (const channel of animation.listChannels()) {
      const node = channel.getTargetNode();
      if (node) moved.add(node);
    }
  }
  const depth = (node: Node): number => {
    const up = node.getParentNode();
    return up ? depth(up) + 1 : 0;
  };
  const top = [...moved].sort((a, b) => depth(a) - depth(b))[0];
  if (!top) return [];
  const out: Node[] = [];
  top.traverse((node) => {
    if (!node.getMesh()) out.push(node);
  });
  return out;
}

const asJoints = (nodes: readonly Node[]): Joint[] =>
  nodes.map((node) => ({ name: node.getName(), parent: nodes.indexOf(node.getParentNode() as Node) }));

/** The model's skeleton put on the rig in place, or null for a model with no skin and no clips. */
export function rigModel(doc: Document, given: Partial<Record<HumanBone, string>> = {}): Rigged | null {
  const skin = doc.getRoot().listSkins()[0] ?? null;
  const nodes = skin ? skin.listJoints() : clipSkeleton(doc);
  if (nodes.length === 0) return null;
  const { bones, missing } = mapJoints(asJoints(nodes), given);
  const listed = (): Clip[] => inPlace(doc, null);
  if (missing.length > 0) return { rigged: false, bones, missing, turned: [], faced: false, clips: listed() };
  const { turned, faced } = normaliseRig(doc, nodes, bones, skin);
  const hips = nodes.find((node) => node.getName() === 'hips') ?? null;
  return { rigged: true, bones, missing, turned, faced, clips: inPlace(doc, hips) };
}
