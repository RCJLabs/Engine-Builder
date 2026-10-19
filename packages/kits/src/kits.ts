/**
 * The kits a project can list in project.json (M3.3, D41, docs/specs/kits.md), in the engine's
 * order, which is the order their modules join a game. A kit's id is its module's id. The list
 * holds no module, so what only reads the list, project.json's checks and the editor's kit boxes,
 * doesn't bring the kits' sim code with it (modules.ts has that).
 */
import { ECONOMY } from './economy/types.ts';
import { EVENTS } from './events/types.ts';
import { FACTIONS } from './factions/types.ts';
import { GEAR } from './gear/types.ts';
import { INVENTORY } from './inventory/types.ts';
import { ROSTER } from './roster/types.ts';
import { STATS } from './stats/types.ts';
import { TIME } from './time/types.ts';

export interface Kit {
  readonly id: string;
  /** The kits it needs on beside it. */
  readonly needs: readonly string[];
}

export const KITS: readonly Kit[] = Object.freeze([
  { id: INVENTORY, needs: [] },
  { id: ECONOMY, needs: [INVENTORY] },
  { id: STATS, needs: [] },
  { id: GEAR, needs: [INVENTORY, STATS] },
  { id: FACTIONS, needs: [] },
  { id: TIME, needs: [] },
  { id: ROSTER, needs: [STATS] },
  { id: EVENTS, needs: [] },
]);

export const KIT_IDS: readonly string[] = Object.freeze(KITS.map((kit) => kit.id));

/** Why a project's list of kits is wrong, each at its place in the list: E033 and E034. */
export interface KitProblem {
  readonly code: 'E033' | 'E034';
  readonly index: number;
  readonly message: string;
}

/**
 * The kits on, in the engine's order, and the problems with the list. A kit the engine doesn't
 * have, or listed twice, is E033; one whose need is left out is E034 and is off, as is any kit
 * that needs it.
 */
export function kitsOn(listed: readonly unknown[]): { on: readonly string[]; problems: KitProblem[] } {
  const problems: KitProblem[] = [];
  const seen = new Set<string>();
  listed.forEach((id, index) => {
    if (typeof id !== 'string' || !KIT_IDS.includes(id)) {
      problems.push({
        code: 'E033',
        index,
        message: `There is no kit "${String(id)}": the kits are ${KIT_IDS.join(', ')}`,
      });
    } else if (seen.has(id)) {
      problems.push({ code: 'E033', index, message: `"${id}" is listed twice` });
    } else seen.add(id);
  });
  const on: string[] = [];
  for (const kit of KITS) {
    if (!seen.has(kit.id)) continue;
    const missing = kit.needs.filter((need) => !on.includes(need));
    if (missing.length === 0) on.push(kit.id);
    else {
      const index = listed.indexOf(kit.id);
      problems.push({ code: 'E034', index, message: `The ${kit.id} kit needs ${missing.join(' and ')} on too` });
    }
  }
  return { on, problems: problems.sort((a, b) => a.index - b.index) };
}
