/**
 * M6.5's gate in the editor (D77, docs/specs/animation.md#the-gate): an animator made in the editor
 * alone, at 1280 and 390 wide, in the ford. The starter character added; a foreign rig's walk, made
 * as a Mixamo export arrives, imported and put on the engine's rig; a new animator whose whole body
 * idles on the starter character's idle and, while talking, plays the foreign walk, each state and
 * transition made in its outline; tried in its preview, where Talking ticked plays the walk on the
 * starter character, its arms swinging; given to Ada, the smith, and seen playing as her talk opens
 * in Play, through window.__ebWalk.anims(). The clips are first drafts, untested for feel.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { foreignRig } from '../../../packages/models/test/rigs.ts';
import { glbOf } from '../../../packages/models/test/shapes.ts';
import { watchErrors } from './checks.ts';
import { press } from './componentHelpers.ts';
import { importFord, PLACED, paused, playFord, yawToward } from './fordHelpers.ts';
import { offered, promptButton } from './glenHelpers.ts';
import { choose } from './hutHelpers.ts';
import { expectFits, topScreen } from './hutScreens.ts';
import { newRecord, stored } from './kitHelpers.ts';
import { openRecord, showAssets } from './ludus.ts';
import { faceTowards, holdUntilPast, lookByTouch, settled, stickUntil, walked } from './walkHelpers.ts';

const FOLDER = 'ford';
const WALKER = {
  name: 'Walker',
  clips: 'starter-character',
  base: {
    start: 'idle',
    states: [
      { id: 'idle', clip: 'idle', loop: true },
      { id: 'talk', clip: 'walk', from: 'strider', loop: true },
    ],
    transitions: [
      { from: 'talk', to: 'idle', when: 'not anim.talking' },
      { from: 'idle', to: 'talk', when: 'anim.talking' },
    ],
  },
};

interface Seen {
  readonly key: string;
  readonly layers: { base: { state: string; clip: string | null }[] };
  readonly playing: { clip: string; role: string; weight: number }[];
}

/** The starter character added, and the strider, a foreign rig with a walk, imported onto the rig. */
async function bringModels(page: Page, touch: boolean): Promise<void> {
  const panel = await showAssets(page);
  await press(panel.getByRole('button', { name: 'Add starter character' }), touch);
  await expect
    .poll(() => stored(page, FOLDER, 'records/model/starter-character.json'))
    .toMatchObject({ file: 'starter-character/starter-character.glb', rig: { bones: { hips: 'hips' } } });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    press(panel.getByRole('button', { name: 'Import files' }), touch),
  ]);
  const buffer = Buffer.from(await glbOf(foreignRig()));
  await chooser.setFiles({ name: 'strider.glb', mimeType: 'model/gltf-binary', buffer });
  const form = panel.getByRole('region', { name: /^Import / });
  await form.getByLabel('Licence').selectOption('CC0-1.0');
  await form.getByLabel('Where it came from').fill('Made in Node for the gate, as Mixamo exports a rig');
  await press(form.getByRole('button', { name: /^Import 1 file/ }), touch);
  await expect(form).toHaveCount(0, { timeout: 30_000 });
  // Its joints mapped by name to the humanoid's, and its walk listed with the pace it was made for.
  await expect
    .poll(() => stored(page, FOLDER, 'records/model/strider.json'))
    .toMatchObject({
      file: 'models/strider.glb',
      rig: { bones: { hips: 'mixamorig:Hips', rightHand: 'mixamorig:RightHand', leftFoot: 'mixamorig:LeftFoot' } },
      clips: [{ name: 'walk', pace: 1.4 }],
    });
  const strider = await openRecord(page, 'Model', 'strider');
  await expect(strider.getByRole('textbox', { name: 'Bones: rightHand', exact: true })).toHaveValue(
    'mixamorig:RightHand',
  );
}

/** The whole body's outline in an animator's form. */
function outline(form: Locator, touch: boolean) {
  const layer = form.getByRole('region', { name: 'Whole body' });
  const rows = layer.getByRole('list', { name: 'Whole body states and transitions' });
  const bar = layer.getByRole('group', { name: 'Change the states and transitions' });
  const chosen = layer.getByRole('group', { name: /^This (state|transition)$/ });
  return {
    rows,
    chosen,
    choose: (name: RegExp) => press(rows.getByRole('button', { name }), touch),
    act: (name: string) => press(bar.getByRole('button', { name, exact: true }), touch),
    rename: async (to: string) => {
      const box = chosen.getByRole('textbox', { name: /^State/ });
      await box.fill(to);
      await box.press('Tab');
    },
    when: async (text: string) => {
      const box = chosen.getByRole('textbox', { name: /^When/ });
      await box.fill(text);
      await box.press('Tab');
    },
  };
}

