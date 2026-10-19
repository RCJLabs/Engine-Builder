/**
 * The record index with the events kit (M3.7): a condition naming a choice is checked against its
 * event's choices (E041), so an edit to the event checks every record naming it again, and the
 * index updated equals the index read afresh.
 */
import { describe, expect, it } from 'vitest';
import { problemsOf, project, shown } from '../../test/index-files.ts';

const RAIDERS = 'records/event/raiders.json';
const WATCH = 'records/sheet/watch.json';

const raiders = (ids: string[]) => JSON.stringify({ choices: ids.map((id) => ({ id, label: id })) });
const sheet = (condition: string) =>
  JSON.stringify({ rows: [{ id: 'a', when: { event: 'events/chosen' }, if: condition, do: [] }] });

/** Ludus with the events kit on, the raiders' two choices, and a sheet reading one. */
function road() {
  const files = project();
  files.edit('project.json', (manifest) => {
    manifest.kits = ['events'];
  });
  files.write(RAIDERS, raiders(['pay', 'fight']));
  files.write(WATCH, sheet('events.chose(event: raiders, choice: fight)'));
  return files;
}

describe('the index with the events kit', () => {
  it('checks every condition naming a choice again when its event changes', async () => {
    const files = road();
    let { index, fresh } = await files.update(null);
    expect(problemsOf(index, 'sheet:watch')).toEqual([]);
    files.write(RAIDERS, raiders(['pay', 'flee']));
    ({ index, fresh } = await files.update([RAIDERS]));
    expect(problemsOf(index, 'sheet:watch')).toEqual([
      'E041 /rows/0/if: The event raiders has no choice fight: its choices are pay, flee',
    ]);
    expect(shown(index)).toEqual(shown(fresh));
  });

  it('checks the event when a condition naming one of its choices changes, so a sound one stays sound', async () => {
    const files = road();
    let { index, fresh } = await files.update(null);
    files.write(WATCH, sheet('events.chose(event: raiders, choice: pay)'));
    ({ index, fresh } = await files.update([WATCH]));
    expect(problemsOf(index, 'sheet:watch')).toEqual([]);
    files.write(WATCH, sheet('events.chose(event: raiders, choice: run)'));
    ({ index, fresh } = await files.update([WATCH]));
    expect(problemsOf(index, 'sheet:watch')).toEqual([
      'E041 /rows/0/if: The event raiders has no choice run: its choices are pay, fight',
    ]);
    expect(shown(index)).toEqual(shown(fresh));
  });
});
