import { describe, expect, it } from 'vitest';
import { RUNTIME } from '../test/hut.ts';
import { exportGame } from './exportGame.ts';
import { engineTexts } from './targets.ts';

const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

/** A pack with a world (M5.8): only what the targets read of it. */
const pack = {
  project: { id: 'trail', name: 'The trail', version: '0.1.0' },
  records: {},
  world: { spaces: { trailhead: { objects: [] } }, prefabs: {}, triggers: {}, files: {}, records: {}, fields: {} },
};
const WALK = 'window.__ebWalkStage = { startStage() {} }; if (a </script>/.test(b)) {}\n';
const walking = { ...RUNTIME, walk: WALK };
const bootOf = (page: string) =>
  JSON.parse(/<script type="application\/json" id="eb-game">(.*?)<\/script>/s.exec(page)?.[1] ?? 'null');

describe('walk.js in exports (M5.8)', () => {
  it('web and itch: beside the page, named by its content, in the boot JSON and the precache', async () => {
    const web = await exportGame({ target: 'web', settings: undefined, edition: 'full', pack, runtime: walking });
    const name = [...web.files.keys()].find((f) => f.startsWith('walk.'));
    expect(name).toMatch(/^walk\.[0-9a-f]{8}\.js$/);
    expect(text(web.files.get(name as string))).toBe(WALK);
    expect(bootOf(text(web.files.get('index.html'))).walk).toBe(name);
    expect(text(web.files.get('sw.js'))).toContain(`"${name}"`);
    const itch = await exportGame({ target: 'itch', settings: undefined, edition: 'full', pack, runtime: walking });
    expect(itch.files.has(name as string)).toBe(true);
    expect(bootOf(text(itch.files.get('index.html'))).walk).toBe(name);
  });

  it('one file: inside it as text, run only when a space draws, its </script broken', async () => {
    const file = await exportGame({ target: 'file', settings: undefined, edition: 'full', pack, runtime: walking });
    const page = text(file.bytes);
    expect(bootOf(page).walk).toBe('#eb-walk');
    const held = /<script type="text\/plain" id="eb-walk">(.*?)<\/script>/s.exec(page)?.[1];
    expect(held).toBe(WALK.replace('</script', '<\\/script'));
  });

  it('a game without spaces gets none, and a game with them needs a runtime that has it', async () => {
    const plain = { project: pack.project, records: {} };
    const web = await exportGame({
      target: 'web',
      settings: undefined,
      edition: 'full',
      pack: plain,
      runtime: walking,
    });
    expect([...web.files.keys()].some((f) => f.startsWith('walk.'))).toBe(false);
    expect(bootOf(text(web.files.get('index.html'))).walk).toBeUndefined();
    const file = await exportGame({
      target: 'file',
      settings: undefined,
      edition: 'full',
      pack: plain,
      runtime: walking,
    });
    expect(text(file.bytes)).not.toContain('eb-walk');
    await expect(
      exportGame({ target: 'web', settings: undefined, edition: 'full', pack, runtime: RUNTIME }),
    ).rejects.toThrow('has no walk.js');
  });

  it('is the engine’s own text, which the leak check takes out before it reads', () => {
    expect(engineTexts(walking)).toContain(WALK);
    expect(engineTexts(walking)).toContain(WALK.replace('</script', '<\\/script'));
  });
});
