import { memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { FIXTURE_V1, readFixture } from '../../../../packages/compiler/test/fixture.ts';
import { recordsLine, summarize } from './summary.ts';

describe('summarize', () => {
  it('names the project and counts its records by type', async () => {
    const summary = await summarize(
      memorySource({ ...readFixture(FIXTURE_V1), 'records/item/notes.md': 'x', 'README.md': 'x' }),
    );
    expect(summary).toEqual({
      project: { id: 'salvage-run', name: 'Salvage Run', version: '0.1.0' },
      files: 6,
      types: [
        { type: 'actor', records: 1 },
        { type: 'item', records: 2 },
        { type: 'loot-table', records: 1 },
      ],
      problems: [],
    });
    expect(recordsLine(summary)).toBe('4 records in 3 types');
  });

  it('lists what is wrong: no project.json, and records outside a type folder', async () => {
    const summary = await summarize(memorySource({ 'records/medkit.json': '{}', 'records/item/a/b.json': '{}' }));
    expect(summary.project).toBeNull();
    expect(summary.problems).toEqual([
      'There is no project.json.',
      'records/item/a/b.json looks like a record but sits outside a type folder.',
      'records/medkit.json looks like a record but sits outside a type folder.',
    ]);
    expect(recordsLine(summary)).toBe('No records yet');
  });

  it('counts one record in one type as one', async () => {
    const summary = await summarize(memorySource({ 'records/item/a.json': '{}' }));
    expect(recordsLine(summary)).toBe('1 record in 1 type');
  });
});
