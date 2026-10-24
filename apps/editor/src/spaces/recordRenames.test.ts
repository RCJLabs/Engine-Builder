/** Renames reaching spaces and prefabs (M5.2, D64; D33): a record's, a type's and a field's, the project left with no problems. */
import { compileProject, memorySource, type ProjectSource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import type { FileChange } from '../editing/history.ts';
import { removeFieldChange, renameFieldChange } from '../types/fieldEdits.ts';
import { changeType, renameRecord, renameType } from '../types/typeEdits.ts';

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function project(): Record<string, string> {
  return {
    'project.json': json({ format: 1, id: 'yard', name: 'Yard', version: '0.1.0' }),
    'types/keeper.json': json({
      title: 'Keeper',
      nameField: 'name',
      fields: {
        name: { kind: 'text' },
        greeting: { kind: 'text', optional: true },
        friend: { kind: 'ref', to: 'keeper', optional: true },
      },
    }),
    'records/keeper/tom.json': json({ name: 'Tom' }),
    'records/keeper/ann.json': json({ name: 'Ann' }),
    'prefabs/house.json': json({ name: 'House', objects: [{ id: 'host', record: 'keeper:tom' }] }),
    'spaces/yard.json': json({
      name: 'Yard',
      objects: [
        { id: 'tom', record: 'keeper:tom', overrides: { greeting: 'Hail' } },
        { id: 'ann', record: 'keeper:ann', overrides: { friend: 'tom' } },
        { id: 'house', prefab: 'house', overrides: { host: { overrides: { greeting: 'Come in' } } } },
      ],
    }),
  };
}

/** The files after `changes`, as values, by path; a file gone is undefined. */
function applied(files: Record<string, string>, changes: readonly FileChange[]): Record<string, unknown> {
  const out: Record<string, string | undefined> = { ...files };
  for (const change of changes) out[change.path] = change.after ? new TextDecoder().decode(change.after) : undefined;
  return Object.fromEntries(
    Object.entries(out).flatMap(([path, text]) => (text === undefined ? [] : [[path, JSON.parse(text)]])),
  );
}

async function problems(files: Record<string, unknown>): Promise<string[]> {
  const source: ProjectSource = memorySource(Object.fromEntries(Object.entries(files).map(([p, v]) => [p, json(v)])));
  return (await compileProject(source, [])).diagnostics.map((d) => `${d.code} ${d.file} ${d.path}`);
}

describe('a rename reaching spaces', () => {
  it('of a record: its placements, and a ref to it in an override, inside prefabs too', async () => {
    const files = project();
    const after = applied(files, await renameRecord(memorySource(files), 'keeper', 'tom', 'thomas'));
    const yard = after['spaces/yard.json'] as { objects: { record?: string; overrides?: unknown }[] };
    expect(yard.objects[0]?.record).toBe('keeper:thomas');
    expect(yard.objects[1]?.overrides).toEqual({ friend: 'thomas' });
    expect((after['prefabs/house.json'] as { objects: { record: string }[] }).objects[0]?.record).toBe('keeper:thomas');
    expect(await problems(after)).toEqual([]);
  });

  it('of a type: every "type:id" of it there', async () => {
    const files = project();
    const after = applied(files, await renameType(memorySource(files), 'keeper', 'warden'));
    const yard = after['spaces/yard.json'] as { objects: { record?: string }[] };
    expect(yard.objects.map((o) => o.record)).toEqual(['warden:tom', 'warden:ann', undefined]);
    expect((after['prefabs/house.json'] as { objects: { record: string }[] }).objects[0]?.record).toBe('warden:tom');
    expect(await problems(after)).toEqual([]);
  });

  it('of a field: every placed record of the type’s overrides of it, a prefab’s inside included', async () => {
    const files = project();
    const after = applied(
      files,
      await changeType(memorySource(files), 'keeper', renameFieldChange([], 'greeting', 'hello')),
    );
    const yard = after['spaces/yard.json'] as { objects: { overrides?: unknown }[] };
    expect(yard.objects[0]?.overrides).toEqual({ hello: 'Hail' });
    expect(yard.objects[2]?.overrides).toEqual({ host: { overrides: { hello: 'Come in' } } });
    expect(await problems(after)).toEqual([]);
    // A field taken out goes from the overrides, and an override left empty with it.
    const gone = applied(files, await changeType(memorySource(files), 'keeper', removeFieldChange([], 'greeting')));
    expect((gone['spaces/yard.json'] as { objects: unknown[] }).objects[0]).toEqual({
      id: 'tom',
      record: 'keeper:tom',
    });
  });

  it('refused when an override holds the new name already', async () => {
    const files = {
      ...project(),
      'spaces/yard.json': json({
        name: 'Yard',
        objects: [{ id: 'tom', record: 'keeper:tom', overrides: { greeting: 'a', friend: 'ann' } }],
      }),
    };
    await expect(
      changeType(memorySource(files), 'keeper', renameFieldChange([], 'greeting', 'friend')),
    ).rejects.toThrow(/holds “friend” already/);
  });
});
