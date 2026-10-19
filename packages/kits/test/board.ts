/**
 * The board: the dock (dock.ts) with a crew to fill quests' slots from, for M3.10's tests. Its
 * crew are number flags with names, so conditions, By and effects can name them without another
 * kit: a slot of type flag holds one. `withBoard` adds quests to the dock's.
 */
import type { Condition } from '@eb/core';
import { dockWith, RECORDS } from './dock.ts';

/** The crew: each a number flag, its value its fame, and a name for texts to show. */
export const CREW = {
  ana: { name: 'Ana', number: { start: 2, min: 0, max: 9 } },
  bo: { name: 'Bo', number: { start: 5, min: 0, max: 9 } },
  cy: { name: 'Cy', number: { start: 5, min: 0, max: 9 } },
  dee: { name: 'Dee', number: { start: 1, min: 0, max: 9 } },
};

/** "@slot's fame is at least n". */
export const fameAtLeast = (slot: string, n: number): Condition => ({
  fact: 'flag.number',
  args: { flag: `@${slot}` },
  op: '>=',
  value: n,
});

/** The dock with these quests beside its own, and the crew among its flags. */
export function withBoard(quests: Record<string, object>, flags: Record<string, object> = {}) {
  return dockWith({
    ...RECORDS,
    flag: { ...RECORDS.flag, ...CREW, ...flags },
    quest: { ...RECORDS.quest, ...quests },
  });
}
