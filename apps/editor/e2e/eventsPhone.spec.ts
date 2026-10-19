/**
 * M3.7 on phones, portrait and landscape: the events kit ticked by touch, and an event's choice
 * with two outcomes, the worse holding a consequence with an event to open inside it, filled in
 * in the inspector's sheet: lists in lists, all in reach.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { stored } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';

async function expectFits(page: Page, scope: string): Promise<void> {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, scope)).toEqual([]);
  await expectNoAxeIssues(page);
}

async function newEvent(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name: 'Records' }).tap();
  await page.getByLabel('Type', { exact: true }).selectOption('event');
  await page.getByRole('button', { name: 'New event', exact: true }).tap();
  await page.getByLabel('Name of the new event').fill(name);
  await page.getByRole('button', { name: 'Create' }).tap();
  await expect(page.getByRole('region', { name: `Event ${name.toLowerCase()}` })).toBeVisible();
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 740, height: 360 },
]) {
  test.describe(`events, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('the events kit ticked by touch, and a choice’s outcomes and a consequence, all in reach', async ({
      page,
    }) => {
      const errors = watchErrors(page);
      await page.goto('./');
      await showProject(page);
      await page.getByRole('button', { name: 'New project' }).tap();
      await page.getByLabel('Name').fill('Road');
      await page.getByRole('button', { name: 'Create' }).tap();
      await expect(openProject(page).getByRole('heading', { name: 'Road' })).toBeVisible();
      const kits = openProject(page).getByRole('group', { name: 'Kits' });
      await kits.getByLabel('Events', { exact: true }).tap();
      await kits.getByLabel('Time', { exact: true }).tap();
      await expectFits(page, '[data-panel="project"]');

      await newEvent(page, 'Pursuit');
      await newEvent(page, 'Raiders');
      const form = page.getByRole('region', { name: 'Event raiders' });
      await form.getByRole('button', { name: 'Add to Choices' }).tap();
      const fight = form.getByRole('group', { name: 'Choices, item 1', exact: true });
      await fight.getByLabel('Id', { exact: true }).fill('fight');
      await fight.getByLabel('Label', { exact: true }).fill('Fight');
      await fight.getByRole('button', { name: 'Add to Outcomes' }).tap();
      await fight.getByRole('button', { name: 'Add to Outcomes' }).tap();
      const better = fight.getByRole('group', { name: 'Outcomes, item 1', exact: true });
      const worse = fight.getByRole('group', { name: 'Outcomes, item 2', exact: true });
      await better.getByRole('textbox', { name: /^Chance/ }).fill('60');
      await worse.getByRole('textbox', { name: /^Chance/ }).fill('40');
      await worse.getByLabel('Effect to add to Effects', { exact: true }).selectOption({ label: 'Do later' });
      await worse.getByRole('button', { name: 'Add effect to Effects', exact: true }).tap();
      await worse.getByRole('group', { name: 'After', exact: true }).getByLabel(/^Days/).fill('2');
      await worse.getByLabel('Effect to add to Do', { exact: true }).selectOption({ label: 'Open an event' });
      await worse.getByRole('button', { name: 'Add effect to Do', exact: true }).tap();
      await worse
        .getByRole('group', { name: 'Do', exact: true })
        .getByRole('button', { name: /^Event/ })
        .tap();
      await page
        .getByRole('dialog', { name: 'Choose an event' })
        .getByRole('option', { name: 'Pursuit (pursuit)' })
        .tap();
      await expect
        .poll(() => stored(page, 'road', 'records/event/raiders.json'))
        .toMatchObject({
          choices: [
            {
              id: 'fight',
              outcomes: [
                { chance: 60 },
                {
                  chance: 40,
                  effects: [{ effect: 'later', after: { days: 2 }, do: [{ effect: 'open-event', event: 'pursuit' }] }],
                },
              ],
            },
          ],
        });
      await expectFits(page, '[data-panel="inspector"]');
      expect(errors).toEqual([]);
    });
  });
}
