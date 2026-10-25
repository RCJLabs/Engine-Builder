/**
 * The record index with the dialogue kit (M3.8): a condition naming a line or an option is
 * checked against its talk (E042), and a talk nothing opens is warned of (W123), so an edit to a
 * talk, or to a record naming one, checks them all again, and the index updated equals the index
 * read afresh.
 */
import { describe, expect, it } from 'vitest';
import { problemsOf, project, shown } from '../../test/index-files.ts';

const MARGE = 'records/talk/marge.json';
const WATCH = 'records/sheet/watch.json';
const UNOPENED = 'W123 : No row, choice, line, consequence, outcome or actor opens it';

/** A talk of lines one after another, opening at the first. */
const marge = (ids: string[]) =>
  JSON.stringify({
    starts: [{ line: ids[0] }],
    lines: ids.map((id, i) => ({ id, text: id, ...(i + 1 < ids.length ? { next: ids[i + 1] } : {}) })),
  });
/** A row that opens marge as a talk ends, under a condition, or a row that names no talk. */
const sheet = (condition?: string) =>
  JSON.stringify({
    rows: [
      condition === undefined
        ? { id: 'a', when: { event: 'dialogue/ended' }, do: [] }
        : { id: 'a', when: { event: 'dialogue/ended' }, if: condition, do: [{ effect: 'open-talk', talk: 'marge' }] },
    ],
  });

/** Ludus with the dialogue kit on, Marge's two lines, and a row reading one that opens her talk. */
function crag() {
  const files = project();
  files.edit('project.json', (manifest) => {
    manifest.kits = ['dialogue'];
  });
  files.write(MARGE, marge(['hello', 'tour']));
  files.write(WATCH, sheet('dialogue.heard(talk: marge, line: tour) >= 1'));
  return files;
}

describe('the index with the dialogue kit', () => {
  it('checks every condition naming a line again when its talk changes', async () => {
    const files = crag();
    let { index, fresh } = await files.update(null);
    expect([problemsOf(index, 'sheet:watch'), problemsOf(index, 'talk:marge')]).toEqual([[], []]);
    files.write(MARGE, marge(['hello', 'slab']));
    ({ index, fresh } = await files.update([MARGE]));
    expect(problemsOf(index, 'sheet:watch')).toEqual([
      'E042 /rows/0/if: The talk marge has no line tour: its lines are hello, slab',
    ]);
    expect(shown(index)).toEqual(shown(fresh));
  });

  it('warns of a talk once the row opening it stops, and no longer once one opens it again', async () => {
    const files = crag();
    let { index, fresh } = await files.update(null);
    files.write(WATCH, sheet());
    ({ index, fresh } = await files.update([WATCH]));
    expect(problemsOf(index, 'talk:marge')).toEqual([UNOPENED]);
    expect(shown(index)).toEqual(shown(fresh));
    files.write(WATCH, sheet('dialogue.said(talk: marge, option: shout)'));
    ({ index, fresh } = await files.update([WATCH]));
    expect([problemsOf(index, 'talk:marge'), problemsOf(index, 'sheet:watch')]).toEqual([
      [],
      ['E042 /rows/0/if: The talk marge has no option shout: it has no options'],
    ]);
    expect(shown(index)).toEqual(shown(fresh));
  });
});
