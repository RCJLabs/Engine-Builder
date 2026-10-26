/**
 * M6.1's gate in the editor (D73, docs/specs/npcs.md#the-gate): an NPC made in the editor alone, at
 * 1280 and 390 wide. A new project with the inventory, stats and dialogue kits; a horseshoe, a
 * speaker and her talk; Ada, an actor with a figure's height and colours, that talk and a horseshoe
 * carried, all made with forms; a forge whose ground and spawn are boxes with components, Ada placed
 * by Add → Record… and seen as a figure in the Scene panel; the game written in the script editor,
 * its screens from the stock Space and Dialogue templates; and Ada talked to in the Play panel.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { press, showInspector } from './componentHelpers.ts';
import { npcs, paused, sameYaw, yawToward } from './fordHelpers.ts';
import { offered, promptButton } from './glenHelpers.ts';
import { addTo, choose } from './hutHelpers.ts';
import { replaceText } from './hutLogic.ts';
import { newGame, showPlay, topScreen } from './hutScreens.ts';
import { createProject, kitsBox, newRecord, showLogic, stored } from './kitHelpers.ts';
import { showProject } from './ludus.ts';
import { add, newSpaceFile, scenePanel, showScene } from './spaceHelpers.ts';
import { drawing, faceTowards, lookByTouch, settled, walked } from './walkHelpers.ts';

const FOLDER = 'smithy';
const LOOK = { height: 1.6, clothes: '#7a4a2a', trim: '#2f2f2f', skin: '#c08a62' };
// 1.5 m from the spawn at the origin, ahead and to the left: the player turns 37° to her, and she
// turns about 143° to face them.
const ADA_AT = [-0.9, 0, -1.2] as const;

const MAIN = `import { defineModule } from 'eb';

// The smithy's one mode: walked, and a rest, so there is always something on offer.
export const main = defineModule<Record<string, never>>({
  id: 'main',
  init: () => ({}),
  actions: { rest: { run: () => {}, options: () => [{}] } },
  modes: { play: { actions: ['world/*', 'main/rest'] } },
});
`;

const GAME = `import { main } from './main';

export const modules = [main];
export const start = 'play';
`;

/** The kits, a horseshoe, Ada's speaker and her talk, and Ada herself, each with its form. */
async function makeRecords(page: Page, touch: boolean): Promise<void> {
  await showProject(page);
  for (const kit of ['Inventory', 'Stats', 'Dialogue']) await kitsBox(page).getByLabel(kit, { exact: true }).check();
  await newRecord(page, 'item', 'Item', 'Horseshoe');
  await newRecord(page, 'speaker', 'Speaker', 'Ada');
  const talk = await newRecord(page, 'talk', 'Talk', 'Ada');
  await choose(talk, /^Speaker/, 'Choose a speaker', 'Ada (ada)');
  const start = await addTo(talk, 'Starts', 1);
  await start.getByLabel(/^Line/).fill('hello');
  const line = await addTo(talk, 'Lines', 1);
  await line.getByLabel('Id', { exact: true }).fill('hello');
  await line.getByLabel(/^Text/).fill('Mind the anvil.');
  await expect
    .poll(() => stored(page, FOLDER, 'records/talk/ada.json'))
    .toMatchObject({ speaker: 'ada', starts: [{ line: 'hello' }], lines: [{ id: 'hello', text: 'Mind the anvil.' }] });

  const ada = await newRecord(page, 'actor', 'Actor', 'Ada');
  await press(ada.getByRole('button', { name: 'Add Figure' }), touch);
  const figure = ada.getByRole('group', { name: /^Figure/ });
  await figure.getByRole('textbox', { name: /^Height/ }).fill(String(LOOK.height));
  for (const [label, colour] of [
    ['Clothes', LOOK.clothes],
    ['Trim', LOOK.trim],
    ['Skin', LOOK.skin],
  ] as const) {
    await figure.getByLabel(new RegExp(`^${label}`)).fill(colour);
  }
  await choose(ada, /^Talk/, 'Choose a talk', 'Ada (ada)');
  await press(ada.getByRole('button', { name: 'Add to Carries' }), touch);
  await press(page.getByRole('dialog', { name: 'Add to Carries' }).getByRole('option', { name: /Horseshoe/ }), touch);
  await ada.getByRole('textbox', { name: 'Carries: horseshoe' }).fill('1');
  await expect
    .poll(() => stored(page, FOLDER, 'records/actor/ada.json'))
    .toMatchObject({ name: 'Ada', figure: LOOK, talk: 'ada', carries: { horseshoe: 1 } });
}

