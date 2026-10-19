/**
 * The record index with the roster kit (M3.6): a condition naming a rank or a bond band is checked
 * against the roster's (E040), a rank's status against its ladder, and a written actor's id
 * against the recruit templates (E035). Each check reads records an edit may not touch, so an
 * edit to one checks the others again, and the index updated equals the index read afresh.
 */
import { describe, expect, it } from 'vitest';
import { problemsOf, project, shown } from '../../test/index-files.ts';

const CREW = 'records/roster/crew.json';
const WATCH = 'records/sheet/watch.json';
const SEASONED = 'records/status/seasoned.json';

const crew = (ranks: object[]) => JSON.stringify({ ranks: { stat: 'fights', bands: ranks } });
const sheet = (condition: string) =>
  JSON.stringify({ rows: [{ id: 'a', when: { event: 'roster/joined' }, if: condition, do: [] }] });

/** Ludus with the stats and roster kits on, a ladder of two ranks, and a sheet reading one. */
function mustered() {
  const files = project();
  files.edit('project.json', (manifest) => {
    manifest.kits = ['stats', 'roster'];
  });
  files.write('records/stat/fights.json', '{}');
  files.write(SEASONED, JSON.stringify({ modifiers: [] }));
  files.write('records/actor/hand.json', '{}');
  files.write('records/recruit/deckhand.json', JSON.stringify({ actor: 'hand', names: ['Ketil'] }));
  files.write(CREW, crew([{ id: 'green' }, { id: 'veteran', from: 3, status: 'seasoned' }]));
  files.write(WATCH, sheet('roster.ranked(veteran) >= 1'));
  return files;
}

describe('the index with the roster', () => {
  it('checks every condition naming a rank again when the roster changes', async () => {
    const files = mustered();
    let { index, fresh } = await files.update(null);
    expect(problemsOf(index, 'sheet:watch')).toEqual([]);
    files.write(CREW, crew([{ id: 'green' }, { id: 'elite', from: 3 }]));
    ({ index, fresh } = await files.update([CREW]));
    expect(problemsOf(index, 'sheet:watch')).toEqual([
      'E040 /rows/0/if: The roster has no rank veteran: its ranks are green, elite',
    ]);
    expect(shown(index)).toEqual(shown(fresh));
  });

  it('checks the roster when a condition naming one of its ranks changes, so a sound one stays sound', async () => {
    const files = mustered();
    let { index, fresh } = await files.update(null);
    files.write(WATCH, sheet('roster.ranked(green) >= 2'));
    ({ index, fresh } = await files.update([WATCH]));
    expect(problemsOf(index, 'sheet:watch')).toEqual([]);
    expect(shown(index)).toEqual(shown(fresh));
  });

  it('checks the roster again when a status its ranks give changes', async () => {
    const files = mustered();
    let { index, fresh } = await files.update(null);
    files.write(SEASONED, JSON.stringify({ lasts: { days: 2 } }));
    ({ index, fresh } = await files.update([SEASONED]));
    expect(problemsOf(index, 'roster:crew')).toEqual([
      "E035 /ranks/bands/1/status: seasoned lasts a while: a rank's status is had for as long as the rank",
    ]);
    expect(shown(index)).toEqual(shown(fresh));
  });

  it('checks every actor again when a recruit template comes, as one may have its recruits’ ids', async () => {
    const files = mustered();
    files.write('records/actor/medic-1.json', '{}');
    let { index, fresh } = await files.update(null);
    expect(problemsOf(index, 'actor:medic-1')).toEqual([]);
    files.write('records/recruit/medic.json', JSON.stringify({ actor: 'hand', names: ['Ida'] }));
    ({ index, fresh } = await files.update(['records/recruit/medic.json']));
    expect(problemsOf(index, 'actor:medic-1')).toEqual([
      'E035 : A recruit made from medic could be called medic-1: name it otherwise',
    ]);
    expect(shown(index)).toEqual(shown(fresh));
  });
});
