/**
 * M4.5's gate (D55) on phones: the hut's journal and its own screen made again from blank in the
 * designer by touch at 360 and 390 px, in the inspector's sheet, each coming out as the fixture's
 * JSON; and the designer, its frame turned to landscape, in reach on a phone held sideways, where a
 * widget is dragged by a finger on its handle. No target under 44 px and nothing axe finds, the
 * frame aside: a picture of the game, inert.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { fixtureScreen, importDesignerHut, outline, pick, storedScreen, touch } from './designerHelpers.ts';
import { expectFrameFits, makeHut, makeJournal } from './designerScreens.ts';
import { HUT } from './hutHelpers.ts';

/** A tap on the frame where `text` is drawn: the frame is inert, so the tap lands on the frame itself. */
async function tapFrameAt(region: Locator, text: string): Promise<void> {
  const frame = region.getByTestId('designer-frame');
  await frame.scrollIntoViewIfNeeded();
  const [box, target] = [await frame.boundingBox(), await frame.getByText(text).boundingBox()];
  if (!box || !target) throw new Error(`No ${text} in the frame`);
  await frame.tap({ position: { x: target.x - box.x + target.width / 2, y: target.y - box.y + target.height / 2 } });
}

/** A finger held on `handle` and moved to the top of `to`, as Chromium gets a real one's touches. */
async function dragByTouch(page: Page, handle: Locator, to: Locator): Promise<void> {
  await handle.scrollIntoViewIfNeeded();
  const [from, onto] = [await handle.boundingBox(), await to.boundingBox()];
  if (!from || !onto) throw new Error('Nothing to drag');
  const x = from.x + from.width / 2;
  const [start, end] = [from.y + from.height / 2, onto.y + 4];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: start }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: start + ((end - start) * i) / 8 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
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

test.describe('the designer, phone held sideways 844×390', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

  test('the hut’s own screen designed, its frame turned, a widget dragged by touch, every part in reach', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    touch(true);
    const errors = watchErrors(page);
    const panel = await importDesignerHut(page, HUT);
    await panel.getByRole('button', { name: /^hut/ }).tap();
    const hut = page.getByRole('region', { name: 'Screen hut' });
    await hut.getByLabel('Device').selectOption({ label: 'Phone, 390 × 844' });
    await hut.getByRole('button', { name: 'Turn' }).tap();
    await expect(hut.getByTestId('designer-breakpoint')).toHaveText('844 × 390, lays out as landscape');
    await pick(hut, 'Main: Stack');
    await expectFrameFits(hut);
    await expectInReach(page);
    // The frame is a picture of the game: nothing in it takes focus.
    const drawn = hut.getByTestId('designer-frame').getByText('Rest a day');
    const focused = await drawn.evaluate((button) => {
      button.focus();
      return document.activeElement === button;
    });
    expect(focused).toBe(false);

    // A finger on a handle moves its widget among its siblings, where the browser would scroll.
    const row = (label: string) => outline(hut).locator('li', { hasText: label });
    await dragByTouch(page, row('Rest a day').locator('[data-target]'), row('Carry a load up'));
    await expect
      .poll(async () => JSON.parse(await storedScreen(page, 'hut')).main.children[2].children[0].label)
      .toBe('Rest a day');
    await page.getByRole('button', { name: 'Undo: Move in hut' }).tap();
    await expect.poll(() => storedScreen(page, 'hut')).toBe(fixtureScreen('hut'));
    touch(false);
    expect(errors).toEqual([]);
  });
});
