/**
 * The foes' turn, played by their AI inside the step that hands it to them (M7.5, D87,
 * docs/specs/tactics.md#actions): action by action until it is the crew's turn again or a side has won.
 * A refused action stands in for the end of their turn, and so does the hundred and first, as
 * Space-Wrecked's fight.js plays a side the AI has.
 */
import { aiAction } from './ai.ts';
import type { Arena, Rolls } from './field.ts';
import { pressAction } from './press.ts';
import { act } from './turns.ts';
import type { Battle, Move, Told } from './types.ts';

/** The most actions the foes' turn may take before it is ended for them. */
export const FOES_MOST = 100;

/** Who picks the foes' actions: the AI, or pressing on when the battle says so. */
export const foesPlayer = (arena: Arena) => (battle: Battle) =>
  arena.press ? pressAction(arena, battle) : aiAction(arena, battle);

export function playFoes(
  arena: Arena,
  start: Battle,
  rolls: Rolls,
  choose: (battle: Battle) => Move = foesPlayer(arena),
): { battle: Battle; told: Told[] } {
  let battle = start;
  const told: Told[] = [];
  for (let i = 0; !battle.winner && battle.side === 'foes'; i++) {
    let step = act(arena, battle, i >= FOES_MOST ? { type: 'end' } : choose(battle), rolls);
    if (!step.ok) step = act(arena, battle, { type: 'end' }, rolls);
    if (!step.ok) break;
    battle = step.battle;
    told.push(...step.told);
  }
  return { battle, told };
}
