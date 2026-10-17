import { memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { manifestChange, manifestProblem } from './projectEdits.ts';

const MANIFEST = '{\n  "format": 1,\n  "id": "salvage-run",\n  "name": "Salvage Run",\n  "version": "0.1.0"\n}\n';
const decode = (bytes: Uint8Array | null | undefined) => (bytes ? new TextDecoder().decode(bytes) : bytes);

describe('manifestChange', () => {
  it('sets the field in place, keeping the key order and layout', async () => {
    const change = await manifestChange(memorySource({ 'project.json': MANIFEST }), 'name', 'Dirtbag Valley');
    expect(change?.path).toBe('project.json');
    expect(decode(change?.before)).toBe(MANIFEST);
    expect(decode(change?.after)).toBe(MANIFEST.replace('"Salvage Run"', '"Dirtbag Valley"'));
  });

  it('gives no change when the field already holds the value, or there is no project.json', async () => {
    expect(await manifestChange(memorySource({ 'project.json': MANIFEST }), 'version', '0.1.0')).toBeNull();
    expect(await manifestChange(memorySource({}), 'name', 'x')).toBeNull();
  });
});

describe('manifestProblem', () => {
  it('wants a name with more than spaces in it', () => {
    expect(manifestProblem('name', 'Dirtbag')).toBeNull();
    expect(manifestProblem('name', '   ')).toBe('A project needs a name.');
    expect(manifestProblem('name', '')).toBe('A project needs a name.');
  });

  it('wants a version the compiler reads, in its own words', () => {
    expect(manifestProblem('version', '1.2.0-beta.1')).toBeNull();
    expect(manifestProblem('version', '1.2')).toBe('Expected a version like "1.2.0" or "1.2.0-beta.1"');
  });
});
