/**
 * M6.8's gate in the editor (D80, docs/specs/barter.md#the-gate), at 1280 and 390 wide: the post comes
 * in with no holds, no purse, no shop's actor and no Container screen. Hild's Purse, the shop's Actor
 * and the chest's Holds set with forms, E089 shown while the chest also takes, the Container screen
 * from its stock template, each file as the fixture has it; and in Play the chest opens with its bread.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { hands, keySteer } from './campHelpers.ts';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { press, showInspector, showOutliner } from './componentHelpers.ts';
import { importZip } from './hollowsHelpers.ts';
import { showPlay, topScreen } from './hutScreens.ts';
import { fixtureZip, stored } from './kitHelpers.ts';
import { recordLink, showTable } from './ludus.ts';
import { POST, playPost, walkSteer, walkTo } from './postHelpers.ts';
import { outlinerRow, showScene, viewStarted } from './spaceHelpers.ts';
import { settled } from './walkHelpers.ts';

const FOLDER = 'post';
const TAKES = 'It holds items and takes the object: once taken, it could never be opened';

type Space = { objects: { id: string; components?: { interact?: Record<string, unknown> } }[] };

const fixture = (path: string): unknown => JSON.parse(readFileSync(join(POST, path), 'utf8'));
const chestOf = (space: unknown) => (space as Space | null)?.objects.find((o) => o.id === 'chest');

/** The post as a zip with no holds, no purse, no shop's actor and no Container screen. */
function postBare(): string {
  const dir = mkdtempSync(join(tmpdir(), 'post-'));
  cpSync(POST, dir, { recursive: true });
  const edit = (path: string, change: (value: Record<string, unknown>) => void) => {
    const file = join(dir, path);
    const value = JSON.parse(readFileSync(file, 'utf8'));
    change(value);
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  };
  edit('spaces/yard.json', (yard) => {
    for (const object of (yard as unknown as Space).objects) delete object.components?.interact?.holds;
  });
  edit('records/actor/hild.json', (hild) => delete hild.purse);
  edit('records/shop/post.json', (shop) => delete shop.actor);
  rmSync(join(dir, 'ui/container.json'));
  return fixtureZip(dir, FOLDER);
}

async function openRecordAt(page: Page, title: string, id: string, touch: boolean): Promise<Locator> {
  await press(recordLink(await showTable(page, title), id), touch);
  const form = page.getByRole('region', { name: `${title.toLowerCase()} ${id}` });
  await expect(form).toBeVisible();
  return form;
}

async function showProblems(page: Page, touch: boolean): Promise<Locator> {
  await press(page.getByRole('tab', { name: /^Problems/ }), touch);
  const panel = page.locator('[data-panel="problems"]');
  await expect(panel.getByRole('heading', { name: 'Problems' })).toBeVisible();
  return panel;
}

/** A line added to a map field of items or resources: its key picked, its number typed. */
async function addLine(form: Locator, field: string, option: RegExp, key: string, n: number, touch: boolean) {
  await press(form.getByRole('button', { name: `Add to ${field}` }), touch);
  await press(
    form
      .page()
      .getByRole('dialog', { name: `Add to ${field}` })
      .getByRole('option', { name: option }),
    touch,
  );
  const box = form.getByRole('textbox', { name: `${field}: ${key}` });
  await box.fill(String(n));
  await box.press('Tab');
}

async function makeMerchant(page: Page, touch: boolean): Promise<void> {
  await test.step('Hild’s Purse: three coin', async () => {
    const hild = await openRecordAt(page, 'Actor', 'hild', touch);
    await addLine(hild, 'Purse', /Coin/, 'coin', 3, touch);
    await expect
      .poll(() => stored(page, FOLDER, 'records/actor/hild.json'))
      .toEqual(fixture('records/actor/hild.json'));
  });
  await test.step('the shop’s Actor: Hild', async () => {
    const shop = await openRecordAt(page, 'Shop', 'post', touch);
    await press(shop.getByRole('button', { name: /^Actor/ }), touch);
    await press(
      page.getByRole('dialog', { name: 'Choose an actor' }).getByRole('option', { name: 'Hild (hild)' }),
      touch,
    );
    await expect.poll(() => stored(page, FOLDER, 'records/shop/post.json')).toEqual(fixture('records/shop/post.json'));
  });
}

