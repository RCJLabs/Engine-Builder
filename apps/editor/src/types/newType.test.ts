import { memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { FIXTURE_LUDUS, readFixture } from '../../../../packages/compiler/test/fixture.ts';
import { readCatalog } from '../forms/catalog.ts';
import { newTypeProblem } from './NewType.tsx';

/** Ludus, with these kits listed in its project.json. */
async function ludus(kits: string[]) {
  const files: Record<string, string> = readFixture(FIXTURE_LUDUS);
  const manifest = JSON.parse(files['project.json'] as string);
  return readCatalog(memorySource({ ...files, 'project.json': JSON.stringify({ ...manifest, kits }) }));
}

describe('naming a new type', () => {
  it('refuses the engine’s types, a kit’s while it is on, and the project’s own', async () => {
    const catalog = await ludus(['inventory']);
    expect(newTypeProblem('', catalog)).toBeNull();
    expect(newTypeProblem('!!', catalog)).toBe('Use letters or digits');
    expect(newTypeProblem('Flag', catalog)).toBe('flag is one of the engine’s own types');
    expect(newTypeProblem('Item', catalog)).toBe('item is the inventory kit’s type: Edit type adds fields to it');
    expect(newTypeProblem('Gladiator', catalog)).toBe('There is a type gladiator already');
    expect(newTypeProblem('Chariot Team', catalog)).toBeNull();
  });

  it('frees a kit’s type names while the kit is off', async () => {
    expect(newTypeProblem('Item', await ludus([]))).toBeNull();
    expect(newTypeProblem('Shop', await ludus(['inventory']))).toBeNull();
  });
});