/** One of an object's three numbers, set in its form. */
async function setTriple(form: Locator, legend: string, values: readonly number[]): Promise<void> {
  const triple = form.getByRole('group', { name: legend });
  for (const [i, axis] of ['x', 'y', 'z'].entries()) {
    const box = triple.getByLabel(axis, { exact: true });
    await box.fill(String(values[i]));
    await box.press('Enter');
  }
}

/** The forge: the ground and the spawn, boxes with components, and Ada placed by Add → Record…. */
async function makeForge(page: Page, touch: boolean): Promise<void> {
  await showScene(page);
  await newSpaceFile(page, 'space', 'Forge');
  await add(page, 'Box');
  let form = await showInspector(page, touch);
  await setTriple(form, 'Place, in metres', [0, -0.2, 0]);
  await setTriple(form, 'Scale', [20, 0.2, 20]);
  await form.getByLabel('Add a component').selectOption({ label: 'Collider' });
  await showScene(page);
  await add(page, 'Box');
  form = await showInspector(page, touch);
  await setTriple(form, 'Scale', [0.5, 0.1, 0.5]);
  // At the origin. Left where Add put it, 1.5 m along x, it was where Ada stood: the player began on
  // her, and the yaw toward them turned by degrees as their feet settled by millimetres (M6.5).
  await setTriple(form, 'Place, in metres', [0, 0, 0]);
  await form.getByLabel('Add a component').selectOption({ label: 'Spawn point' });
  await showScene(page);
  await press(scenePanel(page).getByRole('button', { name: 'Add', exact: true }), touch);
  await press(scenePanel(page).getByRole('button', { name: 'Record…' }), touch);
  await press(
    page.getByRole('dialog', { name: 'Place a record' }).getByRole('option', { name: 'Ada (actor:ada)' }),
    touch,
  );
  // Placed beside what is there, 3 m out: brought to 1.5 m of the spawn, in reach of its Talk.
  await setTriple(await showInspector(page, touch), 'Place, in metres', ADA_AT);
  await expect
    .poll(async () => ((await stored(page, FOLDER, 'spaces/forge.json')) as { objects?: unknown[] } | null)?.objects)
    .toEqual([
      expect.objectContaining({ shape: 'box', components: { collider: {} } }),
      expect.objectContaining({ shape: 'box', scale: [0.5, 0.1, 0.5], components: { spawn: {} } }),
      { id: 'ada', record: 'actor:ada', at: [...ADA_AT] },
    ]);
  // At the origin, which the file leaves out: a lost write of an axis once left the spawn where Add
  // put it, 1.5 m along x, and the player began out of Ada's reach (M6.6's CI).
  const spawnAt = async () => {
    const file = (await stored(page, FOLDER, 'spaces/forge.json')) as {
      objects: { at?: unknown; components?: { spawn?: unknown } }[];
    } | null;
    return file ? (file.objects.find((o) => o.components?.spawn)?.at ?? 'origin') : 'unread';
  };
  await expect.poll(spawnAt).toBe('origin');
  // Drawn as the engine's figure, at her height and in her colours.
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __ebViewport?: { figures(): unknown[] } }).__ebViewport?.figures()),
    )
    .toEqual([{ object: 'ada', ...LOOK }]);
}