async function fillChest(page: Page, touch: boolean): Promise<void> {
  await test.step('the chest’s Holds: two bread and a candle, E089 while it takes too', async () => {
    const panel = await showScene(page);
    await press(panel.getByRole('button', { name: /^The yard \(yard\)/ }), touch);
    await viewStarted(page);
    await press(outlinerRow(await showOutliner(page, touch), 'Chest'), touch);
    const form = await showInspector(page, touch);
    await expect(form.getByRole('heading', { name: 'Chest (chest)', exact: true })).toBeVisible();
    await addLine(form, 'Holds', /Bread/, 'bread', 2, touch);
    await addLine(form, 'Holds', /Candle/, 'candle', 1, touch);
    await expect
      .poll(async () => chestOf(await stored(page, FOLDER, 'spaces/yard.json')))
      .toEqual(chestOf(fixture('spaces/yard.json')));
    const takes = form.getByLabel(/^Takes/);
    await press(takes, touch);
    await expect((await showProblems(page, touch)).getByText(TAKES)).toBeVisible();
    await press(takes, touch);
    await expect((await showProblems(page, touch)).getByText(TAKES)).toHaveCount(0);
    if (touch) {
      const inspector = await showInspector(page, touch);
      await expect(inspector.getByRole('textbox', { name: 'Holds: bread' })).toBeVisible();
      // Holds in reach on a phone: nothing off the screen, every target 44 px, nothing axe finds.
      await expectNothingOffscreen(page);
      expect(await smallTargets(page, '[data-panel="inspector"]')).toEqual([]);
      await expectNoAxeIssues(page);
    }
  });
}

async function newContainerScreen(page: Page, touch: boolean): Promise<void> {
  await test.step('the Container screen from its stock template', async () => {
    const panel = await showPlay(page);
    await press(panel.getByRole('button', { name: 'Run its scripts' }), touch);
    // The game's modes come once its scripts have run: then the chest's container mode is one.
    await expect(panel.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await press(panel.getByRole('button', { name: 'New screen' }), touch);
    await panel.getByLabel('Template').selectOption({ label: 'Container' });
    await expect(panel.getByLabel('Name of the new screen')).toHaveValue('Container');
    await press(panel.getByRole('button', { name: 'Create' }), touch);
    await expect.poll(() => stored(page, FOLDER, 'ui/container.json')).toEqual(fixture('ui/container.json'));
  });
}

for (const [width, height, touch] of [
  [1280, 800, false],
  [390, 844, true],
] as const) {
  test.describe(`the post made a trading post in the editor, ${width} wide`, () => {
    test.use({ viewport: { width, height }, ...(touch ? { hasTouch: true, isMobile: true } : {}) });

    test('Hild’s purse, the shop’s actor and the chest’s holds set with forms, and played', async ({ page }) => {
      test.setTimeout(400_000);
      const errors = watchErrors(page);
      await importZip(page, postBare(), 'The post', touch);
      await makeMerchant(page, touch);
      await fillChest(page, touch);
      await newContainerScreen(page, touch);

      await test.step('in Play, the chest opens with its bread', async () => {
        const yard = await playPost(page, touch, true);
        if (!touch) await yard.focus();
        await settled(page);
        const steer = touch ? walkSteer(page, yard, await hands(page)) : keySteer(page, yard);
        await walkTo(page, steer, 'chest');
        await steer.use();
        const screen = topScreen(page);
        await expect(screen.getByRole('heading', { name: 'Chest' })).toBeVisible();
        await expect(screen.getByRole('button', { name: 'Take Bread (2)' })).toBeVisible();
      });
      expect(errors).toEqual([]);
    });
  });
}
