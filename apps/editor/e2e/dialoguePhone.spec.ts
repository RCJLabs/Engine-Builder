/**
 * M3.8 on phones, portrait and landscape: the dialogue kit ticked by touch, a talk's start, a line
 * with an option that rolls two outcomes, and the line the better one leads to, filled in in the
 * inspector's sheet; then the map's box for that line tapped, which opens its line's form. All in
 * reach, with nothing past the screen's edge.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { stored } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';

async function expectFits(page: Page, scope: string): Promise<void> {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, scope)).toEqual([]);
  await expectNoAxeIssues(page);
}

/** An item tapped into a list in `scope`, once it shows. */
async function tapAdd(scope: Locator, list: string, n: number): Promise<Locator> {
  await scope.getByRole('button', { name: `Add to ${list}`, exact: true }).tap();
  const item = scope.getByRole('group', { name: `${list}, item ${n}`, exact: true });
  await expect(item).toBeVisible();
  return item;
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 740, height: 360 },
]) {
  test.describe(`dialogue, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('the dialogue kit ticked by touch, a line whose option rolls, and its map, all in reach', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('./');
      await showProject(page);
      await page.getByRole('button', { name: 'New project' }).tap();
      await page.getByLabel('Name').fill('Crag');
      await page.getByRole('button', { name: 'Create' }).tap();
      await expect(openProject(page).getByRole('heading', { name: 'Crag' })).toBeVisible();
      await openProject(page).getByRole('group', { name: 'Kits' }).getByLabel('Dialogue', { exact: true }).tap();
      await expectFits(page, '[data-panel="project"]');

      await page.getByRole('tab', { name: 'Records' }).tap();
      await page.getByLabel('Type', { exact: true }).selectOption('talk');
      await page.getByRole('button', { name: 'New talk', exact: true }).tap();
      await page.getByLabel('Name of the new talk').fill('Marge');
      await page.getByRole('button', { name: 'Create' }).tap();
      const talk = page.getByRole('region', { name: 'Talk marge' });
      await expect(talk).toBeVisible();

      const start = await tapAdd(talk, 'Starts', 1);
      await start.getByLabel(/^Line/).fill('hello');
      const hello = await tapAdd(talk, 'Lines', 1);
      await hello.getByLabel('Id', { exact: true }).fill('hello');
      await hello.getByLabel(/^Text/).fill('First time at the crag?');
      const send = await tapAdd(hello, 'Options', 1);
      await send.getByLabel('Id', { exact: true }).fill('send');
      await send.getByLabel('Label', { exact: true }).fill('Watch me send it');
      const sent = await tapAdd(send, 'Outcomes', 1);
      await send.getByRole('button', { name: 'Add to Outcomes', exact: true }).tap();
      const fell = send.getByRole('group', { name: 'Outcomes, item 2', exact: true });
      // Focus goes to the item added once it shows; a fill into the box focus is already in makes
      // no event first, so it waits for that move (M3.7).
      await expect(fell.getByRole('textbox', { name: /^Chance/ })).toBeFocused();
      await sent.getByRole('textbox', { name: /^Chance/ }).fill('60');
      await sent.getByLabel(/^Leads to/).fill('sent');
      await fell.getByRole('textbox', { name: /^Chance/ }).fill('40');
      const line = await tapAdd(talk, 'Lines', 2);
      await line.getByLabel('Id', { exact: true }).fill('sent');
      await line.getByLabel(/^Text/).fill('Clean!');
      await expect
        .poll(() => stored(page, 'crag', 'records/talk/marge.json'))
        .toEqual({
          name: 'Marge',
          starts: [{ line: 'hello' }],
          lines: [
            {
              id: 'hello',
              text: 'First time at the crag?',
              options: [
                {
                  id: 'send',
                  label: 'Watch me send it',
                  outcomes: [
                    { chance: 60, effects: [], next: 'sent' },
                    { chance: 40, effects: [] },
                  ],
                },
              ],
            },
            { id: 'sent', text: 'Clean!' },
          ],
        });

      // The map, at the top of the form: a tap on a box opens its line.
      const map = talk.getByRole('region', { name: 'Map of the talk' });
      await expect(map.getByRole('heading', { name: '1 step on', exact: true })).toBeVisible();
      await map.getByRole('button', { name: /^sent/ }).tap();
      await expect(line.getByLabel(/^Text/)).toBeFocused();
      await expectFits(page, '[data-panel="inspector"]');
      expect(errors).toEqual([]);
    });
  });
}