/** The game written in the script editor: one mode, walked. */
async function makeGame(page: Page): Promise<void> {
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'Start a game' }).click();
  const script = (id: string) => page.getByRole('region', { name: `Script ${id}.ts` });
  await expect(script('game').locator('.cm-content')).toContainText('export const modules = [main];');
  await panel.getByRole('button', { name: /^main\.ts/ }).click();
  await replaceText(page, script('main'), MAIN);
  await panel.getByRole('button', { name: /^game\.ts/ }).click();
  await replaceText(page, script('game'), GAME);
  await expect(panel.getByText(/^The game: .*main, starting in play/)).toBeVisible();
}

/** The walk's screen and the talk's, each from its stock template. */
async function makeScreens(page: Page): Promise<void> {
  for (const name of ['Space', 'Dialogue']) {
    const panel = await showPlay(page);
    await panel.getByRole('button', { name: 'New screen' }).click();
    await panel.getByLabel('Template').selectOption({ label: name });
    await panel.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('region', { name: `Screen ${name.toLowerCase()}` })).toBeVisible();
  }
}

/** Played: Ada offers Talk, faces the player as it opens, and turns back once it is over. */
async function talkToAda(page: Page, touch: boolean): Promise<void> {
  const panel = await showPlay(page);
  const how = (button: Locator) => press(button, touch);
  // Written here, its scripts are trusted already: no Run its scripts to press.
  const play = panel.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled();
  await how(play);
  await newGame(page, how);
  const forge = await drawing(page, 'forge', 'Forge');
  await settled(page);
  const seen = await npcs(page);
  expect(seen.ada).toMatchObject({ actor: 'ada', drawn: 'figure', placed: 0 });
  const from = await walked(page);
  expect(Math.hypot(from.feet[0] - ADA_AT[0], from.feet[2] - ADA_AT[2]), JSON.stringify(from.feet)).toBeCloseTo(1.5, 1);
  if (touch) {
    const want = yawToward(from.feet, ADA_AT);
    await lookByTouch(page, forge, Math.round(-(want - from.yaw) / 0.3), 0);
  } else {
    await forge.focus();
    await faceTowards(page, forge, ADA_AT[0], ADA_AT[2]);
  }
  await offered(page, 'ada');
  const feet = (await walked(page)).feet;
  if (touch) await promptButton(forge).tap();
  else await page.keyboard.press('KeyE');
  await expect(topScreen(page).getByText('Mind the anvil.')).toBeVisible();
  await expect.poll(() => paused(page)).toBe(true);
  const toward = yawToward(ADA_AT, feet);
  await expect.poll(async () => sameYaw((await npcs(page)).ada?.yaw ?? Number.NaN, toward, 1)).toBe(true);
  await how(topScreen(page).getByRole('button', { name: 'Go on' }));
  await expect.poll(() => paused(page)).toBe(false);
  await expect.poll(async () => sameYaw((await npcs(page)).ada?.yaw ?? Number.NaN, 0, 1)).toBe(true);
}

for (const [width, height, touch] of [
  [1280, 800, false],
  [390, 844, true],
] as const) {
  test.describe(`an NPC made in the editor, ${width} wide`, () => {
    test.use({ viewport: { width, height }, ...(touch ? { hasTouch: true, isMobile: true } : {}) });

    test('Ada: her records, the forge she stands in, a figure in the Scene panel, and her talk in Play', async ({
      page,
    }) => {
      test.setTimeout(400_000);
      const errors = watchErrors(page);
      await createProject(page, 'Smithy');
      await test.step('the kits, the horseshoe, her talk and Ada, with forms', () => makeRecords(page, touch));
      await test.step('the forge, Ada placed and drawn as a figure', () => makeForge(page, touch));
      await test.step('the game, in the script editor', () => makeGame(page));
      await test.step('the screens, from stock templates', () => makeScreens(page));
      await test.step('played: Ada talked to, turned to the player and back', () => talkToAda(page, touch));
      expect(errors).toEqual([]);
    });
  });
}
