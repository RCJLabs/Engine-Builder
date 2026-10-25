import { describe, expect, it, vi } from 'vitest';
import type { LiveModels } from '../models/liveTypes.ts';

// The models view stood in for: each prepare waits until the test lets its decode finish.
const decodes: { models: LiveModels; finish: (decoded: boolean) => void }[] = [];
vi.mock('./modelsView.ts', () => ({
  createModelsView: () => ({
    prepare: (models: LiveModels) => new Promise<boolean>((resolve) => decodes.push({ models, finish: resolve })),
    draw: () => null,
    wireOf: () => null,
    summary: () => null,
    dispose: () => {},
  }),
}));

const { createViewModels } = await import('./viewModels.ts');

const modelsWith = (hash: string): LiveModels =>
  ({
    records: new Map(),
    fields: new Map(),
    files: new Map([['models/pine.glb', { hash }]]),
    materials: new Map(),
  }) as unknown as LiveModels;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the Scene view’s models', () => {
  it('builds again when a file is decoded, even if the view was built anew while it decoded', async () => {
    decodes.length = 0;
    const rebuild = vi.fn();
    const models = createViewModels({} as never, rebuild, () => {});
    const first = modelsWith('a');
    models.use(first);
    await settle();
    expect(decodes.map((d) => d.models)).toEqual([first]);
    // The live copy is read again while the first decode runs: the same files, a new object.
    const second = modelsWith('a');
    models.use(second);
    decodes[0]?.finish(true);
    await settle();
    // The second batch finds the file already decoded and has nothing new to say.
    decodes[1]?.finish(false);
    await settle();
    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  it('builds nothing again when a batch decodes nothing new', async () => {
    decodes.length = 0;
    const rebuild = vi.fn();
    const models = createViewModels({} as never, rebuild, () => {});
    models.use(modelsWith('a'));
    await settle();
    decodes[0]?.finish(false);
    await settle();
    expect(rebuild).not.toHaveBeenCalled();
  });
});
