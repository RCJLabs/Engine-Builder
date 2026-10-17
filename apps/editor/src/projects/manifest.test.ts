import { RECORD_ID_PATTERN } from '@eb/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { idFromName, newManifest, readManifest } from './manifest.ts';

const bytes = (text: string) => new TextEncoder().encode(text);
// Built from its code: a formatter may turn the escape into an invisible character.
const BOM = String.fromCharCode(0xfeff);

describe('idFromName', () => {
  it('turns a name into lowercase words joined by hyphens', () => {
    expect(idFromName('Salvage Run!')).toBe('salvage-run');
    expect(idFromName('Café Crème')).toBe('cafe-creme');
    expect(idFromName('  --Hello__World--  ')).toBe('hello-world');
    expect(idFromName('Space-Wrecked 2')).toBe('space-wrecked-2');
    expect(idFromName('物語')).toBe('project');
  });

  it('always gives a valid id of at most 64 characters', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120, unit: 'grapheme' }), (name) => {
        const id = idFromName(name);
        return id.length <= 64 && new RegExp(RECORD_ID_PATTERN).test(id);
      }),
    );
  });
});

describe('newManifest', () => {
  it('writes project.json as a person would, with the name trimmed', () => {
    const { id, bytes: written } = newManifest('  Dirtbag ');
    expect(id).toBe('dirtbag');
    expect(new TextDecoder().decode(written)).toBe(
      '{\n  "format": 1,\n  "id": "dirtbag",\n  "name": "Dirtbag",\n  "version": "0.1.0"\n}\n',
    );
    expect(readManifest(written).project).toEqual({ id: 'dirtbag', name: 'Dirtbag', version: '0.1.0' });
  });

  it('needs a name', () => {
    expect(() => newManifest('   ')).toThrow('A project needs a name.');
  });
});

describe('readManifest', () => {
  it('reads one with a byte order mark, as some Windows editors write', () => {
    const read = readManifest(bytes(`${BOM}{"format":1,"id":"a","name":"A","version":"1.0.0"}`));
    expect(read).toEqual({ project: { id: 'a', name: 'A', version: '1.0.0' }, trouble: null });
  });

  it('says what is wrong, naming the field', () => {
    expect(readManifest(bytes('{"format":1,"id":"A b","name":"A","version":"1"}')).trouble).toBe(
      'project.json: id: Not a valid project id: use lowercase words joined by hyphens; version: Expected a version like "1.2.0" or "1.2.0-beta.1".',
    );
    expect(readManifest(bytes('{"format":9}')).trouble).toContain('format 9');
    expect(readManifest(bytes('nope')).trouble).toContain('Not valid JSON');
    expect(readManifest(new Uint8Array([0xff, 0xfe, 0x00])).trouble).toBe('project.json: Not valid UTF-8.');
  });
});
