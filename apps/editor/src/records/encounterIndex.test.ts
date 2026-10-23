/**
 * The record index with the encounters kit (M4.7): a fight naming nobody is E054 only while its
 * encounter names nobody either, in a game without the roster kit, so an edit to the encounter
 * checks the rows that fight it again, and the index updated equals the index read afresh.
 */
import { describe, expect, it } from 'vitest';
import { problemsOf, project, shown } from '../../test/index-files.ts';

const RAIDERS = 'records/encounter/raiders.json';

const raiders = (fighters?: string[]) =>
  JSON.stringify({
    name: 'Raiders',
    combat: 'broadside',
    foes: [{ actor: 'raider' }],
    ...(fighters ? { fighters } : {}),
  });

function fought() {
  const files = project();
  files.edit('project.json', (manifest) => {
    manifest.kits = ['stats', 'encounters'];
  });
  files.write('records/stat/hull.json', JSON.stringify({ name: 'Hull' }));
  files.write('records/actor/ship.json', JSON.stringify({ name: 'The ship' }));
  files.write('records/actor/raider.json', JSON.stringify({ name: 'Raider' }));
  files.write('records/combat/broadside.json', JSON.stringify({ health: 'hull', hit: 'hull', damage: 'hull' }));
  files.write(RAIDERS, raiders(['ship']));
  files.write(
    'records/sheet/hailed.json',
    JSON.stringify({
      rows: [{ id: 'a', when: { event: 'encounters/fought' }, do: [{ effect: 'fight', encounter: 'raiders' }] }],
    }),
  );
  return files;
}

describe('the index with the encounters kit', () => {
  it('checks every fight of an encounter again when the encounter changes who fights', async () => {
    const files = fought();
    let { index, fresh } = await files.update(null);
    expect(problemsOf(index, 'sheet:hailed')).toEqual([]);
    files.write(RAIDERS, raiders());
    ({ index, fresh } = await files.update([RAIDERS]));
    expect(problemsOf(index, 'sheet:hailed')).toEqual([
      'E054 /rows/0/do/0: Neither this fight nor raiders names its fighters, and without the roster kit nobody else fights',
    ]);
    expect(shown(index)).toEqual(shown(fresh));
    files.write(RAIDERS, raiders(['ship']));
    ({ index, fresh } = await files.update([RAIDERS]));
    expect(problemsOf(index, 'sheet:hailed')).toEqual([]);
    expect(shown(index)).toEqual(shown(fresh));
  });
});
