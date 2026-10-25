/**
 * An NPC's behaviour run after an event (docs/specs/ai.md#behaviours): the leaf chosen now starts
 * if it is new, or goes on: an arrival finishes travel, sleep and work and starts a patrol's or a
 * sandbox's dwell, a dwell or wait that is due ends. A guard left starts its cooldown; an in-order
 * left starts from the top the next time it is chosen; one whose child finished goes on to the next.
 * An attack left stands the NPC first, so a leaf that sets no goal of its own doesn't go on fighting.
 */
import type { Effect } from '@eb/core';
import { bind } from '../quests/slots.ts';
import { chooseLeaf, type Now } from './choose.ts';
import { type Ai, goals } from './goals.ts';
import { kindOf, lastIndex, nodeAt, parentOf, pathsTo } from './nodes.ts';
import { type AiNpc, type BehaviourNode, GOING, type GuardNode, type Leaf } from './types.ts';

/** One check starts each leaf at most once, and goes no further than this many leaves down an in-order. */
const MOST_STEPS = 16;

type Run = { -readonly [K in keyof AiNpc]: AiNpc[K] };

/** Runs the actor's behaviour on from what it was doing; what it does now is kept in the slice. */
export function runBehaviour(ai: Ai, actor: string, tree: BehaviourNode, now: Now): void {
  const started = new Set<string>();
  const check: Now = { ...now, check: (condition) => now.check(bind(condition, { self: actor })) };
  for (let step = 0; step < MOST_STEPS; step++) {
    const was = ai.npc(actor);
    const leaf = chooseLeaf(tree, was, check);
    let run: Run = { ...was };
    if (leaf !== was?.leaf) {
      if (leaf !== undefined && started.has(leaf)) return;
      run = left(ai, tree, was, leaf, now.tick);
      const fought = was?.leaf !== undefined && kindOf(nodeAt(tree, was.leaf)) === 'attack';
      if (leaf === undefined) {
        ai.save(actor, run);
        if (was?.leaf !== undefined) goals(ai, actor).stand();
        ai.doing(actor, undefined);
        return;
      }
      if (fought) goals(ai, actor).stand();
      started.add(leaf);
      start(ai, actor, run, nodeAt(tree, leaf) as BehaviourNode, now.tick);
      ai.save(actor, run);
      ai.doing(actor, kindOf(nodeAt(tree, leaf)) as Leaf);
    } else if (leaf !== undefined) {
      goOn(ai, actor, run, nodeAt(tree, leaf) as BehaviourNode, now.tick);
      ai.save(actor, run);
    }
    if (leaf === undefined || run.done !== true || !nextInOrder(tree, leaf, run)) return;
    ai.save(actor, run);
  }
}

/** The run as the old leaf is left for `leaf`: cooldowns started, in-orders left reset, the rest let go. */
function left(ai: Ai, tree: BehaviourNode, was: AiNpc | undefined, leaf: string | undefined, tick: number): Run {
  const on = new Set(leaf === undefined ? [] : pathsTo(leaf));
  const cool: Record<string, number> = { ...(was?.cool ?? {}) };
  const orders: Record<string, number> = { ...(was?.orders ?? {}) };
  for (const path of was?.leaf === undefined ? [] : pathsTo(was.leaf)) {
    if (on.has(path)) continue;
    const node = nodeAt(tree, path);
    const kind = kindOf(node);
    if (kind === 'guard' && (node as GuardNode).cooldown)
      cool[path] = tick + ai.ticks((node as GuardNode).cooldown ?? {});
    if (kind === 'in-order') delete orders[path];
  }
  for (const [path, until] of Object.entries(cool)) if (until <= tick) delete cool[path];
  return {
    ...(leaf !== undefined ? { leaf } : {}),
    ...(Object.keys(orders).length > 0 ? { orders } : {}),
    ...(Object.keys(cool).length > 0 ? { cool } : {}),
  };
}

function start(ai: Ai, actor: string, run: Run, node: BehaviourNode, tick: number): void {
  const go = goals(ai, actor);
  const kind = kindOf(node) as Leaf;
  const n = node as Record<string, unknown>;
  if (GOING.has(kind)) {
    const to = n[kind] as string;
    if (ai.arrivedAt(actor) === to) {
      go.stand();
      run.done = true;
    } else go.walkTo(to);
  } else if (kind === 'patrol' || kind === 'sandbox') {
    const points = n[kind] as readonly string[];
    run.step = 0;
    run.at = kind === 'patrol' ? (points[0] as string) : draw(ai, actor, points, ai.arrivedAt(actor));
    if (ai.arrivedAt(actor) === run.at) run.until = tick + ai.ticks((n.dwell as Record<string, number>) ?? {});
    else go.walkTo(run.at);
  } else if (kind === 'follow') go.follow(n.distance as number | undefined);
  else if (kind === 'wait') {
    go.stand();
    run.until = tick + ai.ticks(n.wait as Record<string, number>);
  } else if (kind === 'face') {
    go.stand(true);
    run.done = true;
  } else if (kind === 'attack') go.attack();
  else if (kind === 'effects') {
    for (const effect of n.effects as readonly Effect[]) ai.apply(bind(effect, { self: actor }));
    run.done = true;
  }
}

function goOn(ai: Ai, actor: string, run: Run, node: BehaviourNode, tick: number): void {
  const kind = kindOf(node) as Leaf;
  const n = node as Record<string, unknown>;
  if (GOING.has(kind)) {
    if (run.done !== true && ai.arrivedAt(actor) === n[kind]) run.done = true;
  } else if (kind === 'patrol' || kind === 'sandbox') {
    const points = n[kind] as readonly string[];
    if (run.until === undefined) {
      if (ai.arrivedAt(actor) === run.at) run.until = tick + ai.ticks((n.dwell as Record<string, number>) ?? {});
    }
    if (run.until !== undefined && tick >= run.until) {
      delete run.until;
      const next = kind === 'patrol' ? ((run.step ?? 0) + 1) % points.length : 0;
      run.step = next;
      run.at = kind === 'patrol' ? (points[next] as string) : draw(ai, actor, points, run.at);
      goals(ai, actor).walkTo(run.at);
    }
  } else if (kind === 'wait' && run.until !== undefined && tick >= run.until) {
    delete run.until;
    run.done = true;
  }
}

/** A sandbox's next point, from the NPC's own stream: never the one it stands at, when there is another. */
function draw(ai: Ai, actor: string, points: readonly string[], not: string | undefined): string {
  const choices = points.length > 1 && not !== undefined ? points.filter((p) => p !== not) : points;
  return choices[ai.draw(actor, choices.length)] as string;
}

/**
 * After a leaf finishes: the nearest in-order above it that isn't at its last child goes on to the
 * next, and the run starts that child's leaf; one at its last stays there. True when one went on.
 */
function nextInOrder(tree: BehaviourNode, leaf: string, run: Run): boolean {
  for (let child = leaf, path = parentOf(leaf); path !== undefined; child = path, path = parentOf(path)) {
    if (kindOf(nodeAt(tree, path)) !== 'in-order') continue;
    const count = ((nodeAt(tree, path) as Record<string, unknown>)['in-order'] as unknown[]).length;
    const at = lastIndex(child);
    if (at < count - 1) {
      run.orders = { ...(run.orders ?? {}), [path]: at + 1 };
      return true;
    }
  }
  return false;
}
