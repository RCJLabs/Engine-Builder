/**
 * The boarding deck as eb validate reads it (M7.4's gate, D86, docs/specs/stages.md#the-gate): clean,
 * and broken once for each of the stage's checks, it is E095 (a stage that names no file), E058 (a
 * stage on a 3D space), E029 (a stage file that reaches for the DOM) and W159 (a stage file no space
 * reaches, left out of the pack).
 */
import { appendFile, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const BOARDING = resolve(import.meta.dirname, 'fixtures/boarding');

/** The deck's problems, warnings too, as code, file and path, once `change` has had the copy's folder. */
async function broken(change: (folder: string) => Promise<void>): Promise<string[]> {
  const folder = await mkdtemp(join(tmpdir(), 'boarding-'));
  try {
    await cp(BOARDING, folder, { recursive: true });
    await change(folder);
    const { diagnostics } = await compileWithGame(folderSource(folder));
    return diagnostics.map((d) => `${d.code} ${d.file ?? ''} ${d.path}`);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

// biome-ignore lint/suspicious/noExplicitAny: the deck's JSON, edited in place
async function editDeck(folder: string, change: (space: any) => void): Promise<void> {
  const path = join(folder, 'spaces/deck.json');
  const space = JSON.parse(await readFile(path, 'utf8'));
  change(space);
  await writeFile(path, JSON.stringify(space, null, 2));
}

describe('the boarding deck', () => {
  it('validates clean, its stage packed as format 20', async () => {
    const { pack, diagnostics } = await compileWithGame(folderSource(BOARDING));
    expect(diagnostics).toEqual([]);
    expect(pack?.format).toBe(20);
    expect(pack?.world?.spaces.deck).toMatchObject({ stage: 'battle' });
    expect(Object.keys(pack?.world?.stages ?? {})).toContain('battle');
  });

  it('is E095 for a stage that names no stage file', async () => {
    const problems = await broken((folder) => editDeck(folder, (space) => (space.stage = 'brawl')));
    expect(problems).toContain('E095 spaces/deck.json /stage');
  });

  it('is E058 for a stage on a 3D space', async () => {
    const problems = await broken((folder) =>
      editDeck(folder, (space) => {
        for (const key of ['view', 'fit', 'size', 'backdrop']) delete space[key];
      }),
    );
    expect(problems).toContain('E058 spaces/deck.json /stage');
  });

  it('is E029 for a stage file that reaches for the DOM', async () => {
    const problems = await broken((folder) =>
      appendFile(join(folder, 'stages/deck/crew.ts'), '\nexport const title = () => document.title;\n'),
    );
    expect(problems.filter((p) => p.startsWith('E029'))).toEqual([
      expect.stringMatching(/^E029 stages\/deck\/crew\.ts /),
    ]);
  });

  it('is W159 for a stage file no space reaches, by name or by import', async () => {
    const problems = await broken((folder) =>
      writeFile(
        join(folder, 'stages/spare.ts'),
        "import { defineStage } from 'eb/stage';\nexport default defineStage({ frame() {} });\n",
      ),
    );
    expect(problems).toEqual([expect.stringMatching(/^W159 stages\/spare\.ts /)]);
  });
});
