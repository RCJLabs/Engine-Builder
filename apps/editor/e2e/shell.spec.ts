import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, watchErrors } from './checks.ts';

const visiblePanels = (page: Page) =>
  page.locator('.panel').evaluateAll((els) => els.map((el) => el.getAttribute('data-panel')));

// The phone runs check the dark theme and the desktop runs the light one, so axe sees both palettes.
test.describe('phone portrait 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });

  test('shows one panel and a bottom tab bar that switches it', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await expect(page.locator('.shell')).toHaveAttribute('data-layout', 'phone');
    expect(await visiblePanels(page)).toEqual(['project']);

    // The inspector is the sheet's (layout.spec.ts); Logic is fourth since M3.1 (D36), and the
    // placeholders wait for their phases (D35).
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveText(['Project', 'Records', 'Assets', 'Logic', 'Problems', 'Console']);
    const bar = await page.locator('.tabs').boundingBox();
    expect(bar && bar.y + bar.height).toBeGreaterThan(844 - 90); // sits at the bottom

    for (const box of await tabs.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
      expect(box).toBeGreaterThanOrEqual(44); // touch targets
    }

    await page.getByRole('tab', { name: 'Problems' }).tap();
    expect(await visiblePanels(page)).toEqual(['problems']);
    await expect(page.getByRole('tab', { name: 'Problems' })).toHaveAttribute('aria-selected', 'true');
    // The console is a tab of its own on a phone (M2.8), with the build's line in it.
    await page.getByRole('tab', { name: 'Console' }).tap();
    await expect(page.locator('[data-panel="console"]')).toContainText('Engine-Builder');

    await expectNothingOffscreen(page);
    await expectNoAxeIssues(page);
    expect(errors).toEqual([]);
  });
});

test.describe('phone landscape 844×390', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });

  test('uses the two-pane tablet layout', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await expect(page.locator('.shell')).toHaveAttribute('data-layout', 'tablet');
    // The Records panel leads the main zone (M2.5); the World panel waits for Phase 4.
    expect(await visiblePanels(page)).toEqual(['records', 'inspector']);
    await page.getByRole('tab', { name: 'Project' }).tap();
    expect(await visiblePanels(page)).toEqual(['records', 'project']);
    await expectNothingOffscreen(page);
    await expectNoAxeIssues(page);
    expect(errors).toEqual([]);
  });
});

test.describe('desktop 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });

  test('docks the panels in three groups over the console, with keyboard tabs', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await expect(page.locator('.shell')).toHaveAttribute('data-layout', 'desktop');
    await expect(page.locator('.dock-host')).toHaveAttribute('data-dock', 'docked');
    expect(await visiblePanels(page)).toEqual(['project', 'records', 'inspector']);
    await expect(page.locator('.console')).toContainText('Engine-Builder');

    // dockview's tabs activate by hand: the arrows move focus and Enter shows the panel.
    const project = page.getByRole('tab', { name: 'Project' });
    await project.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Logic' })).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await visiblePanels(page)).toEqual(['logic', 'records', 'inspector']);

    await expectNothingOffscreen(page);
    await expectNoAxeIssues(page);
    expect(errors).toEqual([]);
  });

  test('ships a manifest, icons and a version file for the deploy check', async ({ page, request }) => {
    await page.goto('./');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const manifest = await (await request.get(new URL(href ?? '', page.url()).toString())).json();
    expect(manifest.start_url).toBe('/');
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);
    for (const icon of manifest.icons as { src: string }[]) {
      expect((await request.get(new URL(icon.src, page.url()).toString())).ok(), icon.src).toBe(true);
    }
    const version = await (await request.get('version.json')).json();
    expect(version.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(version.sha).toMatch(/^[0-9a-f]{40}$|^unknown$/);
  });

  test('opens offline once the service worker has it', async ({ page, context }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // The worker controls pages loaded after it activates.
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.shell')).toHaveAttribute('data-layout', 'desktop');
    // The dock's own chunk came from the cache too, or the fixed zones would stand in.
    await expect(page.locator('.dock-host')).toHaveAttribute('data-dock', 'docked');
    await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible();
    await context.setOffline(false);
    expect(errors).toEqual([]);
  });
});
