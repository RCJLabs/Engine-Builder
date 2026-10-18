/**
 * M2.2's layouts: the desktop dock (moving tabs, the saved layout, reset), the command palette by
 * keyboard and by touch, and the phone's inspector sheet, at both phone widths and on its side.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';

const LAYOUT_KEY = 'eb-editor:dock-layout';
const FIRST_LAYOUT = ['Project+Logic', 'Records+Assets+World+Play', 'Inspector', 'Console+Problems'];
/** Storage keeps panel ids, which are the tab titles in lower case. */
const ids = (groups: string[]) => groups.map((group) => group.toLowerCase());

/** Each dock group's tabs, in the dock's order, as "A+B". */
const groups = (page: Page) =>
  page
    .locator('.dv-groupview')
    .evaluateAll((els) => els.map((g) => [...g.querySelectorAll('.dv-tab')].map((t) => t.textContent).join('+')));

/** The groups in the layout this browser saved, read straight from storage. */
const savedGroups = (page: Page) =>
  page.evaluate((key) => {
    type Node = { type: 'leaf'; data: { views: string[] } } | { type: 'branch'; data: Node[] };
    const leaves: string[] = [];
    const walk = (node: Node): void => {
      if (node.type === 'leaf') leaves.push(node.data.views.join('+'));
      else node.data.forEach(walk);
    };
    const text = localStorage.getItem(key);
    if (text) walk(JSON.parse(text).layout.grid.root);
    return leaves;
  }, LAYOUT_KEY);

const groupOf = (page: Page, tab: string) =>
  page.locator('.dv-groupview').filter({ has: page.locator('.dv-tab').getByText(tab, { exact: true }) });

const visiblePanels = (page: Page) =>
  page
    .locator('.panel')
    .evaluateAll((els) =>
      els.filter((el) => el.getClientRects().length > 0).map((el) => el.getAttribute('data-panel')),
    );

/** Drags a dock tab onto a group's centre or bottom edge. dockview listens for native drag events, which Playwright's mouse makes in Chromium. */
async function dragTab(page: Page, tab: string, onto: string, where: 'centre' | 'bottom'): Promise<void> {
  const source = await page.locator('.dv-tab').getByText(tab, { exact: true }).boundingBox();
  const target = await groupOf(page, onto).locator('.dv-content-container').boundingBox();
  if (!source || !target) throw new Error('tab or group not on screen');
  const x = target.x + target.width / 2;
  const y = where === 'centre' ? target.y + target.height / 2 : target.y + target.height - 12;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y - 60, { steps: 5 });
  await page.mouse.move(x, y, { steps: 10 });
  await page.mouse.up();
}

async function docked(page: Page): Promise<void> {
  await expect(page.locator('.dock-host')).toHaveAttribute('data-dock', 'docked');
}

async function runCommand(page: Page, query: string): Promise<void> {
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('combobox', { name: 'Command' })).toBeFocused();
  await page.keyboard.type(query);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Commands' })).toBeHidden();
}

