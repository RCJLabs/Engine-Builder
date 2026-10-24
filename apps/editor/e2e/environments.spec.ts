/**
 * M5.4's gate on desktop (D66), by mouse and keys: from an empty project, a space made in the
 * Scene panel and given a new environment from each of the seven presets in turn, each seen in the
 * view (the hook's sky, fog and weather as the preset has them, and the canvas's colour above the
 * horizon); the coast picked again and its hour moved from noon to dawn; its fog and weather set,
 * reduced motion holding the weather still; Start from in its own form, and undone; and after a
 * reload the record, the space and the view as they were.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { inspector as inspectorOf, showInspector } from './componentHelpers.ts';
import {
  expectLook,
  expectPreset,
  expectSky,
  expectStill,
  frames,
  levelCamera,
  look,
  luma,
  newFromPreset,
  PRESETS,
  type PresetName,
  rgbOf,
  setSlider,
  skyColour,
} from './environmentHelpers.ts';
import { createProject, stored } from './kitHelpers.ts';
import { add, newSpaceFile, scenePanel, showScene, viewStarted } from './spaceHelpers.ts';

test.use({ viewport: { width: 1280, height: 900 } });

const FOLDER = 'dale-works';

const inReach = async (page: Page) => {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, '[data-panel="scene"], [data-panel="inspector"]')).toEqual([]);
  await expectNoAxeIssues(page);
};

test('an environment from each preset, its hour, fog and weather set, and kept', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await createProject(page, 'Dale works');
  await showScene(page);
  await newSpaceFile(page, 'space', 'Dale');
  await add(page, 'Box');
  await scenePanel(page).locator('.scene-view').focus();
  await page.keyboard.press('Escape');
  await levelCamera(page, false);
  // Without an environment, the editor's own light: nothing for the hook to report.
  expect(await look(page)).toBeNull();
  const inspector = await showInspector(page, false);

  for (const name of Object.keys(PRESETS) as PresetName[]) {
    await newFromPreset(inspector, name);
    await expectPreset(page, name);
    await expectSky(page, name);
  }
  await inReach(page);
  expect(await stored(page, FOLDER, 'spaces/dale.json')).toMatchObject({ environment: 'dale-town' });

  // The coast picked again: noon, then dawn, lower, warmer and dimmer, its sky darker above.
  await inspector.getByLabel('Environment', { exact: true }).selectOption({ label: 'Dale, coast' });
  await expectPreset(page, 'Coast');
  await setSlider(inspector, 'Hour', 12, '12:00');
  await expect.poll(async () => (await look(page))?.sun.direction[1]).toBeCloseTo(Math.sqrt(3) / 2, 3);
  const noon = { look: await look(page), sky: await expectSky(page, 'Coast') };
  await setSlider(inspector, 'Hour', 7, '07:00');
  await expect
    .poll(async () => (await look(page))?.sun.direction[1])
    .toBeCloseTo(Math.sin((15.529 * Math.PI) / 180), 3);
  const dawn = { look: await look(page), sky: await skyColour(page) };
  if (!noon.look || !dawn.look) throw new Error('no look');
  expect(dawn.look.sun.strength).toBeLessThan(noon.look.sun.strength);
  expect(rgbOf(dawn.look.sun.color)[2]).toBeLessThan(rgbOf(noon.look.sun.color)[2]);
  expect(luma(dawn.sky)).toBeLessThan(luma(noon.sky) - 10);

  // Fog off and on again, then nearer: the hook follows each.
  await inspector.getByLabel('Fog', { exact: true }).uncheck();
  await expectLook(page, { fog: null });
  await inspector.getByLabel('Fog', { exact: true }).check();
  await expectLook(page, { fog: { near: 30, far: 300 } });
  await inspector.getByLabel('Fog near, in metres').fill('10');
  await inspector.getByLabel('Fog near, in metres').press('Enter');
  await inspector.getByLabel('Fog far, in metres').fill('150');
  await inspector.getByLabel('Fog far, in metres').press('Enter');
  await expectLook(page, { fog: { near: 10, far: 150 } });

  // Rain, less of it, then snow: the view draws every frame while it falls.
  await inspector.getByLabel('Weather', { exact: true }).selectOption('rain');
  await expectLook(page, { weather: 'rain', particles: 1500, animating: true });
  await setSlider(inspector, 'Weather amount', 0.2, '0.2');
  await expectLook(page, { weather: 'rain', particles: 600 });
  await inspector.getByLabel('Weather', { exact: true }).selectOption('snow');
  await expectLook(page, { weather: 'snow', particles: 400, animating: true });
  const before = await frames(page);
  await expect.poll(() => frames(page), { message: 'frames drawn while snow falls' }).toBeGreaterThan(before + 5);
  // Reduced motion: the snow stands still, drawn once.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setSlider(inspector, 'Weather amount', 0.3, '0.3');
  await expectLook(page, { weather: 'snow', particles: 600, animating: false });
  await expectStill(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await inReach(page);

  // The record's own form: what names it, Start from a preset over it, and that undone.
  await inspector.getByRole('button', { name: 'Open environment' }).click();
  const form = inspectorOf(page).getByRole('region', { name: 'Environment dale-coast' });
  await expect(form.getByRole('button', { name: 'Space Dale, its environment' })).toBeVisible();
  await form.getByLabel('Start from').selectOption({ label: 'Desert' });
  await expectPreset(page, 'Desert');
  await expect
    .poll(() => stored(page, FOLDER, 'records/environment/dale-coast.json'))
    .toMatchObject({
      name: 'Dale, coast',
      hour: 14,
      turbidity: 6,
    });
  await page.getByRole('button', { name: 'Undo: Start from Desert in dale-coast' }).click();
  await expectLook(page, { sky: 'physical', fog: { near: 10, far: 150 }, weather: 'snow', particles: 600 });
  await inReach(page);

  const kept = {
    space: await stored(page, FOLDER, 'spaces/dale.json'),
    record: await stored(page, FOLDER, 'records/environment/dale-coast.json'),
    look: await look(page),
  };
  expect(kept.record).toMatchObject({ hour: 7, fog: { near: 10, far: 150 }, weather: 'snow', 'weather-amount': 0.3 });
  await page.reload();
  const rows = page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem');
  await rows.first().getByRole('button', { name: 'Open' }).click();
  const panel = await showScene(page);
  await panel.getByRole('button', { name: 'Dale (dale) 1 object' }).click();
  await viewStarted(page);
  await expect.poll(() => look(page)).toEqual(kept.look);
  expect(await stored(page, FOLDER, 'spaces/dale.json')).toEqual(kept.space);
  expect(await stored(page, FOLDER, 'records/environment/dale-coast.json')).toEqual(kept.record);
  expect(errors).toEqual([]);
});
