import { compileProject, type ProjectSource } from '@eb/compiler';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FIXTURE_LUDUS, readFixture } from '../../../../packages/compiler/test/fixture.ts';
import { readCatalog } from '../forms/catalog.ts';
import { EMPTY_INDEX, type RecordIndex, updateIndex, usersOf } from './recordIndex.ts';

/**
 * The ludus project as files that change between reads, as a working copy's do. `reversed` lists
 * them backwards: OPFS promises no order.
 */
function project(reversed = false) {
  const encoder = new TextEncoder();
  const files = new Map(Object.entries(readFixture(FIXTURE_LUDUS)).map(([path, text]) => [path, encoder.encode(text)]));
  const source: ProjectSource = {
    files: async (dir) => {
      const found = [...files.keys()].filter((path) => dir === '' || path.startsWith(`${dir}/`));
      return reversed ? found.reverse() : found;
    },
    read: async (path) => files.get(path),
  };
  let index: RecordIndex = EMPTY_INDEX;
  return {
    source,
    write: (path: string, text: string | null) => {
      if (text === null) files.delete(path);
      else files.set(path, encoder.encode(text));
    },
    edit: (path: string, change: (value: Record<string, unknown>) => void) => {
      const value = JSON.parse(new TextDecoder().decode(files.get(path)));
      change(value);
      files.set(path, encoder.encode(JSON.stringify(value)));
    },
    /** The index after `paths` changed (all of them when null), and the index read afresh. */
    update: async (paths: readonly string[] | null) => {
      const catalog = await readCatalog(source);
      index = await updateIndex(index, source, catalog, paths);
      return { index, fresh: await updateIndex(EMPTY_INDEX, source, catalog, null) };
    },
  };
}

const problemsOf = (index: RecordIndex, key: string) =>
  index.records.get(key)?.problems.map((d) => `${d.code} ${d.path}: ${d.message}`);

/** What a table shows of the index, to compare an updated index with one read afresh. */
const shown = (index: RecordIndex) => ({
  records: [...index.records.values()].map(({ key, value, checked, problems, refs }) => ({
    key,
    value,
    checked,
    problems,
    refs,
  })),
  usedBy: Object.fromEntries(index.usedBy),
});

const SPICULUS = 'records/gladiator/spiculus.json';
const MAGNUS = 'records/school/ludus-magnus.json';

