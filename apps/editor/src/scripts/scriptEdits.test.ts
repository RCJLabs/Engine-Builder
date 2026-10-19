import { memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { createTextFiles, deleteScript, setScriptText } from './scriptEdits.ts';

const text = (bytes: Uint8Array | null) => (bytes === null ? null : new TextDecoder().decode(bytes));

describe('the script edits', () => {
  it('create scripts as one step, never over one that is there', async () => {
    const source = memorySource({ 'scripts/hold.ts': 'old' });
    const made = await createTextFiles(source, [
      ['scripts/game.ts', 'game'],
      ['scripts/crew.ts', 'crew'],
    ]);
    expect(made.map((c) => [c.path, c.before, text(c.after)])).toEqual([
      ['scripts/game.ts', null, 'game'],
      ['scripts/crew.ts', null, 'crew'],
    ]);
    await expect(createTextFiles(source, [['scripts/hold.ts', 'new']])).rejects.toThrow(
      'scripts/hold.ts exists already',
    );
  });

  it('change a script’s text, or nothing when it is what the file holds; a script gone is made again', async () => {
    const source = memorySource({ 'scripts/hold.ts': 'same' });
    expect(await setScriptText(source, 'hold', 'same')).toEqual([]);
    const [changed] = await setScriptText(source, 'hold', 'new');
    expect([changed?.path, text(changed?.before ?? null), text(changed?.after ?? null)]).toEqual([
      'scripts/hold.ts',
      'same',
      'new',
    ]);
    const [again] = await setScriptText(source, 'gone', 'back');
    expect([again?.before, text(again?.after ?? null)]).toEqual([null, 'back']);
  });

  it('delete a script, or nothing when it is gone already', async () => {
    const source = memorySource({ 'scripts/hold.ts': 'x' });
    const [deleted] = await deleteScript(source, 'hold');
    expect([deleted?.path, text(deleted?.before ?? null), deleted?.after]).toEqual(['scripts/hold.ts', 'x', null]);
    expect(await deleteScript(source, 'gone')).toEqual([]);
  });
});
