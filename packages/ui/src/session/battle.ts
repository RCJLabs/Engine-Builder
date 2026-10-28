/**
 * What the stage reads of a battle (M7.5, D87, docs/specs/tactics.md#the-stage): the battle under way as the
 * tactics kit's battleView gives it, its odds the kit's own shotOdds, and the tactics beats of the last step
 * that had any. A step's beats never reach the stage any other way, and the foes' whole turn is played inside
 * the crew's step that hands it over, so the stage plays each step's beats back once, by its number, and the
 * last of a battle after it is over.
 */
import type { Beat, GameState, PackTiles, RecordStore } from '@eb/core';
import { arenaOf, type Battle, type BattleView, battleRecord, battleView, TACTICS, type TacticsSlice } from '@eb/kits';

export interface BattleShown {
  /** The space the battle is fought on. */
  readonly space: string;
  readonly battle: string;
  /** The battle under way as the page shows it; none once it is over. */
  readonly view?: BattleView;
  /** The tactics beats of the last step that had any, oldest first. */
  readonly told: readonly Beat[];
  /** That step's number, the kernel's: the stage plays each step's beats once. */
  readonly step: number;
}

/** The last step's battle beats as the session keeps them. */
export interface Told {
  readonly space: string;
  readonly battle: string;
  readonly beats: readonly Beat[];
  readonly step: number;
}

const PREFIX = `${TACTICS}/`;
const under = (state: GameState): Battle | null => (state[TACTICS] as TacticsSlice | undefined)?.battle ?? null;

/** The step's tactics beats, kept with their battle; the last ones kept when a step has none. */
export function toldAfter(
  last: Told | undefined,
  before: GameState,
  after: GameState,
  beats: readonly Beat[],
  content: RecordStore,
): Told | undefined {
  const mine = beats.filter((beat) => beat.type.startsWith(PREFIX));
  const battle = under(after)?.battle ?? under(before)?.battle;
  if (mine.length === 0 || battle === undefined) return last;
  return { space: battleRecord(content, battle).space, battle, beats: mine, step: after.kernel.step };
}

/** The battle as the stage reads it, in a game with the tactics kit and a tilemap; none before the first. */
export function battleOf(
  state: GameState,
  content: RecordStore,
  tiles: Readonly<Record<string, PackTiles>>,
  told: Told | undefined,
): BattleShown | undefined {
  const battle = under(state);
  if (battle) {
    const view = battleView(arenaOf(content, tiles, battle.battle), battle);
    const fresh = told?.battle === battle.battle ? told : undefined;
    const space = battleRecord(content, battle.battle).space;
    return { space, battle: battle.battle, view, told: fresh?.beats ?? [], step: fresh?.step ?? 0 };
  }
  return told ? { space: told.space, battle: told.battle, told: told.beats, step: told.step } : undefined;
}