describe('updateIndex', () => {
  it('reads every record with its problems and references, and what refers to each', async () => {
    const { index } = await project().update(null);
    expect([...index.records.keys()].sort()).toEqual([
      'gladiator:flamma',
      'gladiator:priscus',
      'gladiator:spiculus',
      'school:ludus-dacicus',
      'school:ludus-magnus',
      'weapon:gladius',
      'weapon:net',
      'weapon:trident',
    ]);
    expect([...index.records.values()].flatMap((r) => r.problems)).toEqual([]);
    expect(index.records.get('gladiator:spiculus')?.refs).toEqual([
      { to: 'school:ludus-magnus', path: '/school' },
      { to: 'weapon:gladius', path: '/kit/gladius' },
    ]);
    expect(index.usedBy.get('school:ludus-magnus')).toEqual([
      { from: 'gladiator:priscus', file: 'records/gladiator/priscus.json', path: '/school' },
      { from: 'gladiator:spiculus', file: SPICULUS, path: '/school' },
    ]);
    expect(usersOf(index, 'weapon:trident')).toEqual(['gladiator:priscus']);
    expect(usersOf(index, 'school:ludus-dacicus')).toEqual(['gladiator:flamma']);
  });

  it('checks again only the records an edit changed', async () => {
    const files = project();
    const { index: before } = await files.update(null);
    files.edit(SPICULUS, (value) => {
      value.might = 150;
    });
    const { index, fresh } = await files.update([SPICULUS]);
    expect(problemsOf(index, 'gladiator:spiculus')).toEqual(['E001 /might: At most 100']);
    for (const key of ['gladiator:flamma', 'school:ludus-magnus', 'weapon:net']) {
      expect(index.records.get(key)).toBe(before.records.get(key));
    }
    expect(shown(index)).toEqual(shown(fresh));
  });

  it('checks again what refers to a record deleted, and to one created', async () => {
    const files = project();
    await files.update(null);
    const magnus = new TextDecoder().decode(await files.source.read(MAGNUS));
    files.write(MAGNUS, null);
    let { index, fresh } = await files.update([MAGNUS]);
    // spiculus's file didn't change, but its school is gone.
    expect(problemsOf(index, 'gladiator:spiculus')).toEqual(['E005 /school: No record school:ludus-magnus']);
    expect(usersOf(index, 'school:ludus-magnus')).toEqual(['gladiator:priscus', 'gladiator:spiculus']);
    expect(shown(index)).toEqual(shown(fresh));
    files.write(MAGNUS, magnus);
    ({ index, fresh } = await files.update([MAGNUS]));
    expect(problemsOf(index, 'gladiator:spiculus')).toEqual([]);
    expect(shown(index)).toEqual(shown(fresh));
  });

  it('checks everything again when a type file or an asset changes', async () => {
    const files = project();
    await files.update(null);
    files.edit('types/gladiator.json', (type) => {
      (type.fields as Record<string, { max?: number }>).might = { kind: 'int', min: 0, max: 50 } as never;
    });
    let { index, fresh } = await files.update(['types/gladiator.json']);
    expect(problemsOf(index, 'gladiator:spiculus')).toEqual(['E001 /might: At most 50']);
    expect(shown(index)).toEqual(shown(fresh));
    files.write('assets/portraits/spiculus.svg', null);
    ({ index, fresh } = await files.update(['assets/portraits/spiculus.svg']));
    expect(problemsOf(index, 'gladiator:spiculus')).toEqual([
      'E001 /might: At most 50',
      'E018 /portrait: No file assets/portraits/spiculus.svg',
    ]);
    expect(shown(index)).toEqual(shown(fresh));
  });

  it('keeps a record whose file is not JSON, with the compiler’s E007, and its users’ references resolve', async () => {
    const files = project();
    await files.update(null);
    files.write(MAGNUS, '{ "name": ');
    const { index } = await files.update([MAGNUS]);
    expect(problemsOf(index, 'school:ludus-magnus')).toEqual([expect.stringMatching(/^E007 : /) as unknown as string]);
    expect(index.records.get('school:ludus-magnus')?.value).toBeUndefined();
    expect(problemsOf(index, 'gladiator:spiculus')).toEqual([]);
  });

  it('lists records of a type with no sound type file, unchecked', async () => {
    const files = project();
    files.write('records/horse/bucephalus.json', '{ "speed": "fast" }');
    files.write('types/weapon.json', '{ "title": "" }');
    const { index } = await files.update(null);
    expect(index.records.get('horse:bucephalus')).toMatchObject({ checked: false, problems: [], refs: [] });
    expect(index.records.get('weapon:net')).toMatchObject({ checked: false, problems: [] });
    // Their records still exist, so references to them resolve.
    expect(problemsOf(index, 'gladiator:flamma')).toEqual([]);
  });

  it('reads a file again when anything may have changed, though nothing names it', async () => {
    const files = project();
    await files.update(null);
    // Another tab's save that named no files (an editor from before M2.5).
    files.edit(SPICULUS, (value) => {
      value.might = 150;
    });
    const { index } = await files.update(null);
    expect(problemsOf(index, 'gladiator:spiculus')).toEqual(['E001 /might: At most 100']);
  });

  it('stops checking a type’s records when its file breaks, and checks them again when it mends', async () => {
    const files = project();
    await files.update(null);
    const weapon = new TextDecoder().decode(await files.source.read('types/weapon.json'));
    files.write('types/weapon.json', '{ "title": "" }');
    let { index, fresh } = await files.update(['types/weapon.json']);
    expect(index.records.get('weapon:net')).toMatchObject({ checked: false, problems: [] });
    expect(shown(index)).toEqual(shown(fresh));
    files.write('types/weapon.json', weapon.replace('"max": 20', '"max": 1'));
    ({ index, fresh } = await files.update(['types/weapon.json']));
    expect(index.records.get('weapon:net')).toMatchObject({ checked: true });
    expect(problemsOf(index, 'weapon:trident')).toEqual(['E001 /weight: At most 1']);
    expect(shown(index)).toEqual(shown(fresh));
  });

  it('keeps used by in order however the folder lists its files', async () => {
    const files = project(true);
    files.write(
      'types/troupe.json',
      JSON.stringify({ title: 'Troupe', fields: { schools: { kind: 'list', of: { kind: 'ref', to: 'school' } } } }),
    );
    files.write('records/troupe/t1.json', JSON.stringify({ schools: ['ludus-magnus'] }));
    const { index } = await files.update(null);
    expect(usersOf(index, 'school:ludus-magnus')).toEqual(['gladiator:priscus', 'gladiator:spiculus', 'troupe:t1']);
  });

  it('keeps every entry when the files read the same again', async () => {
    const files = project();
    const { index: before } = await files.update(null);
    const { index } = await files.update(null);
    for (const [key, record] of before.records) expect(index.records.get(key)).toBe(record);
  });

  it('agrees with the compiler', async () => {
    const files = project();
    files.edit(SPICULUS, (value) => {
      value.school = 'ludus-nowhere';
      value.might = -1;
    });
    files.write('records/weapon/net.json', '[');
    const { index } = await files.update(null);
    const compiled = await compileProject(files.source, []);
    const fromIndex = [...index.records.values()].flatMap((r) => r.problems);
    expect(fromIndex.map((d) => `${d.type}:${d.id} ${d.code} ${d.path}`).sort()).toEqual(
      compiled.diagnostics
        .filter((d) => d.id !== undefined)
        .map((d) => `${d.type}:${d.id} ${d.code} ${d.path}`)
        .sort(),
    );
    expect(Object.fromEntries(index.usedBy)).toEqual(Object.fromEntries(compiled.usedBy));
  });
});

