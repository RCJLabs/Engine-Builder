/**
 * What the Play panel's debug tools show of the game in play (M4.9, docs/specs/play-in-editor.md#what-the-panel-shows):
 * the recording's log, the state's slices with their facet hashes (M1.2), each quest's why, and
 * the time kit's date, read in the worker through the game's own facts, previews and checks.
 */
import { type Condition, DEBUG, type DebugSlice, type FactArgs, type GameState, readFacets } from '@eb/core';
import type { Opened, Shown } from '@eb/ui/session';
import type { DebugLook, LogLine, SliceShown } from './protocol.ts';
import { type QuestReader, type QuestWhy, questWhy } from './quests.ts';
import type { Recording } from './recording.ts';

/** The log lines a look carries: the last ones, where the cursor and the newest steps are. */
export const LOG_SHOWN = 200;

export function lookAt(opened: Opened, state: GameState, recording: Recording): DebugLook {
  const { lines, earlier } = logOf(recording);
  return {
    cursor: recording.cursor,
    recorded: recording.steps.length,
    full: recording.full,
    log: lines,
    earlier,
    slices: slicesOf(state),
    quests: questsOf(opened, state),
    time: timeOf(opened, state),
    debugSteps: (state[DEBUG] as DebugSlice | undefined)?.steps ?? 0,
  };
}

/** The steps and the refusals noted between them, in the order they came, the last LOG_SHOWN of them. */
export function logOf(recording: Recording): { lines: LogLine[]; earlier: number } {
  const lines: LogLine[] = [];
  const refusalsAfter = (n: number) =>
    recording.refusals
      .filter((refusal) => refusal.after === n)
      .map((refusal) => ({
        n: n + 1,
        label: refusal.label,
        beats: [],
        debug: refusal.debug,
        refused: refusal.reason,
        ahead: false,
      }));
  lines.push(...refusalsAfter(0));
  recording.steps.forEach((step, i) => {
    const { label, beats, debug } = step;
    lines.push({ n: i + 1, label, beats, debug, ahead: i >= recording.cursor });
    lines.push(...refusalsAfter(i + 1));
  });
  const earlier = Math.max(lines.length - LOG_SHOWN, 0);
  return { lines: lines.slice(earlier), earlier };
}

/** Each module's slice, and the kernel's, by its key in sorted order. */
function slicesOf(state: GameState): SliceShown[] {
  const facets = readFacets(state);
  return Object.entries(facets).map(([key, { hash, size }]) => ({
    key,
    hash,
    size,
    json: JSON.stringify(state[key], null, 2),
  }));
}

function questsOf(opened: Opened, state: GameState): QuestWhy[] {
  const { game, sim } = opened.setup;
  const catalog = game.catalog();
  if (!('quests.stage' in catalog)) return [];
  const content = game.content(state, sim);
  const reader: QuestReader = {
    catalog,
    shown: (quest) => game.preview(state, [{ effect: 'start-quest', quest }], sim)[0],
    stage: (quest) => {
      const stage = game.fact(state, 'quests.stage', { quest } as FactArgs, sim);
      return typeof stage === 'string' ? stage : undefined;
    },
    record: (quest) => content.get('quest', quest),
    check: (condition: Condition) => game.check(state, condition, sim),
  };
  return content.ids('quest').map((quest) => questWhy(reader, quest));
}

/** The date facts the time module has, those that take no arguments, as they read now. */
function timeOf(opened: Opened, state: GameState): Readonly<Record<string, Shown>> | undefined {
  const { game, sim } = opened.setup;
  const catalog = game.catalog();
  const ids = Object.keys(catalog).filter((id) => id.startsWith('time.') && catalog[id]?.args === undefined);
  if (ids.length === 0) return undefined;
  const shown: Record<string, Shown> = {};
  for (const id of ids) {
    const value = game.fact(state, id, undefined, sim);
    shown[id.slice('time.'.length)] =
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null;
  }
  return shown;
}
