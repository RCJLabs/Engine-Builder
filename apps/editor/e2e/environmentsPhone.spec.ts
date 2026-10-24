/**
 * M5.4's gate by touch (D66), at 360×740 and 390×844 upright and 844×390 sideways: the dale
 * environments.spec.ts makes by mouse and keys, made with fingers. A new environment from each of
 * the seven presets in the inspector's sheet upright and its tab sideways, each seen in the view
 * through the hook and the canvas's pixels; the coast picked again and its hour moved from noon to
 * dawn; its fog and weather set; every screen in reach; and all of it after a reload.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { showInspector } from './componentHelpers.ts';
import {
  expectLook,
  expectPreset,
  expectSky,
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
import { showProject } from './ludus.ts';
import { newSpaceFile, showScene, viewStarted } from './spaceHelpers.ts';
import { lowerSheet } from './templateHelpers.ts';

const FOLDER = 'dale-works';

async function expectInReach(page: Page): Promise<void> {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, '[data-panel="scene"], [data-panel="inspector"]')).toEqual([]);
  await expectNoAxeIssues(page);
}

/** The view in sight again, level: the sheet lowered upright, the Scene tab sideways. */
async function seeView(page: Page): Promise<void> {
  await lowerSheet(page);
  await showScene(page);
  await viewStarted(page);
  await levelCamera(page, true);
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`environments by touch, ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('an environment from each preset, its hour, fog and weather set, and kept', async ({ page }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      await createProject(page, 'Dale works');
      await showScene(page);
      await newSpaceFile(page, 'space', 'Dale');
      await levelCamera(page, true);
      expect(await look(page)).toBeNull();

      for (const name of Object.keys(PRESETS) as PresetName[]) {
        await newFromPreset(await showInspector(page, true), name);
        await seeView(page);
        await expectPreset(page, name);
        await expectSky(page, name);
      }
      await expectInReach(page);

      // The coast again, from noon to dawn.
      let inspector = await showInspector(page, true);
      await inspector.getByLabel('Environment', { exact: true }).selectOption({ label: 'Dale, coast' });
      await setSlider(inspector, 'Hour', 12, '12:00');
      await expectInReach(page);
      await seeView(page);
      await expect.poll(async () => (await look(page))?.sun.direction[1]).toBeCloseTo(Math.sqrt(3) / 2, 3);
      const noon = { look: await look(page), sky: await expectSky(page, 'Coast') };
      inspector = await showInspector(page, true);
      await setSlider(inspector, 'Hour', 7, '07:00');
      await seeView(page);
      await expect
        .poll(async () => (await look(page))?.sun.direction[1])
        .toBeCloseTo(Math.sin((15.529 * Math.PI) / 180), 3);
      const dawn = { look: await look(page), sky: await skyColour(page) };
      if (!noon.look || !dawn.look) throw new Error('no look');
      expect(dawn.look.sun.strength).toBeLessThan(noon.look.sun.strength);
      expect(rgbOf(dawn.look.sun.color)[2]).toBeLessThan(rgbOf(noon.look.sun.color)[2]);
      expect(luma(dawn.sky)).toBeLessThan(luma(noon.sky) - 10);

      // Fog off, on and nearer; then snow, less of it.
      inspector = await showInspector(page, true);
      await inspector.getByLabel('Fog', { exact: true }).tap();
      await expectLook(page, { fog: null });
      await inspector.getByLabel('Fog', { exact: true }).tap();
      await expectLook(page, { fog: { near: 30, far: 300 } });
      await inspector.getByLabel('Fog near, in metres').fill('10');
      await inspector.getByLabel('Fog near, in metres').blur();
      await expectLook(page, { fog: { near: 10, far: 300 } });
      await inspector.getByLabel('Weather', { exact: true }).selectOption('snow');
      await setSlider(inspector, 'Weather amount', 0.25, '0.25');
      await expectLook(page, { weather: 'snow', particles: 500, animating: true });
      await expectInReach(page);

      const kept = {
        space: await stored(page, FOLDER, 'spaces/dale.json'),
        record: await stored(page, FOLDER, 'records/environment/dale-coast.json'),
        look: await look(page),
      };
      expect(kept.space).toMatchObject({ environment: 'dale-coast' });
      expect(kept.record).toMatchObject({ hour: 7, fog: { near: 10, far: 300 }, 'weather-amount': 0.25 });
      await page.reload();
      await showProject(page);
      const rows = page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem');
      await rows.first().getByRole('button', { name: 'Open' }).tap();
      const panel = await showScene(page);
      await panel.getByRole('button', { name: 'Dale (dale)' }).tap();
      await viewStarted(page);
      await expect.poll(() => look(page)).toEqual(kept.look);
      expect(await stored(page, FOLDER, 'records/environment/dale-coast.json')).toEqual(kept.record);
      expect(errors).toEqual([]);
    });
  });
}
