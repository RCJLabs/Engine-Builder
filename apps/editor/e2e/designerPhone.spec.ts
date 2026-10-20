/**
 * M4.5's gate (D55) on phones: the hut's journal and its own screen made again from blank in the
 * designer by touch at 360 and 390 px, in the inspector's sheet, each coming out as the fixture's
 * JSON; and the designer, its frame turned to landscape, in reach on a phone held sideways. No
 * target under 44 px and nothing axe finds, the frame aside: a picture of the game, inert.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { fixtureScreen, importDesignerHut, pick, storedScreen, touch } from './designerHelpers.ts';
import { expectFrameFits, makeHut, makeJournal } from './designerScreens.ts';

/** A tap on the frame where `text` is drawn: the frame is inert, so the tap lands on the frame itself. */
async function tapFrameAt(region: Locator, text: string): Promise<void> {
  const frame = region.getByTestId('designer-frame');
  await frame.scrollIntoViewIfNeeded();
  const [box, target] = [await frame.boundingBox(), await frame.getByText(text).boundingBox()];
  if (!box || !target) throw new Error(`No ${text} in the frame`);
  await frame.tap({ position: { x: target.x - box.x + target.width / 2, y: target.y - box.y + target.height / 2 } });
}

async function expectInReach(page: Page): Promise<void> {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, '[data-panel="inspector"]')).toEqual([]);
  await expectNoAxeIssues(page);
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test.describe(`the designer, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('the journal and the hut made again by touch, as the fixture’s JSON, every part in reach', async ({
      page,
    }) => {
      test.setTimeout(420_000);
      touch(true);
      const errors = watchErrors(page);
      await importDesignerHut(page);
      const journal = await makeJournal(page);
      await expect.poll(() => storedScreen(page, 'journal')).toBe(fixtureScreen('journal'));
      await expectFrameFits(journal);
      await expectInReach(page);
      const hut = await makeHut(page);
      await expect.poll(() => storedScreen(page, 'hut')).toBe(fixtureScreen('hut'));
      // A widget picked by a tap on the frame: the grid's first button, the outline's row for it current.
      await pick(hut, 'Screen');
      await tapFrameAt(hut, 'Carry a load up');
      await expect(hut.getByRole('heading', { level: 4, name: 'Button' })).toBeVisible();
      await expect(hut.getByRole('textbox', { name: 'Label', exact: true })).toHaveValue('Carry a load up');
      await expectFrameFits(hut);
      await expectInReach(page);
      touch(false);
      expect(errors).toEqual([]);
    });
  });
}
