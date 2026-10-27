/**
 * Sprites and 2D spaces checked in the editor (M7.1, D83), as projects/opened.ts runs the checks: the
 * index, the spaces' checks, then the drawn files'. E091 (a record's rule, its sheet, a component's
 * clip) and E058's 2D rules come out as eb validate gives them, and a 2D walker needs no navmesh.
 */
import { compileProject, memorySource, withScreens } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { pngOf } from '../../../../packages/compiler/test/png.ts';
import { readCatalog } from '../forms/catalog.ts';
import { modelProblems } from '../models/modelChecks.ts';
import { projectProblems } from '../problems/collect.ts';
import { EMPTY_INDEX, updateIndex } from '../records/recordIndex.ts';
import { NO_SCRIPTS } from '../scripts/gameState.ts';
import { spaceProblems } from '../spaces/spaceChecks.ts';

const json = (value: unknown) => JSON.stringify(value, null, 2);

const SPRITE = { sheet: 'guard.png', frame: [16, 24], clips: { idle: { frames: [0, 1], fps: 2 } } };

const files = (): Record<string, string | Uint8Array> => ({
  'project.json': json({ format: 1, id: 'keep', name: 'Keep', version: '0.1.0', kits: ['stats'] }),
  'assets/guard.png': pngOf(64, 48, 8, 6),
  'assets/odd.png': pngOf(60, 48, 8, 6),
  'records/sprite/guard.json': json(SPRITE),
  'records/sprite/odd.json': json({ ...SPRITE, sheet: 'odd.png' }),
  'records/sprite/late.json': json({ ...SPRITE, clips: { idle: { frames: [0, 8], fps: 2 } }, clip: 'walk' }),
  'records/actor/guard.json': json({ name: 'Guard', sprite: 'guard' }),
  'spaces/keep.json': json({
    name: 'Keep',
    view: '2d',
    objects: [
      { id: 'wall', shape: 'cylinder' },
      { id: 'torch', shape: 'box', components: { sprite: { sprite: 'guard', clip: 'burn' } } },
      { id: 'east', shape: 'box', at: [200, 0, 0] },
      {
        id: 'guard',
        record: 'actor:guard',
        components: { interact: { label: 'Hail', effects: [{ effect: 'walk-to', actor: 'guard', to: 'east' }] } },
      },
    ],
  }),
});

async function checked(all: Record<string, string | Uint8Array>) {
  const source = memorySource(all);
  const catalog = await readCatalog(source);
  const first = await updateIndex(EMPTY_INDEX, source, catalog, null);
  const spaced = await spaceProblems(source, catalog, first, NO_SCRIPTS);
  const index = await updateIndex(first, source, catalog, [], {}, withScreens(spaced.flags, new Map()));
  const models = await modelProblems(source, catalog, index);
  return projectProblems(catalog, { ...index, spaces: spaced.problems, models });
}

const brief = (list: readonly { code: string; file?: string; path?: string }[]) =>
  list
    .filter((d) => ['E058', 'E079', 'E091'].includes(d.code))
    .map((d) => `${d.code} ${d.file} ${d.path}`)
    .sort();

describe('sprites and 2D spaces in the editor', () => {
  it('gives E091 and E058’s 2D rules as eb validate does, and no E079 for a 2D walker', async () => {
    const all = files();
    const problems = await checked(all);
    const compiled = await compileProject(memorySource(all), []);
    expect(brief(problems)).toEqual(brief(compiled.diagnostics));
    expect(brief(problems)).toEqual([
      'E058 spaces/keep.json /objects/0/shape',
      'E091 records/sprite/late.json /clip',
      'E091 records/sprite/late.json /clips/idle/frames',
      'E091 records/sprite/odd.json /frame',
      'E091 spaces/keep.json /objects/1/components/sprite/clip',
    ]);
  });
});
