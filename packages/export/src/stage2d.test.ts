/**
 * stage2d.js in exports (M7.1, D83): beside the page for a game with a 2D space, inside it for one
 * file, never for a game without one; and a game whose spaces are all 2D ships no walk.js.
 */
import { describe, expect, it } from 'vitest';
import { RUNTIME } from '../test/hut.ts';
import { exportGame } from './exportGame.ts';
import { engineTexts } from './targets.ts';

const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

/** A pack whose one space is 2D: only what the targets read of it. */
const pack = {
  project: { id: 'keep', name: 'The keep', version: '0.1.0' },
  records: {},
  world: {
    spaces: { keep: { view: '2d', objects: [] } },
    prefabs: {},
    triggers: {},
    files: {},
    records: {},
    fields: {},
  },
};
const STAGE = 'window.__ebStage2dStage = { startStage2d() {} }; if (a </script>/.test(b)) {}\n';
const WALK = 'window.__ebWalkStage = { startStage() {} };\n';
const runtime = { ...RUNTIME, walk: WALK, stage2d: STAGE };
const bootOf = (page: string) =>
  JSON.parse(/<script type="application\/json" id="eb-game">(.*?)<\/script>/s.exec(page)?.[1] ?? 'null');

describe('stage2d.js in exports (M7.1)', () => {
  it('web: beside the page, named by its content, in the boot JSON and the precache; no walk.js', async () => {
    const web = await exportGame({ target: 'web', settings: undefined, edition: 'full', pack, runtime });
    const names = [...web.files.keys()];
    const name = names.find((f) => f.startsWith('stage2d.'));
    expect(name).toMatch(/^stage2d\.[0-9a-f]{8}\.js$/);
    expect(text(web.files.get(name as string))).toBe(STAGE);
    const boot = bootOf(text(web.files.get('index.html')));
    expect(boot.stage2d).toBe(name);
    expect(boot.walk).toBeUndefined();
    expect(names.some((f) => f.startsWith('walk.'))).toBe(false);
    expect(text(web.files.get('sw.js'))).toContain(`"${name}"`);
  });

  it('one file: inside it as text, its </script broken, and no walk.js', async () => {
    const file = await exportGame({ target: 'file', settings: undefined, edition: 'full', pack, runtime });
    const page = text(file.bytes);
    expect(bootOf(page).stage2d).toBe('#eb-stage2d');
    const held = /<script type="text\/plain" id="eb-stage2d">(.*?)<\/script>/s.exec(page)?.[1];
    expect(held).toBe(STAGE.replace('</script', '<\\/script'));
    expect(page).not.toContain('eb-walk');
  });

  it('a game with no 2D space gets none, and one with it needs a runtime that has it', async () => {
    const plain = { project: pack.project, records: {} };
    const web = await exportGame({ target: 'web', settings: undefined, edition: 'full', pack: plain, runtime });
    expect([...web.files.keys()].some((f) => f.startsWith('stage2d.'))).toBe(false);
    expect(bootOf(text(web.files.get('index.html'))).stage2d).toBeUndefined();
    const { stage2d: _, ...without } = runtime;
    await expect(
      exportGame({ target: 'web', settings: undefined, edition: 'full', pack, runtime: without }),
    ).rejects.toThrow('has no stage2d.js');
  });

  it('is the engine’s own text, which the leak check takes out before it reads', () => {
    expect(engineTexts(runtime)).toContain(STAGE);
    expect(engineTexts(runtime)).toContain(STAGE.replace('</script', '<\\/script'));
  });
});