describe('updateIndex, edit after edit', () => {
  // Each step changes the files, then the index is updated by the paths it changed.
  const step = fc.oneof(
    fc.record({
      kind: fc.constant('might' as const),
      who: fc.constantFrom('spiculus', 'flamma'),
      n: fc.integer({ min: -5, max: 120 }),
    }),
    fc.record({
      kind: fc.constant('school' as const),
      who: fc.constantFrom('spiculus', 'priscus'),
      to: fc.constantFrom('ludus-magnus', 'ludus-dacicus', 'ludus-nova'),
    }),
    fc.record({
      kind: fc.constant('toggle' as const),
      path: fc.constantFrom(MAGNUS, 'records/school/ludus-nova.json', 'records/weapon/trident.json'),
    }),
    fc.record({ kind: fc.constant('break' as const), path: fc.constantFrom(MAGNUS, SPICULUS) }),
    fc.record({ kind: fc.constant('type' as const), max: fc.integer({ min: 10, max: 100 }) }),
  );

  it('always matches the index read afresh', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(step, { minLength: 1, maxLength: 8 }), async (steps) => {
        const files = project();
        await files.update(null);
        const school = '{ "name": "Ludus Novus", "colour": "#123456" }';
        for (const s of steps) {
          let path: string;
          if (s.kind === 'might' || s.kind === 'school') {
            path = `records/gladiator/${s.who}.json`;
            const text = new TextDecoder().decode(await files.source.read(path));
            if (!text.startsWith('{') || !text.trim().endsWith('}')) continue;
            try {
              JSON.parse(text);
            } catch {
              continue;
            }
            files.edit(path, (value) => {
              if (s.kind === 'might') value.might = s.n;
              else value.school = s.to;
            });
          } else if (s.kind === 'toggle') {
            path = s.path;
            const there = (await files.source.read(path)) !== undefined;
            files.write(
              path,
              there ? null : path.includes('weapon') ? '{ "name": "Trident", "weight": 4, "reach": "long" }' : school,
            );
          } else if (s.kind === 'break') {
            path = s.path;
            files.write(path, '{ "oops": ');
          } else {
            path = 'types/gladiator.json';
            files.edit(path, (type) => {
              (type.fields as Record<string, unknown>).might = { kind: 'int', min: 0, max: s.max };
            });
          }
          const { index, fresh } = await files.update([path]);
          expect(shown(index)).toEqual(shown(fresh));
        }
      }),
      { numRuns: 60 },
    );
  });
});
