import { expect, type Page, test } from '@playwright/test';
import { expectNoSeriousAxeIssues, expectNothingOffscreen, watchErrors } from './checks.ts';

const visiblePanels = (page: Page) =>
  page.locator('.panel').evaluateAll((els) => els.map((el) => el.getAttribute('data-panel')));

// The phone runs check the dark theme and the desktop runs the light one, so axe sees both palettes.
test.describe('phone portrait 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });

  test('shows one panel and a bottom tab bar that switches it', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await expect(page.locator('.shell')).toHaveAttribute('data-layout', 'phone');
    expect(await visiblePanels(page)).toEqual(['world']);

    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(5);
    const bar = await page.locator('.tabs').boundingBox();
    expect(bar && bar.y + bar.height).toBeGreaterThan(844 - 90); // sits at the bottom

    for (const box of await tabs.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
      expect(box).toBeGreaterThanOrEqual(44); // touch targets
    }

    await page.getByRole('tab', { name: 'Logic' }).tap();
    expect(await visiblePanels(page)).toEqual(['logic']);
    await expect(page.getByRole('tab', { name: 'Logic' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.console')).toHaveCount(0);

    await expectNothingOffscreen(page);
    await expectNoSeriousAxeIssues(page);
    expect(errors).toEqual([]);
  });
});

test.describe('phone landscape 844×390', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });

  test('uses the two-pane tablet layout', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await expect(page.locator('.shell')).toHaveAttribute('data-layout', 'tablet');
    expect(await visiblePanels(page)).toEqual(['world', 'inspector']);
    await page.getByRole('tab', { name: 'Project' }).tap();
    expect(await visiblePanels(page)).toEqual(['world', 'project']);
    await expectNothingOffscreen(page);
    await expectNoSeriousAxeIssues(page);
    expect(errors).toEqual([]);
  });
});

test.describe('desktop 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });

  test('shows three zones and the console, with keyboard tabs', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await expect(page.locator('.shell')).toHaveAttribute('data-layout', 'desktop');
    expect(await visiblePanels(page)).toEqual(['project', 'world', 'inspector']);
    await expect(page.locator('.console')).toContainText('Engine-Builder');

    const project = page.getByRole('tab', { name: 'Project' });
    await project.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Logic' })).toBeFocused();
    expect(await visiblePanels(page)).toEqual(['logic', 'world', 'inspector']);

    await expectNothingOffscreen(page);
    await expectNoSeriousAxeIssues(page);
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
    await expect(page.getByRole('heading', { name: 'World' })).toBeVisible();
    await context.setOffline(false);
    expect(errors).toEqual([]);
  });
});
