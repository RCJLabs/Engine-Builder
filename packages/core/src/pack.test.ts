import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonical.ts';
import { createPack, PACK_FORMAT, PackError, packHash, readPack } from './pack.ts';
import { createRecordStore } from './records.ts';

const project = { id: 'salvage-run', name: 'Salvage Run', version: '0.1.0' };
const records = { item: { medkit: { name: 'Medkit', weight: 1 } }, actor: { rook: { name: 'Rook' } } };

/** A pack as it arrives from a file: parsed JSON, nothing shared with the original. */
const reloaded = (value: unknown): Record<string, unknown> => JSON.parse(canonicalJson(value));

describe('createPack', () => {
  it('hashes the format, project and records, whatever their key order', () => {
    const pack = createPack(project, records);
    expect(pack.format).toBe(PACK_FORMAT);
    expect(pack.hash).toMatch(/^[0-9a-f]{16}$/);
    const reordered = createPack(
      { version: '0.1.0', name: 'Salvage Run', id: 'salvage-run' },
      { actor: { rook: { name: 'Rook' } }, item: { medkit: { weight: 1, name: 'Medkit' } } },
    );
    expect(reordered.hash).toBe(pack.hash);
  });

  it('changes the hash when any part changes', () => {
    const base = createPack(project, records).hash;
    expect(createPack({ ...project, version: '0.1.1' }, records).hash).not.toBe(base);
    expect(createPack(project, { ...records, item: { medkit: { name: 'Medkit', weight: 2 } } }).hash).not.toBe(base);
    expect(packHash({ format: 2 as 1, project, records })).not.toBe(base);
  });
});

describe('readPack', () => {
  it('accepts a pack that went through a file, and the store reads it', () => {
    const pack = readPack(reloaded(createPack(project, records)));
    expect(createRecordStore(pack.records).getOrThrow('item', 'medkit')).toEqual({ name: 'Medkit', weight: 1 });
  });

  it('rejects a pack whose content no longer matches its hash', () => {
    const pack = reloaded(createPack(project, records));
    (pack.records as { item: { medkit: { weight: number } } }).item.medkit.weight = 5;
    expect(() => readPack(pack)).toThrow(/^The pack's hash is [0-9a-f]{16}, but its content hashes to [0-9a-f]{16}$/);
  });

  it('asks for a newer engine when the format is newer', () => {
    expect(() => readPack({ ...reloaded(createPack(project, records)), format: 2 })).toThrow(
      'This pack is format 2; this engine reads format 1. Update the engine.',
    );
  });

  it.each([
    ['not an object', [], 'A pack must be a JSON object'],
    ['an unknown format', { format: 'one' }, 'Unknown pack format: "one"'],
    ['an extra field', { extra: true }, 'Unknown pack fields: extra'],
    ['no project', { project: null }, 'The pack has no project'],
    ['an extra project field', { project: { ...project, author: 'x' } }, 'Unknown pack project fields: author'],
    [
      'a project without a valid id',
      { project: { ...project, id: 'Salvage Run' } },
      'The pack project has no valid id',
    ],
    ['a project without a version', { project: { id: 'x', name: 'X' } }, 'The pack project has no version'],
    ['records that are a list', { records: [] }, 'The pack has no records'],
    ['an invalid type name', { records: { Item: {} } }, '"Item" is not a valid record type name'],
    ['a type that is not an object', { records: { item: [] } }, "The pack's item records are not an object"],
    ['an invalid id', { records: { item: { 'Big Gun': {} } } }, '"item:Big Gun" does not have a valid record id'],
    ['no hash', { hash: 5 }, 'The pack has no hash'],
  ])('rejects %s', (_name, change, message) => {
    const pack = Array.isArray(change) ? change : { ...reloaded(createPack(project, records)), ...change };
    expect(() => readPack(pack)).toThrow(new PackError(message));
  });
});
