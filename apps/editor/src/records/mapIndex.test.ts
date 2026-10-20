/**
 * The record index with the maps kit (M4.6): enter-map's node is checked against its map's nodes
 * (E053), so an edit to a drawn map checks the rows that enter it again, and the index updated
 * equals the index read afresh.
 */
import { describe, expect, it } from 'vitest';
import { problemsOf, project, shown } from '../../test/index-files.ts';

const VALLEY = 'records/map/valley.json';
const ARRIVE = 'records/sheet/arrive.json';

/** A valley drawn by hand: its nodes, a road joining them, and a drive. */
const valley = (ids: string[]) =>
  JSON.stringify({
    name: 'The valley',
    start: ids[0],
    nodes: ids.map((id, i) => ({ id, kind: 'camp', x: 10 + i * 20, y: 50 })),
    roads: ids.slice(1).map((id, i) => ({ from: ids[i], to: id })),
    moves: [{ id: 'drive', label: 'Drive' }],
  });

/** A row that enters the valley at a node it names. */
const sheet = (at: string) =>
  JSON.stringify({
    rows: [{ id: 'a', when: { event: 'maps/entered' }, do: [{ effect: 'enter-map', map: 'valley', at }] }],
  });

function drawn() {
  const files = project();
  files.edit('project.json', (manifest) => {
    manifest.kits = ['maps'];
  });
  files.write('records/node-kind/camp.json', JSON.stringify({ name: 'Camp' }));
  files.write(VALLEY, valley(['van', 'crag']));
  files.write(ARRIVE, sheet('crag'));
  return files;
}

describe('the index with the maps kit', () => {
  it('checks every enter-map naming a node again when its map changes', async () => {
    const files = drawn();
    let { index, fresh } = await files.update(null);
    expect([problemsOf(index, 'sheet:arrive'), problemsOf(index, 'map:valley')]).toEqual([[], []]);
    files.write(VALLEY, valley(['van', 'boulders']));
    ({ index, fresh } = await files.update([VALLEY]));
    expect(problemsOf(index, 'sheet:arrive')).toEqual(['E053 /rows/0/do/0/at: valley has no node crag']);
    expect(shown(index)).toEqual(shown(fresh));
    files.write(VALLEY, valley(['van', 'crag']));
    ({ index, fresh } = await files.update([VALLEY]));
    expect(problemsOf(index, 'sheet:arrive')).toEqual([]);
    expect(shown(index)).toEqual(shown(fresh));
  });
});
