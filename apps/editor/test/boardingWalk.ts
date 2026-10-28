/**
 * The boarding deck walked headless to its battle (M7.5, D87): the pack played through the session, the two
 * crew walked by the 2D stage's own walkers to the marks their behaviours send them to, the clock running on
 * time/elapse and each arrival told as the page tells it. The alarm sends them to their posts; once both
 * stand there, the boarders' sheet starts the battle. What the battle.test, the stage test and the e2e's
 * winning line share.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { compileWithGame, memorySource, type SpaceJson } from '@eb/compiler';
import type { Action, PackTiles, PackWorld } from '@eb/core';
import type { TacticsSlice } from '@eb/kits';
import { type Opened, openPack, type Play, startPlay } from '@eb/ui/session';
import { placesOf, sceneOf } from '../src/stage2d/scene.ts';
import { sendTo, stepWalker, type Walker, walkerOf } from '../src/stage2d/walkers.ts';
import { npcsAt } from '../src/walk/npcTell.ts';

export const BOARDING = join(import.meta.dirname, '../../../tools/cli/test/fixtures/boarding');
const FRAME_S = 0.1;
const ELAPSE_MS = 1000;

export function filesOf(root: string): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files[relative(root, path).split('\\').join('/')] = readFileSync(path);
    }
  };
  walk(root);
  return files;
}

export interface Boarding {
  readonly opened: Opened;
  readonly world: PackWorld;
  readonly tiles: PackTiles;
}

export async function openBoarding(): Promise<Boarding> {
  const compiled = await compileWithGame(memorySource(filesOf(BOARDING)));
  const tiles = compiled.pack?.world?.tiles?.deck;
  if (!compiled.pack?.world || !tiles) throw new Error(JSON.stringify(compiled.diagnostics));
  const open = openPack(JSON.parse(JSON.stringify(compiled.pack)));
  if (!open.ok) throw new Error(open.message);
  return { opened: open.opened, world: compiled.pack.world, tiles };
}

export const inBattle = (play: Play): boolean =>
  (play.state as unknown as { tactics: TacticsSlice }).tactics.battle !== null;

export interface Walked {
  readonly play: Play;
  readonly walkers: ReadonlyMap<string, Walker>;
  /** Each arrival the sim heard, as "actor mark". */
  readonly heard: readonly string[];
  /** One frame: the walkers stepped, a second elapsed, arrivals told; refused steps are skipped, as the page's are. */
  frame(): void;
}

/** A new game of the boarding deck on `seed`, walking. */
export function walkBoarding({ opened, world, tiles }: Boarding, seed: string): Walked {
  const space = world.spaces.deck as SpaceJson;
  const record = (key: string) => world.records[key];
  const play = startPlay(opened.setup, seed);
  const places = placesOf(space, world.prefabs);
  const walkers = new Map<string, Walker>();
  for (const item of sceneOf(space, world.prefabs, record)) {
    if (item.actor === undefined) continue;
    const speed = (record(`actor:${item.actor}`) as { speed?: number }).speed;
    walkers.set(item.actor, walkerOf(item.actor, item.at, speed, undefined));
  }
  const heard: string[] = [];
  const arrivals = new Map<string, string>();
  const tell = () => {
    for (const [actor, walker] of walkers) sendTo(walker, play.view.world?.npcs?.[actor], places, { tiles });
  };
  tell();
  return {
    play,
    walkers,
    heard,
    frame() {
      for (const walker of walkers.values()) {
        const arrived = stepWalker(walker, FRAME_S);
        if (arrived !== undefined) arrivals.set(walker.actor, arrived);
      }
      // As the page's clock: only while the game's mode takes it, so not in a battle.
      if (play.view.offered.some((o) => o.type === 'time/elapse')) play.act({ type: 'time/elapse', ms: ELAPSE_MS });
      if (arrivals.size > 0) {
        const list = [...walkers.values()].map((w) => ({
          actor: w.actor,
          at: [w.at[0], w.at[1], 0] as const,
          yaw: 90,
        }));
        const moved = play.act(npcsAt('deck', list, arrivals) as unknown as Action);
        for (const beat of moved.beats.filter((b) => b.type === 'world/npc-arrived')) {
          const { actor, at } = beat as unknown as { actor: string; at: string };
          heard.push(`${actor} ${at}`);
          if (arrivals.get(actor) === at) arrivals.delete(actor);
        }
      }
      tell();
    },
  };
}

/** A new game on `seed` with the alarm sounded and walked until the battle starts. */
export function toBattle(boarding: Boarding, seed: string): Walked {
  const walked = walkBoarding(boarding, seed);
  if (!walked.play.act({ type: 'world/use', space: 'deck', object: 'alarm' }).accepted) throw new Error('No alarm');
  for (let i = 0; i < 3000 && !inBattle(walked.play); i++) walked.frame();
  if (!inBattle(walked.play)) throw new Error(`No battle: ${walked.heard.join(', ')}`);
  return walked;
}
