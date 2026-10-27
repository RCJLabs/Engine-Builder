/** The ai kit (M6.3, D75, docs/specs/ai.md): behaviours, their run and awareness. */
export { SENSED_MOST, sightGain } from './aware.ts';
export { chooseLeaf, type Now, withinHours } from './choose.ts';
export { aiModule } from './module.ts';
export { childPath, childrenOf, kindOf, lastIndex, type NodeKind, nodeAt, parentOf, pathsTo } from './nodes.ts';
export {
  AI,
  type AiNpc,
  type AiSlice,
  ALERTED_AT,
  BEHAVIOUR,
  type BehaviourNode,
  type BehaviourRecord,
  CONE_DEG,
  GOING,
  type GuardNode,
  HEARING_M,
  LEAVES,
  LEVELS,
  type Leaf,
  type Length,
  type Level,
  levelOf,
  SIGHT_M,
  SUSPICIOUS_AT,
} from './types.ts';
