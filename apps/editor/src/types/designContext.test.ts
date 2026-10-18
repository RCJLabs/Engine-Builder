import { describe, expect, it } from 'vitest';
import { arena } from '../../test/fighter.ts';
import type { OpenProject } from '../projects/opened.ts';
import { type Design, designForm } from './designContext.ts';
import type { FieldChange } from './fieldEdits.ts';

const FILE = 'types/fighter.json';

/** A designer over the arena's fighter type that keeps the changes asked of it. */
function design() {
  const asked: { label: string; change: FieldChange; group?: string | undefined }[] = [];
  const shown: Design = {
    project: { catalog: {} } as unknown as OpenProject,
    type: 'fighter',
    file: FILE,
    json: JSON.parse(arena()[FILE] ?? '{}'),
    title: 'Fighter',
    canEdit: true,
    problemsAt: () => [],
    troubled: [],
    records: [],
    types: [],
    titleOf: (type) => type,
    change: async (label, change, group) => {
      asked.push({ label, change, group });
      return true;
    },
  };
  return { shown, asked };
}

describe('the designer’s form', () => {
  it('makes each box’s typing a step of its own, named for the box and the field', () => {
    const { shown, asked } = design();
    const form = designForm(shown, ['fields', 'name'], 'name in type fighter');
    form.set(['label'], 'Full name', 'Label');
    form.set(['description'], 'As the crowd calls it', 'Help');
    expect(asked.map(({ label, group }) => `${label} | ${group}`)).toEqual([
      'Edit Label of name in type fighter | types/fighter.json#/fields/name/label',
      'Edit Help of name in type fighter | types/fighter.json#/fields/name/description',
    ]);
    expect(asked[0]?.change(shown.json).file).toMatchObject({ fields: { name: { label: 'Full name' } } });
  });

  it('takes a box ticked off out of the file: a field is required unless it says otherwise', () => {
    const { shown, asked } = design();
    const form = designForm(shown, ['fields', 'rival'], 'rival in type fighter');
    form.set(['optional'], false, 'Optional');
    const after = asked[0]?.change(shown.json).file as { fields: { rival: object } };
    expect(after.fields.rival).toEqual({ kind: 'ref', to: ['fighter', 'beast'] });
  });
});
