/**
 * What M5.1's specs share (D63): the Scene panel shown on any layout, a space or prefab made and
 * opened, Add, the gizmo's handles and the objects found through (window as unknown as Hooked).__ebViewport, and drags by
 * mouse or by touch through CDP, as mapsPhone.spec.ts drags a drawn map's places.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** The view's hook, as viewport.ts keeps it. */
type Hooked = {
  __ebViewport?: {
    frames: number;
    grips(): Grip[];
    objectAt(id: string, underHandles?: boolean): { x: number; y: number } | null;
    camera(): { target: [number, number, number]; yaw: number; pitch: number; distance: number };
  };
};

export const scenePanel = (page: Page): Locator => page.locator('[data-panel="scene"]');

/** The Scene panel: a tab in the wide zones, behind More on a phone. */
export async function showScene(page: Page): Promise<Locator> {
  const tab = page.getByRole('tab', { name: 'Scene' });
  if (await tab.isVisible()) await tab.click();
  else {
    await page.getByRole('tab', { name: 'More' }).click();
    await page
      .locator('[data-panel="more"]')
      .getByRole('button', { name: /^Scene/ })
      .click();
  }
  const panel = scenePanel(page);
  await expect(
    panel.getByRole('heading', { name: 'Spaces' }).or(panel.getByRole('button', { name: 'Back to the list' })),
  ).toBeVisible();
  return panel;
}

/** A new space or prefab, named in the list: it opens, its view started. */
export async function newSpaceFile(page: Page, kind: 'space' | 'prefab', name: string): Promise<void> {
  const panel = scenePanel(page);
  await panel.getByRole('button', { name: `New ${kind}` }).click();
  await panel.getByLabel(`Name of the new ${kind}`).fill(name);
  await panel.getByRole('button', { name: 'Create' }).click();
  await viewStarted(page);
}

export async function viewStarted(page: Page): Promise<void> {
  await expect(scenePanel(page).locator('.scene-view[data-backend]')).toBeVisible({ timeout: 20_000 });
}

/** Add, then a shape's or a prefab's button. */
export async function add(page: Page, label: string): Promise<void> {
  const panel = scenePanel(page);
  await panel.getByRole('button', { name: 'Add', exact: true }).click();
  await panel.getByRole('group', { name: 'Add' }).getByRole('button', { name: label, exact: true }).click();
}

export interface Grip {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly along: readonly [number, number];
}

/** Where to take hold of a handle, once the view has drawn it. */
export async function grip(page: Page, name: string): Promise<Grip> {
  await expect
    .poll(() =>
      page.evaluate(
        (name) => (window as unknown as Hooked).__ebViewport?.grips().some((g) => g.name === name) ?? false,
        name,
      ),
    )
    .toBe(true);
  return page.evaluate(
    (name) => (window as unknown as Hooked).__ebViewport?.grips().find((g) => g.name === name) as Grip,
    name,
  );
}

/** A point on an object clear of the gizmo, or anywhere on it with `underHandles`, in page pixels. */
export async function objectAt(page: Page, id: string, underHandles = false): Promise<{ x: number; y: number }> {
  const at = () =>
    page.evaluate(([id, under]) => (window as unknown as Hooked).__ebViewport?.objectAt(id, under) ?? null, [
      id,
      underHandles,
    ] as const);
  await expect.poll(at).not.toBeNull();
  return (await at()) as { x: number; y: number };
}

/** Where the view's camera is: its target, yaw, pitch and distance. */
export const camera = (page: Page) =>
  page.evaluate(
    () => (window as unknown as Hooked).__ebViewport?.camera() ?? { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 0 },
  );

export const frames = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as Hooked).__ebViewport?.frames ?? -1);

/** A drag by the mouse from a handle `px` pixels along it, in steps as a hand moves. */
export async function dragMouse(page: Page, from: Grip, px: number, modifiers: { ctrl?: boolean } = {}): Promise<void> {
  await page.mouse.move(from.x, from.y);
  if (modifiers.ctrl) await page.keyboard.down('Control');
  await page.mouse.down();
  for (let i = 1; i <= 10; i++)
    await page.mouse.move(from.x + (from.along[0] * px * i) / 10, from.y + (from.along[1] * px * i) / 10);
  await page.mouse.up();
  if (modifiers.ctrl) await page.keyboard.up('Control');
}

/** A drag by one finger, from a point `px` pixels along `along`. */
export async function dragTouch(
  page: Page,
  from: { x: number; y: number },
  along: readonly [number, number],
  px: number,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + (along[0] * px * i) / 10, y: from.y + (along[1] * px * i) / 10 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  // A finger is off the glass a while before it taps again. Chrome drops a tap that comes within
  // about 50 ms of a drag's end (2026-10-24, 360×740: 10 of 20 taps lost straight after, 12 of 20
  // after 50 ms, none after 100 ms), and on CI each phone's first tap after the camera was levelled was.
  await page.waitForTimeout(250);
}

/** Two fingers spreading apart from the middle of the view: a pinch that zooms in. */
export async function pinchOut(page: Page): Promise<void> {
  const box = await scenePanel(page).locator('.scene-view').boundingBox();
  if (!box) throw new Error('No view to pinch');
  const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
  const cdp = await page.context().newCDPSession(page);
  const at = (gap: number) => [
    { x: cx - gap, y: cy, id: 1 },
    { x: cx + gap, y: cy, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(20) });
  for (let i = 1; i <= 8; i++)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(20 + i * 8) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** The outliner's row for an object, by the name it shows. */
export const outlinerRow = (scope: Locator, name: string): Locator =>
  scope
    .locator('.outliner-row')
    .filter({ has: scope.page().locator('.outliner-name', { hasText: new RegExp(`^${name}$`) }) });
