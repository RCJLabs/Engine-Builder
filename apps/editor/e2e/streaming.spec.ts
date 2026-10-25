/**
 * M5.10's streaming gate on desktop (D72, docs/specs/streaming.md#the-gate): the moor, a kilometre
 * across, played in the Play panel and walked by keys up its road. The ring around the start built
 * under the loading screen; two cells crossed, each building the next ring and taking down what
 * left the kept one; the far drawn as instanced models, none past the view distance; the cairn's
 * zone heard once its cell is built; and the chest on the road taken by E. Everything read through
 * window.__ebWalk. How long a frame spends building is a reading, not a pass mark.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { acted, offered, promptButton, watchLoading } from './glenHelpers.ts';
import { game } from './hutScreens.ts';
import { cells, openMoor, placedIn, recordRings } from './streamingHelpers.ts';
import { holdUntilPast, settled, walked } from './walkHelpers.ts';

test('the moor by keys: its rings built and taken down, the far drawn, the cairn and the chest', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = watchErrors(page);
  const loadings = await watchLoading(page);
  const moor = await openMoor(page);
  await moor.focus();
  await settled(page);
  // Inside the start's 3×3 (cells x −1 to 1, z −1 to 1) and outside it.
  const southRow = placedIn(64, 128, -64, 128);
  // The chest stands on the cells' edge at z −128, so its footprint is in this row and the next.
  const twoNorth = [...placedIn(-128, -64, -64, 128), 'chest'];
  expect(southRow.length).toBeGreaterThan(3);
  expect(twoNorth).toEqual(expect.arrayContaining(['cairn', 'cairn-zone']));

  await test.step('the start’s ring built whole under the loading screen, the far drawn as instances', async () => {
    expect(await loadings()).toEqual(['status: The moorLoading…']);
    const first = await cells(page);
    expect(first.cell).toEqual([0, 0]);
    expect(first.waiting).toBe(0);
    expect(first.drawn).toEqual(first.near);
    expect(first.near).toEqual(expect.arrayContaining(southRow));
    for (const id of twoNorth) expect(first.near).not.toContain(id);
    expect(first.zones).toBe(0);
    expect(first.uses).toBe(0);
    expect(first.bodies).toBeGreaterThan(first.near.length / 2);
    expect(first.view).toBe(250);
    expect(first.far.models).toBeGreaterThan(first.near.length);
    expect(first.far.meshes).toBeLessThan(first.far.models / 10);
    // The pine's far meshes at its LOD's coarsest level; the rest at their only one.
    expect(first.far.levels).toContain(1);
    expect(first.farthest).toBeLessThanOrEqual(first.view);
  });

  await test.step('up the road at a run: two cells crossed, the cairn’s cell built first and the south row taken down', async () => {
    const rings = await recordRings(page);
    await holdUntilPast(page, ['ShiftLeft', 'KeyW'], 'z', { atMost: -118.5 }, 90_000);
    const seen = await rings();
    expect(seen.map((r) => r.cell)).toEqual([
      [0, 0],
      [0, -1],
      [0, -2],
    ]);
    const [, one, two] = seen;
    // Into the cell before it: the cairn's cell comes near, and its zone is heard.
    expect(one?.near).toEqual(expect.arrayContaining(twoNorth));
    expect(one?.near).toEqual(expect.arrayContaining(southRow));
    expect(one?.zones).toBe(1);
    // Into the cairn's: the south row is three cells off, past the kept 5×5.
    for (const id of southRow) expect(two?.near).not.toContain(id);
    expect(two?.farthest).toBeLessThanOrEqual(250);
    await expect.poll(async () => (await cells(page)).waiting, { timeout: 30_000 }).toBe(0);
    const now = await cells(page);
    expect(now.drawn).toEqual(now.near);
    expect((await walked(page)).sent).toEqual([{ object: 'cairn-zone', sent: 'accepted' }]);
    await expect(game(page).getByText('The cairn is reached.')).toBeVisible();
    test
      .info()
      .annotations.push({ type: 'reading', description: `slowest frame's building: ${now.slowest.toFixed(1)} ms` });
  });

  await test.step('on to the chest on the road, which stops the walk: E takes it', async () => {
    await holdUntilPast(page, ['KeyW'], 'z', { atMost: -126.8 }, 60_000);
    await settled(page);
    await offered(page, 'chest');
    await expect(promptButton(moor)).toHaveText('TakeE');
    await page.keyboard.press('KeyE');
    await expect.poll(async () => (await acted(page)).taken).toEqual(['chest']);
    expect((await acted(page)).hidden).toEqual(['chest']);
    await expect(game(page).getByText('Lantern 1')).toBeVisible();
    expect((await cells(page)).uses).toBe(1);
  });

  expect(errors).toEqual([]);
});
