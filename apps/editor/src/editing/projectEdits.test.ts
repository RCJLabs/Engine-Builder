import { memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { kitsChange, kitsStep, kitsWith, manifestChange, manifestProblem } from './projectEdits.ts';

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

describe('kitsWith', () => {
  it('turns on what a kit needs with it, in the engine’s order', () => {
    expect(kitsWith([], 'economy', true)).toEqual(['inventory', 'economy']);
    expect(kitsWith([], 'inventory', true)).toEqual(['inventory']);
    expect(kitsWith(['economy'], 'inventory', true)).toEqual(['inventory', 'economy']);
  });

  it('turns off what needs a kit with it, and nothing it needs', () => {
    expect(kitsWith(['inventory', 'economy'], 'inventory', false)).toEqual([]);
    expect(kitsWith(['inventory', 'economy'], 'economy', false)).toEqual(['inventory']);
  });
});

describe('kitsStep', () => {
  it('names the kit, and what came along with it', () => {
    expect(kitsStep('economy', true, [], ['inventory', 'economy'])).toBe('Turn on the economy kit, with inventory');
    expect(kitsStep('inventory', true, [], ['inventory'])).toBe('Turn on the inventory kit');
    expect(kitsStep('inventory', false, ['inventory', 'economy'], [])).toBe('Turn off the inventory kit, with economy');
    expect(kitsStep('economy', false, ['inventory', 'economy'], ['inventory'])).toBe('Turn off the economy kit');
  });
});

describe('kitsChange', () => {
  const kitted = MANIFEST.replace('\n}', ',\n  "kits": [\n    "inventory"\n  ]\n}');

  it('puts kits last in a project.json without them, keeping its layout', async () => {
    const change = await kitsChange(memorySource({ 'project.json': MANIFEST }), ['inventory']);
    expect(decode(change?.after)).toBe(kitted);
  });

  it('changes kits where they are, and takes them out when none are on', async () => {
    const first = '{\n  "kits": ["inventory"],\n  "format": 1\n}\n';
    const change = await kitsChange(memorySource({ 'project.json': first }), ['inventory', 'economy']);
    expect(JSON.parse(decode(change?.after) as string)).toEqual({ kits: ['inventory', 'economy'], format: 1 });
    expect(Object.keys(JSON.parse(decode(change?.after) as string))).toEqual(['kits', 'format']);
    expect(decode((await kitsChange(memorySource({ 'project.json': kitted }), []))?.after)).toBe(MANIFEST);
  });

  it('gives no change when the kits are already those, or there is no project.json', async () => {
    expect(await kitsChange(memorySource({ 'project.json': kitted }), ['inventory'])).toBeNull();
    expect(await kitsChange(memorySource({ 'project.json': MANIFEST }), [])).toBeNull();
    expect(await kitsChange(memorySource({}), ['inventory'])).toBeNull();
  });
});
