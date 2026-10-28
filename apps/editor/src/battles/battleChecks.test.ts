/**
 * A battle checked in the editor (M7.5, D87), as projects/opened.ts runs the checks: the index, then the spaces'
 * checks. The boarding fight as it stands has no E096; a unit posted where another stands, and one posted at an
 * object the deck hasn't, each give E096 at its post, as eb validate gives them.
 */
import { compileProject, memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { filesOf } from '../../test/boardingWalk.ts';
import { readCatalog } from '../forms/catalog.ts';
import { projectProblems } from '../problems/collect.ts';
import { EMPTY_INDEX, updateIndex } from '../records/recordIndex.ts';
import { NO_SCRIPTS } from '../scripts/gameState.ts';
import { spaceProblems } from '../spaces/spaceChecks.ts';

const FIGHT = new URL('../../../../tools/cli/test/fixtures/fight', import.meta.url).pathname;
const BATTLE = 'records/battle/boarders.json';

async function checked(all: Record<string, Uint8Array>) {
  const source = memorySource(all);
  const catalog = await readCatalog(source);
  const index = await updateIndex(EMPTY_INDEX, source, catalog, null);
  const spaced = await spaceProblems(source, catalog, index, NO_SCRIPTS);
  return projectProblems(catalog, { ...index, spaces: spaced.problems });
}

const brief = (list: readonly { code: string; file?: string; path?: string; message: string }[]) =>
  list
    .filter((d) => d.code === 'E096')
    .map((d) => `${d.file} ${d.path} ${d.message}`)
    .sort();

describe('a battle in the editor', () => {
  it('gives E096 as eb validate does, at each post that is wrong, and none for the fight as it stands', async () => {
    const all = filesOf(FIGHT);
    expect(brief(await checked(all))).toEqual([]);
    const battle = JSON.parse(new TextDecoder().decode(all[BATTLE]));
    battle.crew[1].at = 'bridge-1';
    battle.foes[0].at = 'nowhere';
    all[BATTLE] = new TextEncoder().encode(JSON.stringify(battle, null, 2));
    const problems = brief(await checked(all));
    expect(problems).toEqual(brief((await compileProject(memorySource(all), [])).diagnostics));
    expect(problems).toEqual([
      `${BATTLE} /crew/1/at “bridge-1” is on tile 9, 1, where “ines” already stands`,
      `${BATTLE} /foes/0/at “nowhere” is no object on deck’s tilemap`,
    ]);
  });
});
