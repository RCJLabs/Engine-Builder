/**
 * The record index with the quests kit (M3.9): a condition naming a stage or an objective is
 * checked against its quest (E043), and a quest nothing starts is warned of (W125), so an edit to a
 * quest, or to a record naming one, checks them all again, and the index updated equals the index
 * read afresh.
 */
import { describe, expect, it } from 'vitest';
import { problemsOf, project, shown } from '../../test/index-files.ts';

const DEBT = 'records/quest/debt.json';
const WATCH = 'records/sheet/watch.json';
const UNSTARTED =
  'W125 : Nothing starts it: it isn’t at the start, has no Starts when, and no Start a quest or Set a quest’s stage names it';

/** A quest of stages one after another, each done once a flag is on. */
const debt = (ids: string[]) =>
  JSON.stringify({
    name: 'The miner’s debt',
    stages: ids.map((id, i) => ({
      id,
      objectives: [{ id: `${id}-done`, text: id, 'done-when': 'flag.on(paid)' }],
      ...(i + 1 < ids.length ? { next: ids[i + 1] } : {}),
    })),
  });
/**
 * A row that starts the debt as a quest is done, under a condition, or a row that does nothing. It
 * names no flag, so only the quest ties it to the debt: a flag both name would tie them anyway.
 */
const sheet = (condition?: string) =>
  JSON.stringify({
    rows: [
      condition === undefined
        ? { id: 'a', when: { event: 'quests/done' }, do: [] }
        : { id: 'a', when: { event: 'quests/done' }, if: condition, do: [{ effect: 'start-quest', quest: 'debt' }] },
    ],
  });

/** Ludus with the quests kit on, the debt's two stages, and a row reading one that starts the debt. */
function yard() {
  const files = project();
  files.edit('project.json', (manifest) => {
    manifest.kits = ['quests'];
  });
  files.write('records/flag/paid.json', '{}');
  files.write(DEBT, debt(['owed', 'square']));
  files.write(WATCH, sheet('quests.reached(quest: debt, stage: square)'));
  return files;
}

describe('the index with the quests kit', () => {
  it('checks every condition naming a stage again when its quest changes', async () => {
    const files = yard();
    let { index, fresh } = await files.update(null);
    expect([problemsOf(index, 'sheet:watch'), problemsOf(index, 'quest:debt')]).toEqual([[], []]);
    files.write(DEBT, debt(['owed', 'paid-up']));
    ({ index, fresh } = await files.update([DEBT]));
    expect(problemsOf(index, 'sheet:watch')).toEqual([
      'E043 /rows/0/if: The quest debt has no stage square: its stages are owed, paid-up',
    ]);
    expect(shown(index)).toEqual(shown(fresh));
  });

  it('warns of a quest once the row starting it stops, and no longer once one starts it again', async () => {
    const files = yard();
    let { index, fresh } = await files.update(null);
    files.write(WATCH, sheet());
    ({ index, fresh } = await files.update([WATCH]));
    expect(problemsOf(index, 'quest:debt')).toEqual([UNSTARTED]);
    expect(shown(index)).toEqual(shown(fresh));
    files.write(WATCH, sheet('quests.objective(quest: debt, objective: lost)'));
    ({ index, fresh } = await files.update([WATCH]));
    expect([problemsOf(index, 'quest:debt'), problemsOf(index, 'sheet:watch')]).toEqual([
      [],
      ['E043 /rows/0/if: The quest debt has no objective lost: its objectives are owed-done, square-done'],
    ]);
    expect(shown(index)).toEqual(shown(fresh));
  });
});