test.describe('dock, desktop 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });

  test('moves a tab to a new group, keeps it through a reload, and resets', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await docked(page);
    expect(await groups(page)).toEqual(FIRST_LAYOUT);

    await dragTab(page, 'Logic', 'World', 'bottom');
    const moved = ['Project', 'Records+Assets+World+Play', 'Logic', 'Inspector', 'Console+Problems'];
    await expect.poll(() => groups(page)).toEqual(moved);
    const world = await groupOf(page, 'World').boundingBox();
    const logic = await groupOf(page, 'Logic').boundingBox();
    expect(logic && world && logic.y >= world.y + world.height - 2).toBe(true); // below, not beside
    await expect.poll(() => savedGroups(page)).toEqual(ids(moved));

    await page.reload();
    await docked(page);
    expect(await groups(page)).toEqual(moved);

    await runCommand(page, 'reset layout');
    await expect.poll(() => groups(page)).toEqual(FIRST_LAYOUT);
    // Forgotten, not saved, so the dock follows the editor's default; waited past the 300 ms save delay.
    await page.waitForTimeout(600);
    expect(await savedGroups(page)).toEqual([]);
    await expect(page.locator('.dv-dockview')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('moves a tab into another group', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await docked(page);
    await dragTab(page, 'Logic', 'World', 'centre');
    await expect
      .poll(() => groups(page))
      .toEqual(['Project', 'Records+Assets+World+Play+Logic', 'Inspector', 'Console+Problems']);
    expect(await visiblePanels(page)).toEqual(['project', 'logic', 'inspector']);
    expect(errors).toEqual([]);
  });

  test('gives back a panel the saved layout lacks, and starts over from one it can’t use', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await docked(page);
    expect(await savedGroups(page)).toEqual([]); // nothing saved until the layout changes
    await runCommand(page, 'logic panel');
    await expect.poll(() => savedGroups(page)).toEqual(ids(FIRST_LAYOUT));
    // The layout as an editor without a console would have saved it.
    await page.evaluate((key) => {
      type Node = { type: 'leaf'; data: { views: string[] } } | { type: 'branch'; data: Node[] };
      const saved = JSON.parse(localStorage.getItem(key) ?? '');
      delete saved.layout.panels.console;
      const keep = (node: Node): boolean => {
        if (node.type === 'leaf') return !node.data.views.includes('console');
        node.data = node.data.filter(keep);
        return node.data.length > 0;
      };
      keep(saved.layout.grid.root);
      localStorage.setItem(key, JSON.stringify(saved));
    }, LAYOUT_KEY);
    await page.reload();
    await docked(page);
    expect((await groups(page)).join('+').split('+').sort()).toEqual(
      ['Assets', 'Console', 'Inspector', 'Logic', 'Play', 'Problems', 'Project', 'Records', 'World'].sort(),
    );

    await page.evaluate((key) => {
      const broken = { format: 1, layout: { grid: { root: 7 }, panels: { project: { contentComponent: 'project' } } } };
      localStorage.setItem(key, JSON.stringify(broken));
    }, LAYOUT_KEY);
    await page.reload();
    await docked(page);
    expect(await groups(page)).toEqual(FIRST_LAYOUT);
    await expect(page.locator('.console')).toContainText('The saved layout couldn’t be restored');
    expect(errors).toEqual([]);
  });

  test('puts the panels a saved layout lacks beside the panels they go with', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await docked(page);
    await runCommand(page, 'logic panel');
    await expect.poll(() => savedGroups(page)).toEqual(ids(FIRST_LAYOUT));
    // The layout as an editor before M2.7 and M2.8 would have saved it: no Assets, no Problems.
    await page.evaluate((key) => {
      type Node = { type: 'leaf'; data: { views: string[] } } | { type: 'branch'; data: Node[] };
      const gone = ['assets', 'problems'];
      const saved = JSON.parse(localStorage.getItem(key) ?? '');
      for (const id of gone) delete saved.layout.panels[id];
      const drop = (node: Node): void => {
        if (node.type === 'leaf') node.data.views = node.data.views.filter((view) => !gone.includes(view));
        else node.data.forEach(drop);
      };
      drop(saved.layout.grid.root);
      localStorage.setItem(key, JSON.stringify(saved));
    }, LAYOUT_KEY);
    await page.reload();
    await docked(page);
    expect(await groups(page)).toEqual(['Project+Logic', 'Records+World+Play+Assets', 'Inspector', 'Console+Problems']);
    expect(errors).toEqual([]);
  });

  test('falls back to fixed zones when the dock’s code can’t load', async ({ page }) => {
    await page.route('**/assets/desktopDock-*', (route) => route.abort());
    await page.goto('./');
    await expect(page.locator('main.zones')).toBeVisible();
    expect(await visiblePanels(page)).toEqual(['project', 'records', 'inspector']);
    await expect(page.locator('.console')).toContainText('The dockable layout didn’t load');
    await expectNothingOffscreen(page);
    await expectNoAxeIssues(page);
  });

  test('runs commands from the palette by keyboard', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await docked(page);
    await page.keyboard.press('Control+k');
    const field = page.getByRole('combobox', { name: 'Command' });
    await expect(field).toBeFocused();
    const options = page.getByRole('option');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await expect(field).toHaveAttribute('aria-activedescendant', 'palette-new-project');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(options.last()).toHaveAttribute('aria-selected', 'true'); // wraps
    await expectNoAxeIssues(page);

    await field.fill('play');
    await expect(options).toHaveText(['Show the Play panel']);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Commands' })).toBeHidden();
    expect(await visiblePanels(page)).toEqual(['project', 'play', 'inspector']);
    await expect(page.locator('.dock-panel:has([data-panel="play"])')).toBeFocused(); // focus goes with it

    await page.getByRole('button', { name: 'Commands' }).click();
    await page.keyboard.type('zzz');
    await expect(page.getByText('No command matches “zzz”.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Commands' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Commands' })).toBeFocused(); // focus goes back
    await page.keyboard.press('Control+K'); // as sent with Caps Lock on
    await expect(page.getByRole('dialog', { name: 'Commands' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

for (const [width, height] of [
  [360, 740],
  [390, 844],
] as const) {
  test.describe(`phone ${width}×${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true, colorScheme: 'dark' });

    test('opens the inspector as a sheet above the tab bar', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('./');
      const handle = page.getByRole('button', { name: 'Inspector' });
      const inspector = page.locator('[data-panel="inspector"]');
      await expect(handle).toHaveAttribute('aria-expanded', 'false');
      await expect(inspector).toHaveCount(0); // shut, it isn't built
      const shut = await handle.boundingBox();
      const bar = await page.getByRole('tablist').boundingBox();
      expect(shut && shut.height >= 44).toBe(true);
      expect(shut && bar && Math.abs(shut.y + shut.height - bar.y)).toBeLessThan(2); // sits on the tab bar

      await handle.tap();
      await expect(handle).toHaveAttribute('aria-expanded', 'true');
      expect(await visiblePanels(page)).toEqual(['project', 'inspector']); // the panel keeps a strip above
      const open = await page.getByRole('region', { name: 'Inspector' }).boundingBox();
      expect(open && shut && open.height > shut.height * 4).toBe(true);
      await expectNothingOffscreen(page);
      expect(await smallTargets(page, 'body')).toEqual([]);
      await expectNoAxeIssues(page);

      await page.keyboard.press('Escape');
      await expect(handle).toHaveAttribute('aria-expanded', 'false');
      await handle.tap();
      await handle.tap();
      await expect(handle).toHaveAttribute('aria-expanded', 'false');
      expect(await visiblePanels(page)).toEqual(['project']);
      await expect(inspector).toHaveCount(0);
      expect(errors).toEqual([]);
    });

    test('runs commands from the palette by touch', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('./');
      const palette = page.getByRole('dialog', { name: 'Commands' });
      await page.getByRole('button', { name: 'Commands' }).tap();
      await expect(palette).toBeVisible();
      await expectNothingOffscreen(page);
      expect(await smallTargets(page, 'dialog')).toEqual([]);
      await expectNoAxeIssues(page);

      await page.getByRole('option', { name: 'Show the Problems panel' }).tap();
      await expect(palette).toBeHidden();
      await expect(page.getByRole('tab', { name: 'Problems' })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('tabpanel')).toBeFocused();

      await page.getByRole('button', { name: 'Commands' }).tap();
      await page.getByRole('option', { name: 'Show the Inspector panel' }).tap();
      await expect(page.getByRole('button', { name: 'Inspector' })).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#inspector-sheet-body')).toBeFocused();

      await page.getByRole('button', { name: 'Commands' }).tap();
      await page.getByRole('option', { name: 'New project' }).tap();
      await expect(page.getByRole('tab', { name: 'Project' })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByLabel('Name')).toBeFocused();
      expect(errors).toEqual([]);
    });
  });
}

test.describe('phone on its side 844×390', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });

  test('fits the palette in the short screen', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Commands' }).tap();
    const box = await page.getByRole('dialog', { name: 'Commands' }).boundingBox();
    expect(box && box.y + box.height).toBeLessThanOrEqual(390);
    await expectNothingOffscreen(page);
    expect(await smallTargets(page, 'dialog')).toEqual([]);
    await expectNoAxeIssues(page);
  });
});