/** The walker made in its outline alone: idle, and the strider's walk while talking. */
async function makeWalker(page: Page, touch: boolean): Promise<Locator> {
  const form = await newRecord(page, 'animator', 'Animator', 'Walker');
  await choose(form, /^Clips from/, 'Choose a model', 'Starter character (starter-character)');
  const o = outline(form, touch);
  await test.step('idle: added, renamed, looped', async () => {
    await o.act('Add state');
    await o.rename('idle');
    await o.chosen.getByRole('checkbox', { name: /^Loops/ }).check();
    await expect(o.rows.getByRole('button')).toHaveText(['idle · plays idle · loops · starts']);
  });
  await test.step('talk: the strider’s walk, looped', async () => {
    await o.act('Add state');
    await o.rename('talk');
    await choose(o.chosen, /^From/, 'Choose a model', 'strider');
    await o.chosen.getByRole('combobox', { name: /^Clip/ }).selectOption('walk');
    await o.chosen.getByRole('checkbox', { name: /^Loops/ }).check();
  });
  await test.step('the transitions each way, on anim.talking', async () => {
    await o.act('Add transition');
    await expect(o.chosen.getByRole('combobox', { name: /^To/ })).toHaveValue('idle');
    await o.when('not anim.talking');
    await o.choose(/^idle ·/);
    await o.act('Add transition');
    await expect(o.chosen.getByRole('combobox', { name: /^To/ })).toHaveValue('talk');
    await o.when('anim.talking');
  });
  await expect.poll(() => stored(page, FOLDER, 'records/animator/walker.json')).toEqual(WALKER);
  await expect(o.rows.getByRole('button')).toHaveText([
    'idle · plays idle · loops · starts',
    '2. to talk when anim.talking',
    'talk · plays walk · loops',
    '1. to idle when not anim.talking',
  ]);
  await expect(o.rows.getByText(/\d+ problems?$/)).toHaveCount(0);
  return form;
}

const previewed = (page: Page) => page.evaluate(() => window.__ebAnimPreview?.() ?? null);

/** In the preview: idle still, and with Talking ticked the strider's walk on the starter character. */
async function tryWalker(page: Page, form: Locator): Promise<void> {
  const preview = form.getByRole('region', { name: 'Try it' });
  const status = preview.locator('.anim-status');
  await expect(status).toHaveAttribute('data-base', 'idle, playing idle from starter-character', { timeout: 20_000 });
  await preview.getByLabel('Talking').check();
  await expect(status).toHaveAttribute('data-base', 'talk, playing walk from strider');
  await expect
    .poll(async () => (await previewed(page))?.playing.find((p) => p.clip === 'walk' && p.role === 'lower')?.weight)
    .toBeCloseTo(1, 3);
  // The walk swings the arms: the hand moves between two looks.
  const a = (await previewed(page))?.rightHand ?? [0, 0, 0];
  await page.waitForTimeout(250);
  const b = (await previewed(page))?.rightHand ?? [0, 0, 0];
  expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeGreaterThan(0.01);
  await preview.getByLabel('Talking').uncheck();
  await expect(status).toHaveAttribute('data-base', 'idle, playing idle from starter-character');
}

const smithSeen = (page: Page) =>
  page.evaluate(() => {
    const hook = (window as unknown as { __ebWalk?: { anims(): Seen[] } }).__ebWalk;
    return hook?.anims().find((a) => a.key === 'smith') ?? null;
  });

/** In Play: Ada idles, and plays the strider's walk once her talk is open. */
async function talkToAda(page: Page, touch: boolean): Promise<void> {
  const ford = await playFord(page, touch);
  await settled(page);
  await expect.poll(async () => (await smithSeen(page))?.layers.base.at(-1)?.state).toBe('idle');
  if (touch) {
    const from = await walked(page);
    const want = yawToward(from.feet, PLACED.smith.at);
    await lookByTouch(page, ford, Math.round(-(want - from.yaw) / 0.3), 0);
    await stickUntil(page, ford, 40, (w) => w.feet[0] <= -1.3);
  } else {
    await ford.focus();
    await holdUntilPast(page, ['KeyS'], 'z', { atLeast: 7.9 });
    await holdUntilPast(page, ['KeyA'], 'x', { atMost: -1.2 });
    await settled(page);
    await faceTowards(page, ford, -3, 8);
  }
  await settled(page);
  await offered(page, 'smith');
  if (touch) await promptButton(ford).tap();
  else await page.keyboard.press('KeyE');
  await expect(topScreen(page).getByText('The ferry’s mare threw a shoe. Take her this one?')).toBeVisible();
  await expect.poll(() => paused(page)).toBe(true);
  // Under the talk's pause, the NPC talked to goes on moving.
  await expect.poll(async () => (await smithSeen(page))?.layers.base.at(-1)?.state).toBe('talk');
  await expect
    .poll(async () => (await smithSeen(page))?.playing.find((p) => p.clip === 'walk' && p.role === 'lower')?.weight)
    .toBeCloseTo(1, 3);
}

for (const [width, height, touch] of [
  [1280, 800, false],
  [390, 844, true],
] as const) {
  test.describe(`an animator made in the editor, ${width} wide`, () => {
    test.use({ viewport: { width, height }, ...(touch ? { hasTouch: true, isMobile: true } : {}) });

    test('the strider’s walk imported, the walker made and tried, and Ada playing it as she talks', async ({
      page,
    }) => {
      test.setTimeout(400_000);
      const errors = watchErrors(page);
      await importFord(page, touch);
      await test.step('the starter character added and the strider imported onto the rig', () =>
        bringModels(page, touch));
      const form = await makeWalker(page, touch);
      await test.step('tried in the preview', () => tryWalker(page, form));
      await expectFits(page);
      await test.step('given to Ada', async () => {
        const ada = await openRecord(page, 'actor', 'smith');
        await choose(ada, /^Animator/, 'Choose an animator', 'Walker (walker)');
        await expect.poll(() => stored(page, FOLDER, 'records/actor/smith.json')).toMatchObject({ animator: 'walker' });
      });
      await test.step('Ada idles in Play, and walks the strider’s walk as her talk opens', () =>
        talkToAda(page, touch));
      expect(errors).toEqual([]);
    });
  });
}
